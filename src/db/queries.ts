import { db } from './schema.js';
import { ulid } from 'ulid';

export interface Lead {
  id: string;
  business_name: string;
  business_type: 'agency' | 'solo_tutor' | 'franchise' | 'online_platform' | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state_province: string | null;
  country: 'US' | 'CA' | null;
  source: 'google_maps' | 'yelp' | 'directory' | 'manual';
  source_id: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  score: number;
  pipeline_stage: string;
  created_at: string;
  updated_at: string;
}

export interface LeadEmail {
  id: string;
  lead_id: string;
  email: string;
  contact_name: string | null;
  role: 'owner' | 'admin' | 'info' | 'unknown' | null;
  verification_status: 'unverified' | 'valid' | 'invalid' | 'catch_all' | 'unknown';
  source: 'scraped' | 'pattern_guess' | 'manual';
  is_primary: number;
  created_at: string;
}

export interface LeadEnrichment {
  id: string;
  lead_id: string;
  has_multiple_tutors: number | null;
  existing_scheduling_tool: string | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  founded_year: number | null;
  team_size_estimate: string | null;
  specialties: string | null;
  raw_data: string | null;
  enriched_at: string;
}

export interface DiscoveryRun {
  id: string;
  source: string;
  query: string;
  location: string | null;
  leads_found: number;
  leads_new: number;
  leads_duplicate: number;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

// Lead operations
export function insertLead(lead: Omit<Lead, 'id' | 'score' | 'pipeline_stage' | 'created_at' | 'updated_at'>): Lead {
  const now = new Date().toISOString();
  const id = ulid();

  const stmt = db.prepare(`
    INSERT INTO leads (id, business_name, business_type, website, phone, address, city, state_province, country, source, source_id, google_rating, google_review_count, score, pipeline_stage, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'new', ?, ?)
  `);

  stmt.run(
    id,
    lead.business_name,
    lead.business_type,
    lead.website,
    lead.phone,
    lead.address,
    lead.city,
    lead.state_province,
    lead.country,
    lead.source,
    lead.source_id,
    lead.google_rating,
    lead.google_review_count,
    now,
    now
  );

  return getLeadById(id)!;
}

export function getLeadById(id: string): Lead | undefined {
  const stmt = db.prepare('SELECT * FROM leads WHERE id = ?');
  return stmt.get(id) as Lead | undefined;
}

export function getLeadBySourceId(source: string, sourceId: string): Lead | undefined {
  const stmt = db.prepare('SELECT * FROM leads WHERE source = ? AND source_id = ?');
  return stmt.get(source, sourceId) as Lead | undefined;
}

export function findDuplicateLead(businessName: string, city: string | null, stateProvince: string | null): Lead | undefined {
  // Normalize business name for comparison
  const normalizedName = businessName.toLowerCase().trim();

  const stmt = db.prepare(`
    SELECT * FROM leads
    WHERE LOWER(TRIM(business_name)) = ?
    AND (city = ? OR (city IS NULL AND ? IS NULL))
    AND (state_province = ? OR (state_province IS NULL AND ? IS NULL))
  `);

  return stmt.get(normalizedName, city, city, stateProvince, stateProvince) as Lead | undefined;
}

export function updateLeadScore(id: string, score: number): void {
  const now = new Date().toISOString();
  const stmt = db.prepare('UPDATE leads SET score = ?, pipeline_stage = ?, updated_at = ? WHERE id = ?');
  stmt.run(score, 'scored', now, id);
}

export function updateLeadPipelineStage(id: string, stage: string): void {
  const now = new Date().toISOString();
  const stmt = db.prepare('UPDATE leads SET pipeline_stage = ?, updated_at = ? WHERE id = ?');
  stmt.run(stage, now, id);
}

export function getLeadsByPipelineStage(stage: string, limit = 100): Lead[] {
  const stmt = db.prepare('SELECT * FROM leads WHERE pipeline_stage = ? ORDER BY score DESC LIMIT ?');
  return stmt.all(stage, limit) as Lead[];
}

export function getTopScoredLeads(limit = 100): Lead[] {
  const stmt = db.prepare('SELECT * FROM leads WHERE score > 0 ORDER BY score DESC LIMIT ?');
  return stmt.all(limit) as Lead[];
}

export function getAllLeads(limit = 1000, offset = 0): Lead[] {
  const stmt = db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?');
  return stmt.all(limit, offset) as Lead[];
}

export function getLeadsCount(): number {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM leads');
  const result = stmt.get() as { count: number };
  return result.count;
}

export function getLeadsWithVerifiedEmails(): Lead[] {
  const stmt = db.prepare(`
    SELECT DISTINCT l.* FROM leads l
    INNER JOIN lead_emails e ON l.id = e.lead_id
    WHERE e.verification_status = 'valid'
    ORDER BY l.score DESC
  `);
  return stmt.all() as Lead[];
}

// Email operations
export function insertLeadEmail(email: Omit<LeadEmail, 'id' | 'created_at'>): LeadEmail {
  const now = new Date().toISOString();
  const id = ulid();

  const stmt = db.prepare(`
    INSERT INTO lead_emails (id, lead_id, email, contact_name, role, verification_status, source, is_primary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    email.lead_id,
    email.email.toLowerCase().trim(),
    email.contact_name,
    email.role,
    email.verification_status,
    email.source,
    email.is_primary,
    now
  );

  return getLeadEmailById(id)!;
}

export function getLeadEmailById(id: string): LeadEmail | undefined {
  const stmt = db.prepare('SELECT * FROM lead_emails WHERE id = ?');
  return stmt.get(id) as LeadEmail | undefined;
}

export function getLeadEmails(leadId: string): LeadEmail[] {
  const stmt = db.prepare('SELECT * FROM lead_emails WHERE lead_id = ? ORDER BY is_primary DESC');
  return stmt.all(leadId) as LeadEmail[];
}

export function emailExistsForLead(leadId: string, email: string): boolean {
  const stmt = db.prepare('SELECT 1 FROM lead_emails WHERE lead_id = ? AND LOWER(email) = LOWER(?)');
  return stmt.get(leadId, email) !== undefined;
}

export function updateEmailVerificationStatus(id: string, status: LeadEmail['verification_status']): void {
  const stmt = db.prepare('UPDATE lead_emails SET verification_status = ? WHERE id = ?');
  stmt.run(status, id);
}

export function getLeadsWithoutEmails(): Lead[] {
  const stmt = db.prepare(`
    SELECT l.* FROM leads l
    LEFT JOIN lead_emails e ON l.id = e.lead_id
    WHERE e.id IS NULL AND l.website IS NOT NULL
    ORDER BY l.score DESC
  `);
  return stmt.all() as Lead[];
}

// Enrichment operations
export function insertOrUpdateEnrichment(enrichment: Omit<LeadEnrichment, 'id' | 'enriched_at'>): LeadEnrichment {
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

  stmt.run(
    id,
    enrichment.lead_id,
    enrichment.has_multiple_tutors,
    enrichment.existing_scheduling_tool,
    enrichment.linkedin_url,
    enrichment.facebook_url,
    enrichment.founded_year,
    enrichment.team_size_estimate,
    enrichment.specialties,
    enrichment.raw_data,
    now
  );

  return getEnrichmentByLeadId(enrichment.lead_id)!;
}

export function getEnrichmentByLeadId(leadId: string): LeadEnrichment | undefined {
  const stmt = db.prepare('SELECT * FROM lead_enrichment WHERE lead_id = ?');
  return stmt.get(leadId) as LeadEnrichment | undefined;
}

// Discovery run operations
export function startDiscoveryRun(source: string, query: string, location: string | null): DiscoveryRun {
  const now = new Date().toISOString();
  const id = ulid();

  const stmt = db.prepare(`
    INSERT INTO discovery_runs (id, source, query, location, status, started_at)
    VALUES (?, ?, ?, ?, 'running', ?)
  `);

  stmt.run(id, source, query, location, now);
  return getDiscoveryRunById(id)!;
}

export function getDiscoveryRunById(id: string): DiscoveryRun | undefined {
  const stmt = db.prepare('SELECT * FROM discovery_runs WHERE id = ?');
  return stmt.get(id) as DiscoveryRun | undefined;
}

export function completeDiscoveryRun(id: string, leadsFound: number, leadsNew: number, leadsDuplicate: number): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE discovery_runs
    SET status = 'completed', leads_found = ?, leads_new = ?, leads_duplicate = ?, completed_at = ?
    WHERE id = ?
  `);
  stmt.run(leadsFound, leadsNew, leadsDuplicate, now, id);
}

export function failDiscoveryRun(id: string, errorMessage: string): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE discovery_runs
    SET status = 'failed', error_message = ?, completed_at = ?
    WHERE id = ?
  `);
  stmt.run(errorMessage, now, id);
}

export function getRecentDiscoveryRuns(limit = 10): DiscoveryRun[] {
  const stmt = db.prepare('SELECT * FROM discovery_runs ORDER BY started_at DESC LIMIT ?');
  return stmt.all(limit) as DiscoveryRun[];
}

// Stats
export function getStats(): {
  totalLeads: number;
  leadsWithEmails: number;
  verifiedEmails: number;
  byPipelineStage: Record<string, number>;
  bySource: Record<string, number>;
  avgScore: number;
} {
  const totalLeads = (db.prepare('SELECT COUNT(*) as count FROM leads').get() as { count: number }).count;

  const leadsWithEmails = (db.prepare(`
    SELECT COUNT(DISTINCT lead_id) as count FROM lead_emails
  `).get() as { count: number }).count;

  const verifiedEmails = (db.prepare(`
    SELECT COUNT(*) as count FROM lead_emails WHERE verification_status = 'valid'
  `).get() as { count: number }).count;

  const pipelineStages = db.prepare(`
    SELECT pipeline_stage, COUNT(*) as count FROM leads GROUP BY pipeline_stage
  `).all() as { pipeline_stage: string; count: number }[];

  const sources = db.prepare(`
    SELECT source, COUNT(*) as count FROM leads GROUP BY source
  `).all() as { source: string; count: number }[];

  const avgScore = (db.prepare(`
    SELECT AVG(score) as avg FROM leads WHERE score > 0
  `).get() as { avg: number | null }).avg ?? 0;

  return {
    totalLeads,
    leadsWithEmails,
    verifiedEmails,
    byPipelineStage: Object.fromEntries(pipelineStages.map(p => [p.pipeline_stage, p.count])),
    bySource: Object.fromEntries(sources.map(s => [s.source, s.count])),
    avgScore: Math.round(avgScore * 10) / 10
  };
}
