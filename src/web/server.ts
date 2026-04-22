import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  getAllLeads,
  getLeadEmails,
  getEnrichmentByLeadId,
  getStats,
  getLeadsWithEmails,
  getLeadsWithoutEmails,
  getTopScoredLeads,
  getLeadsByEmailStatus,
  getEmailVerificationStats,
  getLeadsNotEnrichedCount,
  getOutreachStats,
  hasReceivedOutreach,
  insertLead,
  insertLeadEmail,
  getLeadById,
  getLeadEmailById,
  type Lead,
} from '../db/index.js';
import { db } from '../db/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// Serve static files
app.use(express.static(join(__dirname, 'public')));

// API: Get stats
app.get('/api/stats', (_req, res) => {
  try {
    const stats = getStats();
    const leadsWithEmails = getLeadsWithEmails().length;
    const leadsWithoutEmails = getLeadsWithoutEmails().length;
    const verificationStats = getEmailVerificationStats();
    const notEnriched = getLeadsNotEnrichedCount();
    const outreachStats = getOutreachStats();

    res.json({
      ...stats,
      leadsWithEmails,
      leadsWithoutEmails,
      notEnriched,
      emailSuccessRate: stats.totalLeads > 0
        ? Math.round((leadsWithEmails / stats.totalLeads) * 100)
        : 0,
      verification: verificationStats,
      outreach: outreachStats,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// API: Get leads with pagination and filtering
app.get('/api/leads', (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const filter = req.query.filter as string || 'all';
    const search = (req.query.search as string || '').toLowerCase();

    let leads: Lead[];

    switch (filter) {
      case 'with-emails':
        leads = getLeadsWithEmails();
        break;
      case 'without-emails':
        leads = getLeadsWithoutEmails();
        break;
      case 'hot':
        leads = getTopScoredLeads(10000).filter(l => l.score >= 70);
        break;
      case 'warm':
        leads = getTopScoredLeads(10000).filter(l => l.score >= 50 && l.score < 70);
        break;
      case 'cold':
        leads = getTopScoredLeads(10000).filter(l => l.score < 50);
        break;
      // Verification status filters
      case 'valid':
        leads = getLeadsByEmailStatus('valid');
        break;
      case 'invalid':
        leads = getLeadsByEmailStatus('invalid');
        break;
      case 'catch-all':
        leads = getLeadsByEmailStatus('catch_all');
        break;
      case 'unknown':
        leads = getLeadsByEmailStatus('unknown');
        break;
      case 'unverified':
        leads = getLeadsByEmailStatus('unverified');
        break;
      case 'outreach-sent':
        leads = getAllLeads(10000).filter(l => hasReceivedOutreach(l.id));
        break;
      case 'outreach-pending':
        leads = getLeadsWithEmails().filter(l => !hasReceivedOutreach(l.id));
        break;
      default:
        leads = getAllLeads(10000);
    }

    // Apply search filter
    if (search) {
      leads = leads.filter(l =>
        l.business_name.toLowerCase().includes(search) ||
        (l.city || '').toLowerCase().includes(search) ||
        (l.website || '').toLowerCase().includes(search)
      );
    }

    const total = leads.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedLeads = leads.slice(offset, offset + limit);

    // Enrich leads with email data
    const enrichedLeads = paginatedLeads.map(lead => {
      const emails = getLeadEmails(lead.id);
      const enrichment = getEnrichmentByLeadId(lead.id);

      return {
        ...lead,
        emails: emails.map(e => ({
          id: e.id,
          email: e.email,
          role: e.role,
          verification_status: e.verification_status,
          is_primary: e.is_primary,
        })),
        enrichment: enrichment ? {
          has_multiple_tutors: enrichment.has_multiple_tutors,
          existing_scheduling_tool: enrichment.existing_scheduling_tool,
          enrichment_attempts: enrichment.enrichment_attempts,
        } : null,
      };
    });

    res.json({
      leads: enrichedLeads,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// API: Create a new lead manually
app.post('/api/leads', (req, res) => {
  try {
    const { business_name, business_type, website, phone, city, state_province, country } = req.body;

    if (!business_name) {
      return res.status(400).json({ error: 'business_name is required' });
    }

    const lead = insertLead({
      business_name,
      business_type: business_type || null,
      website: website || null,
      phone: phone || null,
      address: null,
      city: city || null,
      state_province: state_province || null,
      country: country || null,
      source: 'manual',
      source_id: null,
      google_rating: null,
      google_review_count: null,
    });

    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// API: Get a single lead by ID
app.get('/api/leads/:id', (req, res) => {
  try {
    const lead = getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const emails = getLeadEmails(lead.id);
    const enrichment = getEnrichmentByLeadId(lead.id);
    const outreachSent = hasReceivedOutreach(lead.id);

    res.json({
      ...lead,
      emails,
      enrichment,
      outreachSent,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// API: Add email to a lead
app.post('/api/leads/:id/emails', (req, res) => {
  try {
    const lead = getLeadById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const { email, contact_name, role, verification_status } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    const existingEmails = getLeadEmails(lead.id);
    const isPrimary = existingEmails.length === 0 ? 1 : 0;

    const newEmail = insertLeadEmail({
      lead_id: lead.id,
      email: email.toLowerCase().trim(),
      contact_name: contact_name || null,
      role: role || 'unknown',
      verification_status: verification_status || 'unverified',
      source: 'manual',
      is_primary: isPrimary,
    });

    res.json({ success: true, email: newEmail });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// API: Update an email
app.put('/api/emails/:id', (req, res) => {
  try {
    const emailRecord = getLeadEmailById(req.params.id);
    if (!emailRecord) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const { email, contact_name, role, verification_status } = req.body;

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email.toLowerCase().trim());
    }
    if (contact_name !== undefined) {
      updates.push('contact_name = ?');
      values.push(contact_name);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }
    if (verification_status !== undefined) {
      updates.push('verification_status = ?');
      values.push(verification_status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    db.prepare(`UPDATE lead_emails SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updatedEmail = getLeadEmailById(req.params.id);
    res.json({ success: true, email: updatedEmail });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// API: Delete an email
app.delete('/api/emails/:id', (req, res) => {
  try {
    const emailRecord = getLeadEmailById(req.params.id);
    if (!emailRecord) {
      return res.status(404).json({ error: 'Email not found' });
    }

    db.prepare('DELETE FROM lead_emails WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Serve dashboard HTML
app.get('/', (_req, res) => {
  res.send(getDashboardHTML());
});

function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Schedutor Outreach Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    header h1 { font-size: 24px; font-weight: 600; }
    .header-btn {
      background: rgba(255,255,255,0.2);
      color: white;
      border: 1px solid rgba(255,255,255,0.3);
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    .header-btn:hover { background: rgba(255,255,255,0.3); }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .stat-card .label { color: #666; font-size: 12px; margin-bottom: 4px; }
    .stat-card .value { font-size: 24px; font-weight: 700; color: #333; }
    .stat-card .value.success { color: #22c55e; }
    .stat-card .value.warning { color: #f59e0b; }
    .stat-card .value.info { color: #3b82f6; }

    .controls {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
      align-items: center;
    }
    .controls input, .controls select {
      padding: 10px 14px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
    }
    .controls input { flex: 1; min-width: 200px; }
    .controls select { min-width: 150px; }
    .btn {
      padding: 10px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
    .btn-primary { background: #667eea; color: white; }
    .btn-primary:hover { background: #5a6fd6; }
    .btn-secondary { background: #e5e7eb; color: #374151; }
    .btn-secondary:hover { background: #d1d5db; }
    .btn-sm { padding: 4px 8px; font-size: 12px; }
    .btn-danger { background: #dc2626; color: white; }
    .btn-danger:hover { background: #b91c1c; }

    .leads-table {
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f9fafb; font-weight: 600; color: #666; font-size: 12px; text-transform: uppercase; }
    tr:hover { background: #f9fafb; }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge.hot { background: #fef2f2; color: #dc2626; }
    .badge.warm { background: #fff7ed; color: #ea580c; }
    .badge.cold { background: #eff6ff; color: #2563eb; }
    .badge.valid { background: #f0fdf4; color: #16a34a; }
    .badge.invalid { background: #fef2f2; color: #dc2626; }
    .badge.catch_all { background: #faf5ff; color: #9333ea; }
    .badge.unknown { background: #f3f4f6; color: #6b7280; }
    .badge.unverified { background: #fefce8; color: #ca8a04; }
    .badge.sent { background: #dbeafe; color: #1d4ed8; }

    .email-list { font-size: 13px; }
    .email-item { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
    .email-item .email-text { flex: 1; }
    .email-actions { display: none; gap: 4px; }
    .email-item:hover .email-actions { display: flex; }

    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      padding: 16px;
    }
    .pagination button {
      padding: 8px 16px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 6px;
      cursor: pointer;
    }
    .pagination button:hover:not(:disabled) { background: #f5f5f5; }
    .pagination button:disabled { opacity: 0.5; cursor: not-allowed; }
    .pagination span { color: #666; }

    .website-link { color: #3b82f6; text-decoration: none; font-size: 13px; }
    .website-link:hover { text-decoration: underline; }

    .loading { text-align: center; padding: 40px; color: #666; }

    /* Modal styles */
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    .modal.active { display: flex; }
    .modal-content {
      background: white;
      padding: 24px;
      border-radius: 12px;
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .modal-header h2 { font-size: 18px; font-weight: 600; }
    .modal-close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
    }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 4px; color: #374151; }
    .form-group input, .form-group select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
    }
    .form-group input:focus, .form-group select:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102,126,234,0.1);
    }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
    .alert { padding: 12px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
    .alert-success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
    .alert-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Schedutor Outreach Dashboard</h1>
      <button class="header-btn" onclick="openAddLeadModal()">+ Add Lead</button>
    </header>

    <div class="stats-grid" id="stats">
      <div class="stat-card"><div class="label">Loading...</div></div>
    </div>

    <div class="controls">
      <input type="text" id="search" placeholder="Search by name, city, or website...">
      <select id="filter">
        <optgroup label="General">
          <option value="all">All Leads</option>
          <option value="with-emails">With Emails</option>
          <option value="without-emails">Without Emails</option>
        </optgroup>
        <optgroup label="Outreach">
          <option value="outreach-sent">Outreach Sent</option>
          <option value="outreach-pending">Outreach Pending</option>
        </optgroup>
        <optgroup label="Score">
          <option value="hot">Hot (70+)</option>
          <option value="warm">Warm (50-69)</option>
          <option value="cold">Cold (&lt;50)</option>
        </optgroup>
        <optgroup label="Verification Status">
          <option value="valid">Valid Emails</option>
          <option value="invalid">Invalid Emails</option>
          <option value="catch-all">Catch-All</option>
          <option value="unknown">Unknown</option>
          <option value="unverified">Unverified</option>
        </optgroup>
      </select>
    </div>

    <div class="leads-table">
      <table>
        <thead>
          <tr>
            <th>Business</th>
            <th>Location</th>
            <th>Score</th>
            <th>Emails</th>
            <th>Website</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="leads-body">
          <tr><td colspan="6" class="loading">Loading...</td></tr>
        </tbody>
      </table>
      <div class="pagination" id="pagination"></div>
    </div>
  </div>

  <!-- Add Lead Modal -->
  <div class="modal" id="addLeadModal">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Add New Lead</h2>
        <button class="modal-close" onclick="closeModal('addLeadModal')">&times;</button>
      </div>
      <div id="addLeadAlert"></div>
      <form id="addLeadForm" onsubmit="handleAddLead(event)">
        <div class="form-group">
          <label>Business Name *</label>
          <input type="text" name="business_name" required>
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" placeholder="Optional - add email directly">
        </div>
        <div class="form-group">
          <label>Website</label>
          <input type="text" name="website" placeholder="https://...">
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="text" name="phone">
        </div>
        <div class="form-group">
          <label>City</label>
          <input type="text" name="city">
        </div>
        <div class="form-group">
          <label>State/Province</label>
          <input type="text" name="state_province">
        </div>
        <div class="form-group">
          <label>Business Type</label>
          <select name="business_type">
            <option value="">Select...</option>
            <option value="agency">Agency</option>
            <option value="solo_tutor">Solo Tutor</option>
            <option value="franchise">Franchise</option>
            <option value="online_platform">Online Platform</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal('addLeadModal')">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Lead</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Add Email Modal -->
  <div class="modal" id="addEmailModal">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Add Email to Lead</h2>
        <button class="modal-close" onclick="closeModal('addEmailModal')">&times;</button>
      </div>
      <div id="addEmailAlert"></div>
      <form id="addEmailForm" onsubmit="handleAddEmail(event)">
        <input type="hidden" name="lead_id" id="addEmailLeadId">
        <p style="margin-bottom:16px;color:#666;">Adding email to: <strong id="addEmailLeadName"></strong></p>
        <div class="form-group">
          <label>Email Address *</label>
          <input type="email" name="email" required>
        </div>
        <div class="form-group">
          <label>Contact Name</label>
          <input type="text" name="contact_name">
        </div>
        <div class="form-group">
          <label>Role</label>
          <select name="role">
            <option value="unknown">Unknown</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div class="form-group">
          <label>Verification Status</label>
          <select name="verification_status">
            <option value="unverified">Unverified</option>
            <option value="valid">Valid</option>
            <option value="invalid">Invalid</option>
            <option value="catch_all">Catch-All</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal('addEmailModal')">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Email</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Edit Email Modal -->
  <div class="modal" id="editEmailModal">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Edit Email</h2>
        <button class="modal-close" onclick="closeModal('editEmailModal')">&times;</button>
      </div>
      <div id="editEmailAlert"></div>
      <form id="editEmailForm" onsubmit="handleEditEmail(event)">
        <input type="hidden" name="email_id" id="editEmailId">
        <div class="form-group">
          <label>Email Address *</label>
          <input type="email" name="email" id="editEmailAddress" required>
        </div>
        <div class="form-group">
          <label>Verification Status</label>
          <select name="verification_status" id="editEmailStatus">
            <option value="unverified">Unverified</option>
            <option value="valid">Valid</option>
            <option value="invalid">Invalid</option>
            <option value="catch_all">Catch-All</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-danger" onclick="handleDeleteEmail()">Delete</button>
          <button type="button" class="btn btn-secondary" onclick="closeModal('editEmailModal')">Cancel</button>
          <button type="submit" class="btn btn-primary">Save</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    let currentPage = 1;
    let currentFilter = 'all';
    let currentSearch = '';
    let debounceTimer;

    async function loadStats() {
      try {
        const res = await fetch('/api/stats');
        const stats = await res.json();
        const v = stats.verification || { valid: 0, invalid: 0, catch_all: 0, unknown: 0, unverified: 0 };
        const o = stats.outreach || { total: 0, today: 0 };

        document.getElementById('stats').innerHTML = \`
          <div class="stat-card">
            <div class="label">Total Leads</div>
            <div class="value">\${stats.totalLeads.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="label">Outreach Sent</div>
            <div class="value" style="color:#1d4ed8">\${o.total}</div>
          </div>
          <div class="stat-card">
            <div class="label">Sent Today</div>
            <div class="value" style="color:#1d4ed8">\${o.today}</div>
          </div>
          <div class="stat-card">
            <div class="label">With Emails</div>
            <div class="value info">\${stats.leadsWithEmails.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="label">Valid Emails</div>
            <div class="value success">\${v.valid}</div>
          </div>
          <div class="stat-card">
            <div class="label">Invalid</div>
            <div class="value" style="color:#dc2626">\${v.invalid}</div>
          </div>
          <div class="stat-card">
            <div class="label">Catch-All</div>
            <div class="value" style="color:#9333ea">\${v.catch_all}</div>
          </div>
          <div class="stat-card">
            <div class="label">Unverified</div>
            <div class="value" style="color:#f59e0b">\${v.unverified}</div>
          </div>
        \`;
      } catch (err) {
        console.error('Failed to load stats:', err);
      }
    }

    async function loadLeads() {
      try {
        const params = new URLSearchParams({
          page: currentPage,
          limit: 50,
          filter: currentFilter,
          search: currentSearch,
        });

        const res = await fetch('/api/leads?' + params);
        const data = await res.json();
        const tbody = document.getElementById('leads-body');

        if (data.leads.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="loading">No leads found</td></tr>';
        } else {
          tbody.innerHTML = data.leads.map(lead => \`
            <tr>
              <td>
                <strong>\${escapeHtml(lead.business_name)}</strong>
                \${lead.phone ? '<br><span style="color:#666;font-size:12px">' + escapeHtml(lead.phone) + '</span>' : ''}
              </td>
              <td>\${escapeHtml(lead.city || '')}\${lead.state_province ? ', ' + lead.state_province : ''}</td>
              <td>
                <span class="badge \${getScoreTier(lead.score)}">\${lead.score}</span>
              </td>
              <td class="email-list">
                \${lead.emails.length > 0
                  ? lead.emails.map(e => \`
                      <div class="email-item">
                        <span class="email-text">\${escapeHtml(e.email)}</span>
                        <span class="badge \${e.verification_status}">\${e.verification_status}</span>
                        <div class="email-actions">
                          <button class="btn btn-sm btn-secondary" onclick="openEditEmailModal('\${e.id}', '\${escapeHtml(e.email)}', '\${e.verification_status}')">Edit</button>
                        </div>
                      </div>
                    \`).join('')
                  : '<span style="color:#999">No emails</span>'
                }
                <button class="btn btn-sm btn-secondary" style="margin-top:4px" onclick="openAddEmailModal('\${lead.id}', '\${escapeHtml(lead.business_name)}')">+ Add</button>
              </td>
              <td>
                \${lead.website
                  ? '<a href="' + escapeHtml(lead.website.startsWith('http') ? lead.website : 'https://' + lead.website) + '" target="_blank" class="website-link">' + escapeHtml(lead.website.replace(/^https?:\\/\\//, '').slice(0, 25)) + '</a>'
                  : '-'
                }
              </td>
              <td>\${escapeHtml(lead.business_type || '-')}</td>
            </tr>
          \`).join('');
        }

        const { page, totalPages, total } = data.pagination;
        document.getElementById('pagination').innerHTML = \`
          <button onclick="goToPage(\${page - 1})" \${page <= 1 ? 'disabled' : ''}>Previous</button>
          <span>Page \${page} of \${totalPages} (\${total.toLocaleString()} leads)</span>
          <button onclick="goToPage(\${page + 1})" \${page >= totalPages ? 'disabled' : ''}>Next</button>
        \`;
      } catch (err) {
        console.error('Failed to load leads:', err);
        document.getElementById('leads-body').innerHTML = '<tr><td colspan="6" class="loading">Error loading leads</td></tr>';
      }
    }

    function getScoreTier(score) {
      if (score >= 70) return 'hot';
      if (score >= 50) return 'warm';
      return 'cold';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function goToPage(page) {
      currentPage = page;
      loadLeads();
    }

    // Modal functions
    function openModal(id) {
      document.getElementById(id).classList.add('active');
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('active');
      // Clear alerts
      const alert = document.getElementById(id.replace('Modal', 'Alert'));
      if (alert) alert.innerHTML = '';
    }

    function showAlert(containerId, message, type) {
      document.getElementById(containerId).innerHTML = \`<div class="alert alert-\${type}">\${message}</div>\`;
    }

    function openAddLeadModal() {
      document.getElementById('addLeadForm').reset();
      openModal('addLeadModal');
    }

    function openAddEmailModal(leadId, leadName) {
      document.getElementById('addEmailLeadId').value = leadId;
      document.getElementById('addEmailLeadName').textContent = leadName;
      document.getElementById('addEmailForm').reset();
      document.getElementById('addEmailLeadId').value = leadId;
      openModal('addEmailModal');
    }

    function openEditEmailModal(emailId, email, status) {
      document.getElementById('editEmailId').value = emailId;
      document.getElementById('editEmailAddress').value = email;
      document.getElementById('editEmailStatus').value = status;
      openModal('editEmailModal');
    }

    async function handleAddLead(e) {
      e.preventDefault();
      const form = e.target;
      const data = Object.fromEntries(new FormData(form));
      const email = data.email;
      delete data.email;

      try {
        const res = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();

        if (!res.ok) throw new Error(result.error);

        // If email was provided, add it
        if (email) {
          await fetch(\`/api/leads/\${result.lead.id}/emails\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, verification_status: 'valid' }),
          });
        }

        showAlert('addLeadAlert', 'Lead added successfully!', 'success');
        setTimeout(() => {
          closeModal('addLeadModal');
          loadLeads();
          loadStats();
        }, 1000);
      } catch (err) {
        showAlert('addLeadAlert', err.message, 'error');
      }
    }

    async function handleAddEmail(e) {
      e.preventDefault();
      const form = e.target;
      const data = Object.fromEntries(new FormData(form));
      const leadId = data.lead_id;
      delete data.lead_id;

      try {
        const res = await fetch(\`/api/leads/\${leadId}/emails\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();

        if (!res.ok) throw new Error(result.error);

        showAlert('addEmailAlert', 'Email added successfully!', 'success');
        setTimeout(() => {
          closeModal('addEmailModal');
          loadLeads();
          loadStats();
        }, 1000);
      } catch (err) {
        showAlert('addEmailAlert', err.message, 'error');
      }
    }

    async function handleEditEmail(e) {
      e.preventDefault();
      const form = e.target;
      const data = Object.fromEntries(new FormData(form));
      const emailId = data.email_id;
      delete data.email_id;

      try {
        const res = await fetch(\`/api/emails/\${emailId}\`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();

        if (!res.ok) throw new Error(result.error);

        showAlert('editEmailAlert', 'Email updated successfully!', 'success');
        setTimeout(() => {
          closeModal('editEmailModal');
          loadLeads();
        }, 1000);
      } catch (err) {
        showAlert('editEmailAlert', err.message, 'error');
      }
    }

    async function handleDeleteEmail() {
      const emailId = document.getElementById('editEmailId').value;
      if (!confirm('Are you sure you want to delete this email?')) return;

      try {
        const res = await fetch(\`/api/emails/\${emailId}\`, { method: 'DELETE' });
        const result = await res.json();

        if (!res.ok) throw new Error(result.error);

        closeModal('editEmailModal');
        loadLeads();
        loadStats();
      } catch (err) {
        showAlert('editEmailAlert', err.message, 'error');
      }
    }

    // Event listeners
    document.getElementById('filter').addEventListener('change', (e) => {
      currentFilter = e.target.value;
      currentPage = 1;
      loadLeads();
    });

    document.getElementById('search').addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentSearch = e.target.value;
        currentPage = 1;
        loadLeads();
      }, 300);
    });

    // Close modal on outside click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal.id);
      });
    });

    // Initial load
    loadStats();
    loadLeads();
  </script>
</body>
</html>`;
}

export function startServer(port = 3000): void {
  app.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
  });
}
