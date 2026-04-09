"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
var express_1 = require("express");
var path_1 = require("path");
var url_1 = require("url");
var index_js_1 = require("../db/index.js");
var __dirname = (0, path_1.dirname)((0, url_1.fileURLToPath)(import.meta.url));
var app = (0, express_1.default)();
app.use(express_1.default.json());
// Serve static files
app.use(express_1.default.static((0, path_1.join)(__dirname, 'public')));
// API: Get stats
app.get('/api/stats', function (_req, res) {
    try {
        var stats = (0, index_js_1.getStats)();
        var leadsWithEmails = (0, index_js_1.getLeadsWithEmails)().length;
        var leadsWithoutEmails = (0, index_js_1.getLeadsWithoutEmails)().length;
        var verificationStats = (0, index_js_1.getEmailVerificationStats)();
        var notEnriched = (0, index_js_1.getLeadsNotEnrichedCount)();
        res.json(__assign(__assign({}, stats), { leadsWithEmails: leadsWithEmails, leadsWithoutEmails: leadsWithoutEmails, notEnriched: notEnriched, emailSuccessRate: stats.totalLeads > 0
                ? Math.round((leadsWithEmails / stats.totalLeads) * 100)
                : 0, verification: verificationStats }));
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// API: Get leads with pagination and filtering
app.get('/api/leads', function (req, res) {
    try {
        var page = parseInt(req.query.page) || 1;
        var limit = parseInt(req.query.limit) || 50;
        var filter = req.query.filter || 'all';
        var search_1 = (req.query.search || '').toLowerCase();
        var leads = void 0;
        switch (filter) {
            case 'with-emails':
                leads = (0, index_js_1.getLeadsWithEmails)();
                break;
            case 'without-emails':
                leads = (0, index_js_1.getLeadsWithoutEmails)();
                break;
            case 'hot':
                leads = (0, index_js_1.getTopScoredLeads)(10000).filter(function (l) { return l.score >= 70; });
                break;
            case 'warm':
                leads = (0, index_js_1.getTopScoredLeads)(10000).filter(function (l) { return l.score >= 50 && l.score < 70; });
                break;
            case 'cold':
                leads = (0, index_js_1.getTopScoredLeads)(10000).filter(function (l) { return l.score < 50; });
                break;
            // Verification status filters
            case 'valid':
                leads = (0, index_js_1.getLeadsByEmailStatus)('valid');
                break;
            case 'invalid':
                leads = (0, index_js_1.getLeadsByEmailStatus)('invalid');
                break;
            case 'catch-all':
                leads = (0, index_js_1.getLeadsByEmailStatus)('catch_all');
                break;
            case 'unknown':
                leads = (0, index_js_1.getLeadsByEmailStatus)('unknown');
                break;
            case 'unverified':
                leads = (0, index_js_1.getLeadsByEmailStatus)('unverified');
                break;
            default:
                leads = (0, index_js_1.getAllLeads)(10000);
        }
        // Apply search filter
        if (search_1) {
            leads = leads.filter(function (l) {
                return l.business_name.toLowerCase().includes(search_1) ||
                    (l.city || '').toLowerCase().includes(search_1) ||
                    (l.website || '').toLowerCase().includes(search_1);
            });
        }
        var total = leads.length;
        var totalPages = Math.ceil(total / limit);
        var offset = (page - 1) * limit;
        var paginatedLeads = leads.slice(offset, offset + limit);
        // Enrich leads with email data
        var enrichedLeads = paginatedLeads.map(function (lead) {
            var emails = (0, index_js_1.getLeadEmails)(lead.id);
            var enrichment = (0, index_js_1.getEnrichmentByLeadId)(lead.id);
            return __assign(__assign({}, lead), { emails: emails.map(function (e) { return ({
                    email: e.email,
                    role: e.role,
                    verification_status: e.verification_status,
                    is_primary: e.is_primary,
                }); }), enrichment: enrichment ? {
                    has_multiple_tutors: enrichment.has_multiple_tutors,
                    existing_scheduling_tool: enrichment.existing_scheduling_tool,
                    enrichment_attempts: enrichment.enrichment_attempts,
                } : null });
        });
        res.json({
            leads: enrichedLeads,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                totalPages: totalPages,
            },
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Serve dashboard HTML
app.get('/', function (_req, res) {
    res.send(getDashboardHTML());
});
function getDashboardHTML() {
    return "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Schedutor Outreach Dashboard</title>\n  <style>\n    * { box-sizing: border-box; margin: 0; padding: 0; }\n    body {\n      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;\n      background: #f5f5f5;\n      color: #333;\n      line-height: 1.6;\n    }\n    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }\n    header {\n      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n      color: white;\n      padding: 20px;\n      margin-bottom: 20px;\n      border-radius: 8px;\n    }\n    header h1 { font-size: 24px; font-weight: 600; }\n\n    .stats-grid {\n      display: grid;\n      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));\n      gap: 16px;\n      margin-bottom: 24px;\n    }\n    .stat-card {\n      background: white;\n      padding: 20px;\n      border-radius: 8px;\n      box-shadow: 0 1px 3px rgba(0,0,0,0.1);\n    }\n    .stat-card .label { color: #666; font-size: 14px; margin-bottom: 4px; }\n    .stat-card .value { font-size: 28px; font-weight: 700; color: #333; }\n    .stat-card .value.success { color: #22c55e; }\n    .stat-card .value.warning { color: #f59e0b; }\n    .stat-card .value.info { color: #3b82f6; }\n\n    .controls {\n      display: flex;\n      gap: 12px;\n      margin-bottom: 16px;\n      flex-wrap: wrap;\n      align-items: center;\n    }\n    .controls input, .controls select {\n      padding: 10px 14px;\n      border: 1px solid #ddd;\n      border-radius: 6px;\n      font-size: 14px;\n    }\n    .controls input { flex: 1; min-width: 200px; }\n    .controls select { min-width: 150px; }\n\n    .leads-table {\n      background: white;\n      border-radius: 8px;\n      box-shadow: 0 1px 3px rgba(0,0,0,0.1);\n      overflow: hidden;\n    }\n    table { width: 100%; border-collapse: collapse; }\n    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #eee; }\n    th { background: #f9fafb; font-weight: 600; color: #666; font-size: 12px; text-transform: uppercase; }\n    tr:hover { background: #f9fafb; }\n\n    .badge {\n      display: inline-block;\n      padding: 2px 8px;\n      border-radius: 12px;\n      font-size: 12px;\n      font-weight: 500;\n    }\n    .badge.hot { background: #fef2f2; color: #dc2626; }\n    .badge.warm { background: #fff7ed; color: #ea580c; }\n    .badge.cold { background: #eff6ff; color: #2563eb; }\n    /* Verification status badges */\n    .badge.valid { background: #f0fdf4; color: #16a34a; }\n    .badge.invalid { background: #fef2f2; color: #dc2626; }\n    .badge.catch_all { background: #faf5ff; color: #9333ea; }\n    .badge.unknown { background: #f3f4f6; color: #6b7280; }\n    .badge.unverified { background: #fefce8; color: #ca8a04; }\n\n    .email-list { font-size: 13px; }\n    .email-list .email { margin-bottom: 2px; }\n    .email-list .email-role { color: #999; font-size: 11px; }\n\n    .pagination {\n      display: flex;\n      justify-content: center;\n      align-items: center;\n      gap: 8px;\n      padding: 16px;\n    }\n    .pagination button {\n      padding: 8px 16px;\n      border: 1px solid #ddd;\n      background: white;\n      border-radius: 6px;\n      cursor: pointer;\n    }\n    .pagination button:hover:not(:disabled) { background: #f5f5f5; }\n    .pagination button:disabled { opacity: 0.5; cursor: not-allowed; }\n    .pagination span { color: #666; }\n\n    .website-link {\n      color: #3b82f6;\n      text-decoration: none;\n      font-size: 13px;\n    }\n    .website-link:hover { text-decoration: underline; }\n\n    .loading { text-align: center; padding: 40px; color: #666; }\n  </style>\n</head>\n<body>\n  <div class=\"container\">\n    <header>\n      <h1>Schedutor Outreach Dashboard</h1>\n    </header>\n\n    <div class=\"stats-grid\" id=\"stats\">\n      <div class=\"stat-card\"><div class=\"label\">Loading...</div></div>\n    </div>\n\n    <div class=\"controls\">\n      <input type=\"text\" id=\"search\" placeholder=\"Search by name, city, or website...\">\n      <select id=\"filter\">\n        <optgroup label=\"General\">\n          <option value=\"all\">All Leads</option>\n          <option value=\"with-emails\">With Emails</option>\n          <option value=\"without-emails\">Without Emails</option>\n        </optgroup>\n        <optgroup label=\"Score\">\n          <option value=\"hot\">Hot (70+)</option>\n          <option value=\"warm\">Warm (50-69)</option>\n          <option value=\"cold\">Cold (<50)</option>\n        </optgroup>\n        <optgroup label=\"Verification Status\">\n          <option value=\"valid\">Valid Emails</option>\n          <option value=\"invalid\">Invalid Emails</option>\n          <option value=\"catch-all\">Catch-All</option>\n          <option value=\"unknown\">Unknown</option>\n          <option value=\"unverified\">Unverified</option>\n        </optgroup>\n      </select>\n    </div>\n\n    <div class=\"leads-table\">\n      <table>\n        <thead>\n          <tr>\n            <th>Business</th>\n            <th>Location</th>\n            <th>Score</th>\n            <th>Emails</th>\n            <th>Website</th>\n            <th>Type</th>\n          </tr>\n        </thead>\n        <tbody id=\"leads-body\">\n          <tr><td colspan=\"6\" class=\"loading\">Loading...</td></tr>\n        </tbody>\n      </table>\n      <div class=\"pagination\" id=\"pagination\"></div>\n    </div>\n  </div>\n\n  <script>\n    let currentPage = 1;\n    let currentFilter = 'all';\n    let currentSearch = '';\n    let debounceTimer;\n\n    async function loadStats() {\n      try {\n        const res = await fetch('/api/stats');\n        const stats = await res.json();\n\n        const v = stats.verification || { valid: 0, invalid: 0, catch_all: 0, unknown: 0, unverified: 0 };\n        document.getElementById('stats').innerHTML = `\n          <div class=\"stat-card\">\n            <div class=\"label\">Total Leads</div>\n            <div class=\"value\">${stats.totalLeads.toLocaleString()}</div>\n          </div>\n          <div class=\"stat-card\">\n            <div class=\"label\">Not Enriched</div>\n            <div class=\"value\" style=\"color:#6b7280\">${stats.notEnriched.toLocaleString()}</div>\n          </div>\n          <div class=\"stat-card\">\n            <div class=\"label\">With Emails</div>\n            <div class=\"value info\">${stats.leadsWithEmails.toLocaleString()}</div>\n          </div>\n          <div class=\"stat-card\">\n            <div class=\"label\">Avg Score</div>\n            <div class=\"value warning\">${stats.avgScore}</div>\n          </div>\n          <div class=\"stat-card\">\n            <div class=\"label\">Valid</div>\n            <div class=\"value success\">${v.valid}</div>\n          </div>\n          <div class=\"stat-card\">\n            <div class=\"label\">Invalid</div>\n            <div class=\"value\" style=\"color:#dc2626\">${v.invalid}</div>\n          </div>\n          <div class=\"stat-card\">\n            <div class=\"label\">Catch-All</div>\n            <div class=\"value\" style=\"color:#9333ea\">${v.catch_all}</div>\n          </div>\n          <div class=\"stat-card\">\n            <div class=\"label\">Unknown</div>\n            <div class=\"value\" style=\"color:#6b7280\">${v.unknown}</div>\n          </div>\n          <div class=\"stat-card\">\n            <div class=\"label\">Unverified</div>\n            <div class=\"value\" style=\"color:#f59e0b\">${v.unverified}</div>\n          </div>\n        `;\n      } catch (err) {\n        console.error('Failed to load stats:', err);\n      }\n    }\n\n    async function loadLeads() {\n      try {\n        const params = new URLSearchParams({\n          page: currentPage,\n          limit: 50,\n          filter: currentFilter,\n          search: currentSearch,\n        });\n\n        const res = await fetch('/api/leads?' + params);\n        const data = await res.json();\n\n        const tbody = document.getElementById('leads-body');\n\n        if (data.leads.length === 0) {\n          tbody.innerHTML = '<tr><td colspan=\"6\" class=\"loading\">No leads found</td></tr>';\n        } else {\n          tbody.innerHTML = data.leads.map(lead => `\n            <tr>\n              <td>\n                <strong>${escapeHtml(lead.business_name)}</strong>\n                ${lead.phone ? '<br><span style=\"color:#666;font-size:12px\">' + escapeHtml(lead.phone) + '</span>' : ''}\n              </td>\n              <td>${escapeHtml(lead.city || '')}${lead.state_province ? ', ' + lead.state_province : ''}</td>\n              <td>\n                <span class=\"badge ${getScoreTier(lead.score)}\">${lead.score}</span>\n              </td>\n              <td class=\"email-list\">\n                ${lead.emails.length > 0\n                  ? lead.emails.map(e => `\n                      <div class=\"email\">\n                        ${escapeHtml(e.email)}\n                        <span class=\"badge ${e.verification_status}\">${e.verification_status}</span>\n                      </div>\n                    `).join('')\n                  : '<span style=\"color:#999\">No emails</span>'\n                }\n              </td>\n              <td>\n                ${lead.website\n                  ? '<a href=\"' + escapeHtml(lead.website.startsWith('http') ? lead.website : 'https://' + lead.website) + '\" target=\"_blank\" class=\"website-link\">' + escapeHtml(lead.website.replace(/^https?:\\/\\//, '').slice(0, 30)) + '</a>'\n                  : '-'\n                }\n              </td>\n              <td>${escapeHtml(lead.business_type || '-')}</td>\n            </tr>\n          `).join('');\n        }\n\n        // Pagination\n        const { page, totalPages, total } = data.pagination;\n        document.getElementById('pagination').innerHTML = `\n          <button onclick=\"goToPage(${page - 1})\" ${page <= 1 ? 'disabled' : ''}>Previous</button>\n          <span>Page ${page} of ${totalPages} (${total.toLocaleString()} leads)</span>\n          <button onclick=\"goToPage(${page + 1})\" ${page >= totalPages ? 'disabled' : ''}>Next</button>\n        `;\n      } catch (err) {\n        console.error('Failed to load leads:', err);\n        document.getElementById('leads-body').innerHTML = '<tr><td colspan=\"6\" class=\"loading\">Error loading leads</td></tr>';\n      }\n    }\n\n    function getScoreTier(score) {\n      if (score >= 70) return 'hot';\n      if (score >= 50) return 'warm';\n      return 'cold';\n    }\n\n    function escapeHtml(str) {\n      if (!str) return '';\n      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');\n    }\n\n    function goToPage(page) {\n      currentPage = page;\n      loadLeads();\n    }\n\n    // Event listeners\n    document.getElementById('filter').addEventListener('change', (e) => {\n      currentFilter = e.target.value;\n      currentPage = 1;\n      loadLeads();\n    });\n\n    document.getElementById('search').addEventListener('input', (e) => {\n      clearTimeout(debounceTimer);\n      debounceTimer = setTimeout(() => {\n        currentSearch = e.target.value;\n        currentPage = 1;\n        loadLeads();\n      }, 300);\n    });\n\n    // Initial load\n    loadStats();\n    loadLeads();\n  </script>\n</body>\n</html>";
}
function startServer(port) {
    if (port === void 0) { port = 3000; }
    app.listen(port, function () {
        console.log("Dashboard running at http://localhost:".concat(port));
    });
}
