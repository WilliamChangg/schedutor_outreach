import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getAllLeads, getLeadEmails, getEnrichmentByLeadId, getTopScoredLeads, getLeadsWithVerifiedEmails, getLeadsWithEmails } from '../db/index.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
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
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
function leadsToRows(leads) {
    return leads.map(lead => {
        const emails = getLeadEmails(lead.id);
        const primaryEmail = emails.find(e => e.is_primary) || emails[0];
        const enrichment = getEnrichmentByLeadId(lead.id);
        return {
            id: lead.id,
            business_name: lead.business_name,
            business_type: lead.business_type || '',
            website: lead.website || '',
            phone: lead.phone || '',
            email: primaryEmail?.email || '',
            email_verified: primaryEmail?.verification_status || 'none',
            address: lead.address || '',
            city: lead.city || '',
            state_province: lead.state_province || '',
            country: lead.country || '',
            google_rating: lead.google_rating?.toString() || '',
            google_review_count: lead.google_review_count?.toString() || '',
            score: lead.score.toString(),
            tier: getScoreTier(lead.score),
            pipeline_stage: lead.pipeline_stage,
            has_multiple_tutors: enrichment?.has_multiple_tutors ? 'yes' : 'no',
            scheduling_tool: enrichment?.existing_scheduling_tool || '',
            specialties: enrichment?.specialties || '',
            source: lead.source,
            created_at: lead.created_at
        };
    });
}
function rowsToCSV(rows) {
    const headers = Object.keys(rows[0] || {});
    const lines = [];
    // Header row
    lines.push(headers.join(','));
    // Data rows
    for (const row of rows) {
        const values = headers.map(h => escapeCSV(row[h]));
        lines.push(values.join(','));
    }
    return lines.join('\n');
}
export function exportLeadsToCSV(options = {}) {
    const { filter = 'all', limit = 10000, outputPath } = options;
    let leads;
    switch (filter) {
        case 'scored':
            leads = getTopScoredLeads(limit);
            break;
        case 'verified':
            leads = getLeadsWithVerifiedEmails().slice(0, limit);
            break;
        case 'with-emails':
            leads = getLeadsWithEmails().slice(0, limit);
            break;
        case 'hot':
            leads = getTopScoredLeads(limit).filter(l => l.score >= 70);
            break;
        case 'warm':
            leads = getTopScoredLeads(limit).filter(l => l.score >= 50);
            break;
        default:
            leads = getAllLeads(limit);
    }
    if (leads.length === 0) {
        return 'No leads to export';
    }
    const rows = leadsToRows(leads);
    const csv = rowsToCSV(rows);
    // Write to file if path provided
    if (outputPath) {
        writeFileSync(outputPath, csv, 'utf-8');
        return `Exported ${rows.length} leads to ${outputPath}`;
    }
    // Default output path
    const defaultPath = join(__dirname, '../../data', `leads-export-${Date.now()}.csv`);
    writeFileSync(defaultPath, csv, 'utf-8');
    return `Exported ${rows.length} leads to ${defaultPath}`;
}
export function exportLeadsAsJSON(options = {}) {
    const { filter = 'all', limit = 10000 } = options;
    let leads;
    switch (filter) {
        case 'scored':
            leads = getTopScoredLeads(limit);
            break;
        case 'verified':
            leads = getLeadsWithVerifiedEmails().slice(0, limit);
            break;
        case 'with-emails':
            leads = getLeadsWithEmails().slice(0, limit);
            break;
        case 'hot':
            leads = getTopScoredLeads(limit).filter(l => l.score >= 70);
            break;
        case 'warm':
            leads = getTopScoredLeads(limit).filter(l => l.score >= 50);
            break;
        default:
            leads = getAllLeads(limit);
    }
    return leads.map(lead => {
        const emails = getLeadEmails(lead.id);
        const enrichment = getEnrichmentByLeadId(lead.id);
        return {
            ...lead,
            emails: emails.map(e => ({
                email: e.email,
                role: e.role,
                verification_status: e.verification_status,
                is_primary: e.is_primary
            })),
            enrichment: enrichment ? {
                has_multiple_tutors: enrichment.has_multiple_tutors,
                existing_scheduling_tool: enrichment.existing_scheduling_tool,
                linkedin_url: enrichment.linkedin_url,
                facebook_url: enrichment.facebook_url,
                specialties: enrichment.specialties ? JSON.parse(enrichment.specialties) : []
            } : null
        };
    });
}
