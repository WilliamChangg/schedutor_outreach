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
exports.exportLeadsToCSV = exportLeadsToCSV;
exports.exportLeadsAsJSON = exportLeadsAsJSON;
var fs_1 = require("fs");
var path_1 = require("path");
var url_1 = require("url");
var index_js_1 = require("../db/index.js");
var __dirname = (0, path_1.dirname)((0, url_1.fileURLToPath)(import.meta.url));
function getScoreTier(score) {
    if (score >= 70)
        return 'hot';
    if (score >= 50)
        return 'warm';
    if (score >= 30)
        return 'cool';
    return 'cold';
}
function escapeCSV(value) {
    if (value === null || value === undefined)
        return '';
    var str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return "\"".concat(str.replace(/"/g, '""'), "\"");
    }
    return str;
}
function leadsToRows(leads) {
    return leads.map(function (lead) {
        var _a, _b;
        var emails = (0, index_js_1.getLeadEmails)(lead.id);
        var primaryEmail = emails.find(function (e) { return e.is_primary; }) || emails[0];
        var enrichment = (0, index_js_1.getEnrichmentByLeadId)(lead.id);
        return {
            id: lead.id,
            business_name: lead.business_name,
            business_type: lead.business_type || '',
            website: lead.website || '',
            phone: lead.phone || '',
            email: (primaryEmail === null || primaryEmail === void 0 ? void 0 : primaryEmail.email) || '',
            email_verified: (primaryEmail === null || primaryEmail === void 0 ? void 0 : primaryEmail.verification_status) || 'none',
            address: lead.address || '',
            city: lead.city || '',
            state_province: lead.state_province || '',
            country: lead.country || '',
            google_rating: ((_a = lead.google_rating) === null || _a === void 0 ? void 0 : _a.toString()) || '',
            google_review_count: ((_b = lead.google_review_count) === null || _b === void 0 ? void 0 : _b.toString()) || '',
            score: lead.score.toString(),
            tier: getScoreTier(lead.score),
            pipeline_stage: lead.pipeline_stage,
            has_multiple_tutors: (enrichment === null || enrichment === void 0 ? void 0 : enrichment.has_multiple_tutors) ? 'yes' : 'no',
            scheduling_tool: (enrichment === null || enrichment === void 0 ? void 0 : enrichment.existing_scheduling_tool) || '',
            specialties: (enrichment === null || enrichment === void 0 ? void 0 : enrichment.specialties) || '',
            source: lead.source,
            created_at: lead.created_at
        };
    });
}
function rowsToCSV(rows) {
    var headers = Object.keys(rows[0] || {});
    var lines = [];
    // Header row
    lines.push(headers.join(','));
    var _loop_1 = function (row) {
        var values = headers.map(function (h) { return escapeCSV(row[h]); });
        lines.push(values.join(','));
    };
    // Data rows
    for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
        var row = rows_1[_i];
        _loop_1(row);
    }
    return lines.join('\n');
}
function exportLeadsToCSV(options) {
    if (options === void 0) { options = {}; }
    var _a = options.filter, filter = _a === void 0 ? 'all' : _a, _b = options.limit, limit = _b === void 0 ? 10000 : _b, outputPath = options.outputPath;
    var leads;
    switch (filter) {
        case 'scored':
            leads = (0, index_js_1.getTopScoredLeads)(limit);
            break;
        case 'verified':
        case 'valid':
            leads = (0, index_js_1.getLeadsByEmailStatus)('valid').slice(0, limit);
            break;
        case 'with-emails':
            leads = (0, index_js_1.getLeadsWithEmails)().slice(0, limit);
            break;
        case 'hot':
            leads = (0, index_js_1.getTopScoredLeads)(limit).filter(function (l) { return l.score >= 70; });
            break;
        case 'warm':
            leads = (0, index_js_1.getTopScoredLeads)(limit).filter(function (l) { return l.score >= 50; });
            break;
        case 'invalid':
            leads = (0, index_js_1.getLeadsByEmailStatus)('invalid').slice(0, limit);
            break;
        case 'catch-all':
            leads = (0, index_js_1.getLeadsByEmailStatus)('catch_all').slice(0, limit);
            break;
        case 'unknown':
            leads = (0, index_js_1.getLeadsByEmailStatus)('unknown').slice(0, limit);
            break;
        case 'unverified':
            leads = (0, index_js_1.getLeadsByEmailStatus)('unverified').slice(0, limit);
            break;
        default:
            leads = (0, index_js_1.getAllLeads)(limit);
    }
    if (leads.length === 0) {
        return 'No leads to export';
    }
    var rows = leadsToRows(leads);
    var csv = rowsToCSV(rows);
    // Write to file if path provided
    if (outputPath) {
        (0, fs_1.writeFileSync)(outputPath, csv, 'utf-8');
        return "Exported ".concat(rows.length, " leads to ").concat(outputPath);
    }
    // Default output path
    var defaultPath = (0, path_1.join)(__dirname, '../../data', "leads-export-".concat(Date.now(), ".csv"));
    (0, fs_1.writeFileSync)(defaultPath, csv, 'utf-8');
    return "Exported ".concat(rows.length, " leads to ").concat(defaultPath);
}
function exportLeadsAsJSON(options) {
    if (options === void 0) { options = {}; }
    var _a = options.filter, filter = _a === void 0 ? 'all' : _a, _b = options.limit, limit = _b === void 0 ? 10000 : _b;
    var leads;
    switch (filter) {
        case 'scored':
            leads = (0, index_js_1.getTopScoredLeads)(limit);
            break;
        case 'verified':
            leads = (0, index_js_1.getLeadsWithVerifiedEmails)().slice(0, limit);
            break;
        case 'with-emails':
            leads = (0, index_js_1.getLeadsWithEmails)().slice(0, limit);
            break;
        case 'hot':
            leads = (0, index_js_1.getTopScoredLeads)(limit).filter(function (l) { return l.score >= 70; });
            break;
        case 'warm':
            leads = (0, index_js_1.getTopScoredLeads)(limit).filter(function (l) { return l.score >= 50; });
            break;
        default:
            leads = (0, index_js_1.getAllLeads)(limit);
    }
    return leads.map(function (lead) {
        var emails = (0, index_js_1.getLeadEmails)(lead.id);
        var enrichment = (0, index_js_1.getEnrichmentByLeadId)(lead.id);
        return __assign(__assign({}, lead), { emails: emails.map(function (e) { return ({
                email: e.email,
                role: e.role,
                verification_status: e.verification_status,
                is_primary: e.is_primary
            }); }), enrichment: enrichment ? {
                has_multiple_tutors: enrichment.has_multiple_tutors,
                existing_scheduling_tool: enrichment.existing_scheduling_tool,
                linkedin_url: enrichment.linkedin_url,
                facebook_url: enrichment.facebook_url,
                specialties: enrichment.specialties ? JSON.parse(enrichment.specialties) : []
            } : null });
    });
}
