import { db } from './schema.js';
import { ulid } from 'ulid';
// Lead operations
export function insertLead(lead) {
    const now = new Date().toISOString();
    const id = ulid();
    const stmt = db.prepare(`
    INSERT INTO leads (id, business_name, business_type, website, phone, address, city, state_province, country, source, source_id, google_rating, google_review_count, score, pipeline_stage, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'new', ?, ?)
  `);
    stmt.run(id, lead.business_name, lead.business_type, lead.website, lead.phone, lead.address, lead.city, lead.state_province, lead.country, lead.source, lead.source_id, lead.google_rating, lead.google_review_count, now, now);
    return getLeadById(id);
}
export function getLeadById(id) {
    const stmt = db.prepare('SELECT * FROM leads WHERE id = ?');
    return stmt.get(id);
}
export function getLeadBySourceId(source, sourceId) {
    const stmt = db.prepare('SELECT * FROM leads WHERE source = ? AND source_id = ?');
    return stmt.get(source, sourceId);
}
export function findDuplicateLead(businessName, city, stateProvince) {
    // Normalize business name for comparison
    const normalizedName = businessName.toLowerCase().trim();
    const stmt = db.prepare(`
    SELECT * FROM leads
    WHERE LOWER(TRIM(business_name)) = ?
    AND (city = ? OR (city IS NULL AND ? IS NULL))
    AND (state_province = ? OR (state_province IS NULL AND ? IS NULL))
  `);
    return stmt.get(normalizedName, city, city, stateProvince, stateProvince);
}
export function updateLeadScore(id, score) {
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE leads SET score = ?, pipeline_stage = ?, updated_at = ? WHERE id = ?');
    stmt.run(score, 'scored', now, id);
}
export function updateLeadPipelineStage(id, stage) {
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE leads SET pipeline_stage = ?, updated_at = ? WHERE id = ?');
    stmt.run(stage, now, id);
}
export function getLeadsByPipelineStage(stage, limit = 100) {
    const stmt = db.prepare('SELECT * FROM leads WHERE pipeline_stage = ? ORDER BY score DESC LIMIT ?');
    return stmt.all(stage, limit);
}
export function getTopScoredLeads(limit = 100) {
    const stmt = db.prepare('SELECT * FROM leads WHERE score > 0 ORDER BY score DESC LIMIT ?');
    return stmt.all(limit);
}
export function getAllLeads(limit = 1000, offset = 0) {
    const stmt = db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?');
    return stmt.all(limit, offset);
}
export function getLeadsCount() {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM leads');
    const result = stmt.get();
    return result.count;
}
export function getLeadsWithVerifiedEmails() {
    const stmt = db.prepare(`
    SELECT DISTINCT l.* FROM leads l
    INNER JOIN lead_emails e ON l.id = e.lead_id
    WHERE e.verification_status = 'valid'
    ORDER BY l.score DESC
  `);
    return stmt.all();
}
// Email operations
export function insertLeadEmail(email) {
    const now = new Date().toISOString();
    const id = ulid();
    const stmt = db.prepare(`
    INSERT INTO lead_emails (id, lead_id, email, contact_name, role, verification_status, source, is_primary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(id, email.lead_id, email.email.toLowerCase().trim(), email.contact_name, email.role, email.verification_status, email.source, email.is_primary, now);
    return getLeadEmailById(id);
}
export function getLeadEmailById(id) {
    const stmt = db.prepare('SELECT * FROM lead_emails WHERE id = ?');
    return stmt.get(id);
}
export function getLeadEmails(leadId) {
    const stmt = db.prepare('SELECT * FROM lead_emails WHERE lead_id = ? ORDER BY is_primary DESC');
    return stmt.all(leadId);
}
export function emailExistsForLead(leadId, email) {
    const stmt = db.prepare('SELECT 1 FROM lead_emails WHERE lead_id = ? AND LOWER(email) = LOWER(?)');
    return stmt.get(leadId, email) !== undefined;
}
export function updateEmailVerificationStatus(id, status) {
    const stmt = db.prepare('UPDATE lead_emails SET verification_status = ? WHERE id = ?');
    stmt.run(status, id);
}
export function getLeadsWithoutEmails() {
    const stmt = db.prepare(`
    SELECT l.* FROM leads l
    LEFT JOIN lead_emails e ON l.id = e.lead_id
    WHERE e.id IS NULL AND l.website IS NOT NULL
    ORDER BY l.score DESC
  `);
    return stmt.all();
}
// Enrichment operations
export function insertOrUpdateEnrichment(enrichment) {
    const now = new Date().toISOString();
    const id = ulid();
    const stmt = db.prepare(`
    INSERT INTO lead_enrichment (id, lead_id, has_multiple_tutors, existing_scheduling_tool, linkedin_url, facebook_url, founded_year, team_size_estimate, specialties, raw_data, enriched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lead_id) DO UPDATE SET
      has_multiple_tutors = excluded.has_multiple_tutors,
      existing_scheduling_tool = excluded.existing_scheduling_tool,
      linkedin_url = excluded.linkedin_url,
      facebook_url = excluded.facebook_url,
      founded_year = excluded.founded_year,
      team_size_estimate = excluded.team_size_estimate,
      specialties = excluded.specialties,
      raw_data = excluded.raw_data,
      enriched_at = excluded.enriched_at
  `);
    stmt.run(id, enrichment.lead_id, enrichment.has_multiple_tutors, enrichment.existing_scheduling_tool, enrichment.linkedin_url, enrichment.facebook_url, enrichment.founded_year, enrichment.team_size_estimate, enrichment.specialties, enrichment.raw_data, now);
    return getEnrichmentByLeadId(enrichment.lead_id);
}
export function getEnrichmentByLeadId(leadId) {
    const stmt = db.prepare('SELECT * FROM lead_enrichment WHERE lead_id = ?');
    return stmt.get(leadId);
}
// Discovery run operations
export function startDiscoveryRun(source, query, location) {
    const now = new Date().toISOString();
    const id = ulid();
    const stmt = db.prepare(`
    INSERT INTO discovery_runs (id, source, query, location, status, started_at)
    VALUES (?, ?, ?, ?, 'running', ?)
  `);
    stmt.run(id, source, query, location, now);
    return getDiscoveryRunById(id);
}
export function getDiscoveryRunById(id) {
    const stmt = db.prepare('SELECT * FROM discovery_runs WHERE id = ?');
    return stmt.get(id);
}
export function completeDiscoveryRun(id, leadsFound, leadsNew, leadsDuplicate) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
    UPDATE discovery_runs
    SET status = 'completed', leads_found = ?, leads_new = ?, leads_duplicate = ?, completed_at = ?
    WHERE id = ?
  `);
    stmt.run(leadsFound, leadsNew, leadsDuplicate, now, id);
}
export function failDiscoveryRun(id, errorMessage) {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
    UPDATE discovery_runs
    SET status = 'failed', error_message = ?, completed_at = ?
    WHERE id = ?
  `);
    stmt.run(errorMessage, now, id);
}
export function getRecentDiscoveryRuns(limit = 10) {
    const stmt = db.prepare('SELECT * FROM discovery_runs ORDER BY started_at DESC LIMIT ?');
    return stmt.all(limit);
}
// Stats
export function getStats() {
    const totalLeads = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;
    const leadsWithEmails = db.prepare(`
    SELECT COUNT(DISTINCT lead_id) as count FROM lead_emails
  `).get().count;
    const verifiedEmails = db.prepare(`
    SELECT COUNT(*) as count FROM lead_emails WHERE verification_status = 'valid'
  `).get().count;
    const pipelineStages = db.prepare(`
    SELECT pipeline_stage, COUNT(*) as count FROM leads GROUP BY pipeline_stage
  `).all();
    const sources = db.prepare(`
    SELECT source, COUNT(*) as count FROM leads GROUP BY source
  `).all();
    const avgScore = db.prepare(`
    SELECT AVG(score) as avg FROM leads WHERE score > 0
  `).get().avg ?? 0;
    return {
        totalLeads,
        leadsWithEmails,
        verifiedEmails,
        byPipelineStage: Object.fromEntries(pipelineStages.map(p => [p.pipeline_stage, p.count])),
        bySource: Object.fromEntries(sources.map(s => [s.source, s.count])),
        avgScore: Math.round(avgScore * 10) / 10
    };
}
