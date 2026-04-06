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
  enrichment_attempts: number;
  last_enrichment_attempt_at: string | null;
  emails_found_count: number;
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

export function getLeadsByEmailStatus(status: LeadEmail['verification_status']): Lead[] {
  const stmt = db.prepare(`
    SELECT DISTINCT l.* FROM leads l
    INNER JOIN lead_emails e ON l.id = e.lead_id
    WHERE e.verification_status = ?
    ORDER BY l.score DESC
  `);
  return stmt.all(status) as Lead[];
}

export function getLeadsWithEmails(): Lead[] {
  const stmt = db.prepare(`
    SELECT DISTINCT l.* FROM leads l
    INNER JOIN lead_emails e ON l.id = e.lead_id
    ORDER BY l.score DESC
  `);
  return stmt.all() as Lead[];
}

export function getEmailVerificationStats(): { valid: number; invalid: number; catch_all: number; unknown: number; unverified: number } {
  const stmt = db.prepare(`
    SELECT verification_status, COUNT(*) as count
    FROM lead_emails
    GROUP BY verification_status
  `);
  const rows = stmt.all() as Array<{ verification_status: string; count: number }>;

  const stats = { valid: 0, invalid: 0, catch_all: 0, unknown: 0, unverified: 0 };
  for (const row of rows) {
    if (row.verification_status in stats) {
      stats[row.verification_status as keyof typeof stats] = row.count;
    }
  }
  return stats;
}

export function getLeadsNotEnrichedCount(): number {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM leads l
    LEFT JOIN lead_enrichment en ON l.id = en.lead_id
    WHERE en.id IS NULL AND l.website IS NOT NULL
  `);
  const result = stmt.get() as { count: number };
  return result.count;
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
    LEFT JOIN lead_enrichment en ON l.id = en.lead_id
    WHERE e.id IS NULL
      AND l.website IS NOT NULL
      AND (
        en.id IS NULL  -- Never attempted
        OR (
          en.emails_found_count = 0  -- Previous attempt found nothing
          AND en.enrichment_attempts < 3  -- Under max attempts
          AND en.last_enrichment_attempt_at < datetime('now', '-30 days')  -- 30 days passed
        )
      )
    ORDER BY l.score DESC
  `);
  return stmt.all() as Lead[];
}

// Enrichment operations
export function insertOrUpdateEnrichment(enrichment: Omit<LeadEnrichment, 'id' | 'enriched_at' | 'enrichment_attempts' | 'last_enrichment_attempt_at' | 'emails_found_count'> & { emails_found_count: number }): LeadEnrichment {
  const now = new Date().toISOString();
  const id = ulid();

  // Get existing enrichment to increment attempts
  const existing = getEnrichmentByLeadId(enrichment.lead_id);
  const newAttempts = (existing?.enrichment_attempts ?? 0) + 1;

  const stmt = db.prepare(`
    INSERT INTO lead_enrichment (id, lead_id, has_multiple_tutors, existing_scheduling_tool, linkedin_url, facebook_url, founded_year, team_size_estimate, specialties, raw_data, enriched_at, enrichment_attempts, last_enrichment_attempt_at, emails_found_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(lead_id) DO UPDATE SET
      has_multiple_tutors = excluded.has_multiple_tutors,
      existing_scheduling_tool = excluded.existing_scheduling_tool,
      linkedin_url = excluded.linkedin_url,
      facebook_url = excluded.facebook_url,
      founded_year = excluded.founded_year,
      team_size_estimate = excluded.team_size_estimate,
      specialties = excluded.specialties,
      raw_data = excluded.raw_data,
      enriched_at = excluded.enriched_at,
      enrichment_attempts = excluded.enrichment_attempts,
      last_enrichment_attempt_at = excluded.last_enrichment_attempt_at,
      emails_found_count = excluded.emails_found_count
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
    now,
    newAttempts,
    now,
    enrichment.emails_found_count
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

// Get unverified emails for verification
export function getUnverifiedEmails(limit = 100): LeadEmail[] {
  const stmt = db.prepare(`
    SELECT * FROM lead_emails
    WHERE verification_status = 'unverified'
    ORDER BY created_at ASC
    LIMIT ?
  `);
  return stmt.all(limit) as LeadEmail[];
}

// Get primary email for a lead
export function getPrimaryEmailForLead(leadId: string): LeadEmail | undefined {
  const stmt = db.prepare(`
    SELECT * FROM lead_emails
    WHERE lead_id = ? AND is_primary = 1
    LIMIT 1
  `);
  return stmt.get(leadId) as LeadEmail | undefined;
}

// Get verified (valid or catch_all) email for a lead
export function getVerifiedEmailForLead(leadId: string): LeadEmail | undefined {
  const stmt = db.prepare(`
    SELECT * FROM lead_emails
    WHERE lead_id = ? AND verification_status IN ('valid', 'catch_all')
    ORDER BY
      CASE verification_status WHEN 'valid' THEN 1 WHEN 'catch_all' THEN 2 END,
      is_primary DESC
    LIMIT 1
  `);
  return stmt.get(leadId) as LeadEmail | undefined;
}

// Sequence types
export interface Sequence {
  id: string;
  name: string;
  total_steps: number;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  delay_hours: number;
  subject_template: string;
  body_template: string;
  created_at: string;
}

export interface SequenceEnrollment {
  id: string;
  lead_id: string;
  sequence_id: string;
  email_id: string;
  current_step: number;
  status: 'active' | 'paused' | 'completed' | 'replied' | 'bounced' | 'unsubscribed';
  next_send_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
}

export interface SendLogEntry {
  id: string;
  lead_id: string;
  email_id: string;
  sequence_id: string | null;
  step_number: number | null;
  ses_message_id: string | null;
  status: 'sent' | 'delivered' | 'bounced' | 'complained' | 'opened' | 'clicked';
  sent_at: string;
}

// Sequence operations
export function createSequence(name: string, steps: Array<{ delay_hours: number; subject_template: string; body_template: string }>): Sequence {
  const now = new Date().toISOString();
  const sequenceId = ulid();

  const sequenceStmt = db.prepare(`
    INSERT INTO sequences (id, name, total_steps, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `);
  sequenceStmt.run(sequenceId, name, steps.length, now, now);

  const stepStmt = db.prepare(`
    INSERT INTO sequence_steps (id, sequence_id, step_number, delay_hours, subject_template, body_template, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < steps.length; i++) {
    stepStmt.run(ulid(), sequenceId, i + 1, steps[i].delay_hours, steps[i].subject_template, steps[i].body_template, now);
  }

  return getSequenceById(sequenceId)!;
}

export function getSequenceById(id: string): Sequence | undefined {
  const stmt = db.prepare('SELECT * FROM sequences WHERE id = ?');
  return stmt.get(id) as Sequence | undefined;
}

export function getSequenceByName(name: string): Sequence | undefined {
  const stmt = db.prepare('SELECT * FROM sequences WHERE name = ?');
  return stmt.get(name) as Sequence | undefined;
}

export function getActiveSequences(): Sequence[] {
  const stmt = db.prepare('SELECT * FROM sequences WHERE status = ?');
  return stmt.all('active') as Sequence[];
}

export function getAllSequences(): Sequence[] {
  const stmt = db.prepare('SELECT * FROM sequences ORDER BY created_at DESC');
  return stmt.all() as Sequence[];
}

export function getSequenceSteps(sequenceId: string): SequenceStep[] {
  const stmt = db.prepare('SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_number');
  return stmt.all(sequenceId) as SequenceStep[];
}

export function updateSequenceStatus(id: string, status: Sequence['status']): void {
  const now = new Date().toISOString();
  const stmt = db.prepare('UPDATE sequences SET status = ?, updated_at = ? WHERE id = ?');
  stmt.run(status, now, id);
}

// Enrollment operations
export function enrollLeadInSequence(leadId: string, sequenceId: string, emailId: string): SequenceEnrollment {
  const now = new Date().toISOString();
  const id = ulid();

  // Get first step delay to calculate next_send_at
  const firstStep = db.prepare('SELECT delay_hours FROM sequence_steps WHERE sequence_id = ? AND step_number = 1').get(sequenceId) as { delay_hours: number } | undefined;
  const delayHours = firstStep?.delay_hours ?? 0;
  const nextSendAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();

  const stmt = db.prepare(`
    INSERT INTO sequence_enrollments (id, lead_id, sequence_id, email_id, current_step, status, next_send_at, enrolled_at)
    VALUES (?, ?, ?, ?, 0, 'active', ?, ?)
  `);
  stmt.run(id, leadId, sequenceId, emailId, nextSendAt, now);

  // Update lead pipeline stage
  updateLeadPipelineStage(leadId, 'contacted');

  return getEnrollmentById(id)!;
}

export function getEnrollmentById(id: string): SequenceEnrollment | undefined {
  const stmt = db.prepare('SELECT * FROM sequence_enrollments WHERE id = ?');
  return stmt.get(id) as SequenceEnrollment | undefined;
}

export function getEnrollmentForLead(leadId: string, sequenceId: string): SequenceEnrollment | undefined {
  const stmt = db.prepare('SELECT * FROM sequence_enrollments WHERE lead_id = ? AND sequence_id = ?');
  return stmt.get(leadId, sequenceId) as SequenceEnrollment | undefined;
}

export function getActiveEnrollmentsForLead(leadId: string): SequenceEnrollment[] {
  const stmt = db.prepare('SELECT * FROM sequence_enrollments WHERE lead_id = ? AND status = ?');
  return stmt.all(leadId, 'active') as SequenceEnrollment[];
}

export function getEnrollmentsDueForSend(limit = 50): Array<SequenceEnrollment & { lead: Lead; email: LeadEmail; sequence: Sequence }> {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    SELECT
      se.*,
      l.id as lead_id, l.business_name, l.website, l.city, l.state_province,
      le.email as email_address,
      s.name as sequence_name, s.total_steps
    FROM sequence_enrollments se
    INNER JOIN leads l ON se.lead_id = l.id
    INNER JOIN lead_emails le ON se.email_id = le.id
    INNER JOIN sequences s ON se.sequence_id = s.id
    WHERE se.status = 'active'
      AND se.next_send_at <= ?
      AND s.status = 'active'
    ORDER BY se.next_send_at ASC
    LIMIT ?
  `);

  const results = stmt.all(now, limit) as any[];

  return results.map(r => ({
    id: r.id,
    lead_id: r.lead_id,
    sequence_id: r.sequence_id,
    email_id: r.email_id,
    current_step: r.current_step,
    status: r.status,
    next_send_at: r.next_send_at,
    enrolled_at: r.enrolled_at,
    completed_at: r.completed_at,
    lead: {
      id: r.lead_id,
      business_name: r.business_name,
      website: r.website,
      city: r.city,
      state_province: r.state_province
    } as Lead,
    email: {
      email: r.email_address
    } as LeadEmail,
    sequence: {
      name: r.sequence_name,
      total_steps: r.total_steps
    } as Sequence
  }));
}

export function advanceEnrollmentStep(id: string, nextStepNumber: number, totalSteps: number): void {
  const now = new Date().toISOString();

  if (nextStepNumber > totalSteps) {
    // Sequence complete
    const stmt = db.prepare(`
      UPDATE sequence_enrollments
      SET current_step = ?, status = 'completed', next_send_at = NULL, completed_at = ?
      WHERE id = ?
    `);
    stmt.run(nextStepNumber - 1, now, id);
  } else {
    // Get delay for next step
    const enrollment = getEnrollmentById(id);
    if (!enrollment) return;

    const nextStep = db.prepare(`
      SELECT delay_hours FROM sequence_steps
      WHERE sequence_id = ? AND step_number = ?
    `).get(enrollment.sequence_id, nextStepNumber) as { delay_hours: number } | undefined;

    const delayHours = nextStep?.delay_hours ?? 24;
    const nextSendAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();

    const stmt = db.prepare(`
      UPDATE sequence_enrollments
      SET current_step = ?, next_send_at = ?
      WHERE id = ?
    `);
    stmt.run(nextStepNumber, nextSendAt, id);
  }
}

export function updateEnrollmentStatus(id: string, status: SequenceEnrollment['status']): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE sequence_enrollments
    SET status = ?, completed_at = CASE WHEN ? IN ('completed', 'replied', 'bounced', 'unsubscribed') THEN ? ELSE completed_at END
    WHERE id = ?
  `);
  stmt.run(status, status, now, id);
}

export function getEnrollmentStats(): { active: number; completed: number; replied: number; bounced: number; unsubscribed: number } {
  const results = db.prepare(`
    SELECT status, COUNT(*) as count FROM sequence_enrollments GROUP BY status
  `).all() as { status: string; count: number }[];

  const stats = { active: 0, completed: 0, replied: 0, bounced: 0, unsubscribed: 0 };
  for (const r of results) {
    if (r.status in stats) {
      (stats as any)[r.status] = r.count;
    }
  }
  return stats;
}

// Send log operations
export function logSend(entry: Omit<SendLogEntry, 'id'>): SendLogEntry {
  const id = ulid();

  const stmt = db.prepare(`
    INSERT INTO send_log (id, lead_id, email_id, sequence_id, step_number, ses_message_id, status, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, entry.lead_id, entry.email_id, entry.sequence_id, entry.step_number, entry.ses_message_id, entry.status, entry.sent_at);

  return getSendLogById(id)!;
}

export function getSendLogById(id: string): SendLogEntry | undefined {
  const stmt = db.prepare('SELECT * FROM send_log WHERE id = ?');
  return stmt.get(id) as SendLogEntry | undefined;
}

export function updateSendStatus(id: string, status: SendLogEntry['status']): void {
  const stmt = db.prepare('UPDATE send_log SET status = ? WHERE id = ?');
  stmt.run(status, id);
}

export function updateSendStatusByMessageId(sesMessageId: string, status: SendLogEntry['status']): void {
  const stmt = db.prepare('UPDATE send_log SET status = ? WHERE ses_message_id = ?');
  stmt.run(status, sesMessageId);
}

export function getSendLogForLead(leadId: string): SendLogEntry[] {
  const stmt = db.prepare('SELECT * FROM send_log WHERE lead_id = ? ORDER BY sent_at DESC');
  return stmt.all(leadId) as SendLogEntry[];
}

export function getSendStats(sinceDays = 7): {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  opened: number;
  clicked: number;
  bounceRate: number;
  complaintRate: number;
} {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const results = db.prepare(`
    SELECT status, COUNT(*) as count FROM send_log WHERE sent_at >= ? GROUP BY status
  `).all(since) as { status: string; count: number }[];

  const stats = { sent: 0, delivered: 0, bounced: 0, complained: 0, opened: 0, clicked: 0, bounceRate: 0, complaintRate: 0 };
  let total = 0;

  for (const r of results) {
    if (r.status in stats) {
      (stats as any)[r.status] = r.count;
    }
    total += r.count;
  }

  if (total > 0) {
    stats.bounceRate = Math.round((stats.bounced / total) * 1000) / 10;
    stats.complaintRate = Math.round((stats.complained / total) * 1000) / 10;
  }

  return stats;
}

// Check if sending should be paused due to high bounce/complaint rate
export function shouldPauseSending(): { pause: boolean; reason?: string } {
  const stats = getSendStats(1); // Check last 24 hours
  const total = stats.sent + stats.delivered + stats.bounced + stats.complained;

  if (total < 10) {
    return { pause: false }; // Not enough data
  }

  if (stats.bounceRate > 5) {
    return { pause: true, reason: `Bounce rate ${stats.bounceRate}% exceeds 5% threshold` };
  }

  if (stats.complaintRate > 0.1) {
    return { pause: true, reason: `Complaint rate ${stats.complaintRate}% exceeds 0.1% threshold` };
  }

  return { pause: false };
}

// Get leads eligible for sequence enrollment
export function getLeadsEligibleForEnrollment(sequenceId: string, limit = 100): Array<Lead & { email_id: string; email: string }> {
  const stmt = db.prepare(`
    SELECT l.*, le.id as email_id, le.email
    FROM leads l
    INNER JOIN lead_emails le ON l.id = le.lead_id
    WHERE le.verification_status IN ('valid', 'catch_all')
      AND l.score >= 50
      AND l.pipeline_stage IN ('new', 'scored')
      AND NOT EXISTS (
        SELECT 1 FROM sequence_enrollments se
        WHERE se.lead_id = l.id AND se.sequence_id = ?
      )
    ORDER BY l.score DESC
    LIMIT ?
  `);
  return stmt.all(sequenceId, limit) as Array<Lead & { email_id: string; email: string }>;
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
