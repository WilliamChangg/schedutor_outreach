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
  type Lead,
} from '../db/index.js';

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

    res.json({
      ...stats,
      leadsWithEmails,
      leadsWithoutEmails,
      notEnriched,
      emailSuccessRate: stats.totalLeads > 0
        ? Math.round((leadsWithEmails / stats.totalLeads) * 100)
        : 0,
      verification: verificationStats,
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
    }
    header h1 { font-size: 24px; font-weight: 600; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .stat-card .label { color: #666; font-size: 14px; margin-bottom: 4px; }
    .stat-card .value { font-size: 28px; font-weight: 700; color: #333; }
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
    /* Verification status badges */
    .badge.valid { background: #f0fdf4; color: #16a34a; }
    .badge.invalid { background: #fef2f2; color: #dc2626; }
    .badge.catch_all { background: #faf5ff; color: #9333ea; }
    .badge.unknown { background: #f3f4f6; color: #6b7280; }
    .badge.unverified { background: #fefce8; color: #ca8a04; }

    .email-list { font-size: 13px; }
    .email-list .email { margin-bottom: 2px; }
    .email-list .email-role { color: #999; font-size: 11px; }

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

    .website-link {
      color: #3b82f6;
      text-decoration: none;
      font-size: 13px;
    }
    .website-link:hover { text-decoration: underline; }

    .loading { text-align: center; padding: 40px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Schedutor Outreach Dashboard</h1>
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
        <optgroup label="Score">
          <option value="hot">Hot (70+)</option>
          <option value="warm">Warm (50-69)</option>
          <option value="cold">Cold (<50)</option>
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
            <th>Type</th>
          </tr>
        </thead>
        <tbody id="leads-body">
          <tr><td colspan="6" class="loading">Loading...</td></tr>
        </tbody>
      </table>
      <div class="pagination" id="pagination"></div>
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
        document.getElementById('stats').innerHTML = \`
          <div class="stat-card">
            <div class="label">Total Leads</div>
            <div class="value">\${stats.totalLeads.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="label">Not Enriched</div>
            <div class="value" style="color:#6b7280">\${stats.notEnriched.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="label">With Emails</div>
            <div class="value info">\${stats.leadsWithEmails.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="label">Avg Score</div>
            <div class="value warning">\${stats.avgScore}</div>
          </div>
          <div class="stat-card">
            <div class="label">Valid</div>
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
            <div class="label">Unknown</div>
            <div class="value" style="color:#6b7280">\${v.unknown}</div>
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
                      <div class="email">
                        \${escapeHtml(e.email)}
                        <span class="badge \${e.verification_status}">\${e.verification_status}</span>
                      </div>
                    \`).join('')
                  : '<span style="color:#999">No emails</span>'
                }
              </td>
              <td>
                \${lead.website
                  ? '<a href="' + escapeHtml(lead.website.startsWith('http') ? lead.website : 'https://' + lead.website) + '" target="_blank" class="website-link">' + escapeHtml(lead.website.replace(/^https?:\\/\\//, '').slice(0, 30)) + '</a>'
                  : '-'
                }
              </td>
              <td>\${escapeHtml(lead.business_type || '-')}</td>
            </tr>
          \`).join('');
        }

        // Pagination
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
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function goToPage(page) {
      currentPage = page;
      loadLeads();
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
