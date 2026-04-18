"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertLead = insertLead;
exports.getLeadById = getLeadById;
exports.getLeadBySourceId = getLeadBySourceId;
exports.findDuplicateLead = findDuplicateLead;
exports.updateLeadScore = updateLeadScore;
exports.updateLeadPipelineStage = updateLeadPipelineStage;
exports.getLeadsByPipelineStage = getLeadsByPipelineStage;
exports.getTopScoredLeads = getTopScoredLeads;
exports.getAllLeads = getAllLeads;
exports.getLeadsCount = getLeadsCount;
exports.getLeadsWithVerifiedEmails = getLeadsWithVerifiedEmails;
exports.getLeadsByEmailStatus = getLeadsByEmailStatus;
exports.getLeadsWithEmails = getLeadsWithEmails;
exports.getEmailVerificationStats = getEmailVerificationStats;
exports.getLeadsNotEnrichedCount = getLeadsNotEnrichedCount;
exports.insertLeadEmail = insertLeadEmail;
exports.getLeadEmailById = getLeadEmailById;
exports.getLeadEmails = getLeadEmails;
exports.emailExistsForLead = emailExistsForLead;
exports.updateEmailVerificationStatus = updateEmailVerificationStatus;
exports.getLeadsWithoutEmails = getLeadsWithoutEmails;
exports.insertOrUpdateEnrichment = insertOrUpdateEnrichment;
exports.getEnrichmentByLeadId = getEnrichmentByLeadId;
exports.startDiscoveryRun = startDiscoveryRun;
exports.getDiscoveryRunById = getDiscoveryRunById;
exports.completeDiscoveryRun = completeDiscoveryRun;
exports.failDiscoveryRun = failDiscoveryRun;
exports.getRecentDiscoveryRuns = getRecentDiscoveryRuns;
exports.getUnverifiedEmails = getUnverifiedEmails;
exports.getPrimaryEmailForLead = getPrimaryEmailForLead;
exports.getVerifiedEmailForLead = getVerifiedEmailForLead;
exports.createSequence = createSequence;
exports.getSequenceById = getSequenceById;
exports.getSequenceByName = getSequenceByName;
exports.getActiveSequences = getActiveSequences;
exports.getAllSequences = getAllSequences;
exports.getSequenceSteps = getSequenceSteps;
exports.updateSequenceStatus = updateSequenceStatus;
exports.enrollLeadInSequence = enrollLeadInSequence;
exports.getEnrollmentById = getEnrollmentById;
exports.getEnrollmentForLead = getEnrollmentForLead;
exports.getActiveEnrollmentsForLead = getActiveEnrollmentsForLead;
exports.getEnrollmentsDueForSend = getEnrollmentsDueForSend;
exports.advanceEnrollmentStep = advanceEnrollmentStep;
exports.updateEnrollmentStatus = updateEnrollmentStatus;
exports.getEnrollmentStats = getEnrollmentStats;
exports.logSend = logSend;
exports.getSendLogById = getSendLogById;
exports.updateSendStatus = updateSendStatus;
exports.updateSendStatusByMessageId = updateSendStatusByMessageId;
exports.getSendLogForLead = getSendLogForLead;
exports.getSendStats = getSendStats;
exports.shouldPauseSending = shouldPauseSending;
exports.getLeadsEligibleForEnrollment = getLeadsEligibleForEnrollment;
exports.getStats = getStats;
exports.getTodaySendCount = getTodaySendCount;
exports.getLeadsEligibleForOutreach = getLeadsEligibleForOutreach;
exports.hasReceivedOutreach = hasReceivedOutreach;
exports.getOutreachStats = getOutreachStats;
var schema_js_1 = require("./schema.js");
var ulid_1 = require("ulid");
// Lead operations
function insertLead(lead) {
    var now = new Date().toISOString();
    var id = (0, ulid_1.ulid)();
    var stmt = schema_js_1.db.prepare("\n    INSERT INTO leads (id, business_name, business_type, website, phone, address, city, state_province, country, source, source_id, google_rating, google_review_count, score, pipeline_stage, created_at, updated_at)\n    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'new', ?, ?)\n  ");
    stmt.run(id, lead.business_name, lead.business_type, lead.website, lead.phone, lead.address, lead.city, lead.state_province, lead.country, lead.source, lead.source_id, lead.google_rating, lead.google_review_count, now, now);
    return getLeadById(id);
}
function getLeadById(id) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM leads WHERE id = ?');
    return stmt.get(id);
}
function getLeadBySourceId(source, sourceId) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM leads WHERE source = ? AND source_id = ?');
    return stmt.get(source, sourceId);
}
function findDuplicateLead(businessName, city, stateProvince) {
    // Normalize business name for comparison
    var normalizedName = businessName.toLowerCase().trim();
    var stmt = schema_js_1.db.prepare("\n    SELECT * FROM leads\n    WHERE LOWER(TRIM(business_name)) = ?\n    AND (city = ? OR (city IS NULL AND ? IS NULL))\n    AND (state_province = ? OR (state_province IS NULL AND ? IS NULL))\n  ");
    return stmt.get(normalizedName, city, city, stateProvince, stateProvince);
}
function updateLeadScore(id, score) {
    var now = new Date().toISOString();
    var stmt = schema_js_1.db.prepare('UPDATE leads SET score = ?, pipeline_stage = ?, updated_at = ? WHERE id = ?');
    stmt.run(score, 'scored', now, id);
}
function updateLeadPipelineStage(id, stage) {
    var now = new Date().toISOString();
    var stmt = schema_js_1.db.prepare('UPDATE leads SET pipeline_stage = ?, updated_at = ? WHERE id = ?');
    stmt.run(stage, now, id);
}
function getLeadsByPipelineStage(stage, limit) {
    if (limit === void 0) { limit = 100; }
    var stmt = schema_js_1.db.prepare('SELECT * FROM leads WHERE pipeline_stage = ? ORDER BY score DESC LIMIT ?');
    return stmt.all(stage, limit);
}
function getTopScoredLeads(limit) {
    if (limit === void 0) { limit = 100; }
    var stmt = schema_js_1.db.prepare('SELECT * FROM leads WHERE score > 0 ORDER BY score DESC LIMIT ?');
    return stmt.all(limit);
}
function getAllLeads(limit, offset) {
    if (limit === void 0) { limit = 1000; }
    if (offset === void 0) { offset = 0; }
    var stmt = schema_js_1.db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?');
    return stmt.all(limit, offset);
}
function getLeadsCount() {
    var stmt = schema_js_1.db.prepare('SELECT COUNT(*) as count FROM leads');
    var result = stmt.get();
    return result.count;
}
function getLeadsWithVerifiedEmails() {
    var stmt = schema_js_1.db.prepare("\n    SELECT DISTINCT l.* FROM leads l\n    INNER JOIN lead_emails e ON l.id = e.lead_id\n    WHERE e.verification_status = 'valid'\n    ORDER BY l.score DESC\n  ");
    return stmt.all();
}
function getLeadsByEmailStatus(status) {
    var stmt = schema_js_1.db.prepare("\n    SELECT DISTINCT l.* FROM leads l\n    INNER JOIN lead_emails e ON l.id = e.lead_id\n    WHERE e.verification_status = ?\n    ORDER BY l.score DESC\n  ");
    return stmt.all(status);
}
function getLeadsWithEmails() {
    var stmt = schema_js_1.db.prepare("\n    SELECT DISTINCT l.* FROM leads l\n    INNER JOIN lead_emails e ON l.id = e.lead_id\n    ORDER BY l.score DESC\n  ");
    return stmt.all();
}
function getEmailVerificationStats() {
    var stmt = schema_js_1.db.prepare("\n    SELECT verification_status, COUNT(*) as count\n    FROM lead_emails\n    GROUP BY verification_status\n  ");
    var rows = stmt.all();
    var stats = { valid: 0, invalid: 0, catch_all: 0, unknown: 0, unverified: 0 };
    for (var _i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
        var row = rows_1[_i];
        if (row.verification_status in stats) {
            stats[row.verification_status] = row.count;
        }
    }
    return stats;
}
function getLeadsNotEnrichedCount() {
    var stmt = schema_js_1.db.prepare("\n    SELECT COUNT(*) as count FROM leads l\n    LEFT JOIN lead_enrichment en ON l.id = en.lead_id\n    WHERE en.id IS NULL AND l.website IS NOT NULL\n  ");
    var result = stmt.get();
    return result.count;
}
// Email operations
function insertLeadEmail(email) {
    var now = new Date().toISOString();
    var id = (0, ulid_1.ulid)();
    var stmt = schema_js_1.db.prepare("\n    INSERT INTO lead_emails (id, lead_id, email, contact_name, role, verification_status, source, is_primary, created_at)\n    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)\n  ");
    stmt.run(id, email.lead_id, email.email.toLowerCase().trim(), email.contact_name, email.role, email.verification_status, email.source, email.is_primary, now);
    return getLeadEmailById(id);
}
function getLeadEmailById(id) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM lead_emails WHERE id = ?');
    return stmt.get(id);
}
function getLeadEmails(leadId) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM lead_emails WHERE lead_id = ? ORDER BY is_primary DESC');
    return stmt.all(leadId);
}
function emailExistsForLead(leadId, email) {
    var stmt = schema_js_1.db.prepare('SELECT 1 FROM lead_emails WHERE lead_id = ? AND LOWER(email) = LOWER(?)');
    return stmt.get(leadId, email) !== undefined;
}
function updateEmailVerificationStatus(id, status) {
    var stmt = schema_js_1.db.prepare('UPDATE lead_emails SET verification_status = ? WHERE id = ?');
    stmt.run(status, id);
}
function getLeadsWithoutEmails() {
    var stmt = schema_js_1.db.prepare("\n    SELECT l.* FROM leads l\n    LEFT JOIN lead_emails e ON l.id = e.lead_id\n    LEFT JOIN lead_enrichment en ON l.id = en.lead_id\n    WHERE e.id IS NULL\n      AND l.website IS NOT NULL\n      AND (\n        en.id IS NULL  -- Never attempted\n        OR (\n          en.emails_found_count = 0  -- Previous attempt found nothing\n          AND en.enrichment_attempts < 3  -- Under max attempts\n          AND en.last_enrichment_attempt_at < datetime('now', '-30 days')  -- 30 days passed\n        )\n      )\n    ORDER BY l.score DESC\n  ");
    return stmt.all();
}
// Enrichment operations
function insertOrUpdateEnrichment(enrichment) {
    var _a;
    var now = new Date().toISOString();
    var id = (0, ulid_1.ulid)();
    // Get existing enrichment to increment attempts
    var existing = getEnrichmentByLeadId(enrichment.lead_id);
    var newAttempts = ((_a = existing === null || existing === void 0 ? void 0 : existing.enrichment_attempts) !== null && _a !== void 0 ? _a : 0) + 1;
    var stmt = schema_js_1.db.prepare("\n    INSERT INTO lead_enrichment (id, lead_id, has_multiple_tutors, existing_scheduling_tool, linkedin_url, facebook_url, founded_year, team_size_estimate, specialties, raw_data, enriched_at, enrichment_attempts, last_enrichment_attempt_at, emails_found_count)\n    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n    ON CONFLICT(lead_id) DO UPDATE SET\n      has_multiple_tutors = excluded.has_multiple_tutors,\n      existing_scheduling_tool = excluded.existing_scheduling_tool,\n      linkedin_url = excluded.linkedin_url,\n      facebook_url = excluded.facebook_url,\n      founded_year = excluded.founded_year,\n      team_size_estimate = excluded.team_size_estimate,\n      specialties = excluded.specialties,\n      raw_data = excluded.raw_data,\n      enriched_at = excluded.enriched_at,\n      enrichment_attempts = excluded.enrichment_attempts,\n      last_enrichment_attempt_at = excluded.last_enrichment_attempt_at,\n      emails_found_count = excluded.emails_found_count\n  ");
    stmt.run(id, enrichment.lead_id, enrichment.has_multiple_tutors, enrichment.existing_scheduling_tool, enrichment.linkedin_url, enrichment.facebook_url, enrichment.founded_year, enrichment.team_size_estimate, enrichment.specialties, enrichment.raw_data, now, newAttempts, now, enrichment.emails_found_count);
    return getEnrichmentByLeadId(enrichment.lead_id);
}
function getEnrichmentByLeadId(leadId) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM lead_enrichment WHERE lead_id = ?');
    return stmt.get(leadId);
}
// Discovery run operations
function startDiscoveryRun(source, query, location) {
    var now = new Date().toISOString();
    var id = (0, ulid_1.ulid)();
    var stmt = schema_js_1.db.prepare("\n    INSERT INTO discovery_runs (id, source, query, location, status, started_at)\n    VALUES (?, ?, ?, ?, 'running', ?)\n  ");
    stmt.run(id, source, query, location, now);
    return getDiscoveryRunById(id);
}
function getDiscoveryRunById(id) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM discovery_runs WHERE id = ?');
    return stmt.get(id);
}
function completeDiscoveryRun(id, leadsFound, leadsNew, leadsDuplicate) {
    var now = new Date().toISOString();
    var stmt = schema_js_1.db.prepare("\n    UPDATE discovery_runs\n    SET status = 'completed', leads_found = ?, leads_new = ?, leads_duplicate = ?, completed_at = ?\n    WHERE id = ?\n  ");
    stmt.run(leadsFound, leadsNew, leadsDuplicate, now, id);
}
function failDiscoveryRun(id, errorMessage) {
    var now = new Date().toISOString();
    var stmt = schema_js_1.db.prepare("\n    UPDATE discovery_runs\n    SET status = 'failed', error_message = ?, completed_at = ?\n    WHERE id = ?\n  ");
    stmt.run(errorMessage, now, id);
}
function getRecentDiscoveryRuns(limit) {
    if (limit === void 0) { limit = 10; }
    var stmt = schema_js_1.db.prepare('SELECT * FROM discovery_runs ORDER BY started_at DESC LIMIT ?');
    return stmt.all(limit);
}
// Get unverified emails for verification
function getUnverifiedEmails(limit) {
    if (limit === void 0) { limit = 100; }
    var stmt = schema_js_1.db.prepare("\n    SELECT * FROM lead_emails\n    WHERE verification_status = 'unverified'\n    ORDER BY created_at ASC\n    LIMIT ?\n  ");
    return stmt.all(limit);
}
// Get primary email for a lead
function getPrimaryEmailForLead(leadId) {
    var stmt = schema_js_1.db.prepare("\n    SELECT * FROM lead_emails\n    WHERE lead_id = ? AND is_primary = 1\n    LIMIT 1\n  ");
    return stmt.get(leadId);
}
// Get verified (valid or catch_all) email for a lead
function getVerifiedEmailForLead(leadId) {
    var stmt = schema_js_1.db.prepare("\n    SELECT * FROM lead_emails\n    WHERE lead_id = ? AND verification_status IN ('valid', 'catch_all')\n    ORDER BY\n      CASE verification_status WHEN 'valid' THEN 1 WHEN 'catch_all' THEN 2 END,\n      is_primary DESC\n    LIMIT 1\n  ");
    return stmt.get(leadId);
}
// Sequence operations
function createSequence(name, steps) {
    var now = new Date().toISOString();
    var sequenceId = (0, ulid_1.ulid)();
    var sequenceStmt = schema_js_1.db.prepare("\n    INSERT INTO sequences (id, name, total_steps, status, created_at, updated_at)\n    VALUES (?, ?, ?, 'active', ?, ?)\n  ");
    sequenceStmt.run(sequenceId, name, steps.length, now, now);
    var stepStmt = schema_js_1.db.prepare("\n    INSERT INTO sequence_steps (id, sequence_id, step_number, delay_hours, subject_template, body_template, created_at)\n    VALUES (?, ?, ?, ?, ?, ?, ?)\n  ");
    for (var i = 0; i < steps.length; i++) {
        stepStmt.run((0, ulid_1.ulid)(), sequenceId, i + 1, steps[i].delay_hours, steps[i].subject_template, steps[i].body_template, now);
    }
    return getSequenceById(sequenceId);
}
function getSequenceById(id) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM sequences WHERE id = ?');
    return stmt.get(id);
}
function getSequenceByName(name) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM sequences WHERE name = ?');
    return stmt.get(name);
}
function getActiveSequences() {
    var stmt = schema_js_1.db.prepare('SELECT * FROM sequences WHERE status = ?');
    return stmt.all('active');
}
function getAllSequences() {
    var stmt = schema_js_1.db.prepare('SELECT * FROM sequences ORDER BY created_at DESC');
    return stmt.all();
}
function getSequenceSteps(sequenceId) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM sequence_steps WHERE sequence_id = ? ORDER BY step_number');
    return stmt.all(sequenceId);
}
function updateSequenceStatus(id, status) {
    var now = new Date().toISOString();
    var stmt = schema_js_1.db.prepare('UPDATE sequences SET status = ?, updated_at = ? WHERE id = ?');
    stmt.run(status, now, id);
}
// Enrollment operations
function enrollLeadInSequence(leadId, sequenceId, emailId) {
    var _a;
    var now = new Date().toISOString();
    var id = (0, ulid_1.ulid)();
    // Get first step delay to calculate next_send_at
    var firstStep = schema_js_1.db.prepare('SELECT delay_hours FROM sequence_steps WHERE sequence_id = ? AND step_number = 1').get(sequenceId);
    var delayHours = (_a = firstStep === null || firstStep === void 0 ? void 0 : firstStep.delay_hours) !== null && _a !== void 0 ? _a : 0;
    var nextSendAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();
    var stmt = schema_js_1.db.prepare("\n    INSERT INTO sequence_enrollments (id, lead_id, sequence_id, email_id, current_step, status, next_send_at, enrolled_at)\n    VALUES (?, ?, ?, ?, 0, 'active', ?, ?)\n  ");
    stmt.run(id, leadId, sequenceId, emailId, nextSendAt, now);
    // Update lead pipeline stage
    updateLeadPipelineStage(leadId, 'contacted');
    return getEnrollmentById(id);
}
function getEnrollmentById(id) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM sequence_enrollments WHERE id = ?');
    return stmt.get(id);
}
function getEnrollmentForLead(leadId, sequenceId) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM sequence_enrollments WHERE lead_id = ? AND sequence_id = ?');
    return stmt.get(leadId, sequenceId);
}
function getActiveEnrollmentsForLead(leadId) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM sequence_enrollments WHERE lead_id = ? AND status = ?');
    return stmt.all(leadId, 'active');
}
function getEnrollmentsDueForSend(limit) {
    if (limit === void 0) { limit = 50; }
    var now = new Date().toISOString();
    var stmt = schema_js_1.db.prepare("\n    SELECT\n      se.*,\n      l.id as lead_id, l.business_name, l.website, l.city, l.state_province,\n      le.email as email_address,\n      s.name as sequence_name, s.total_steps\n    FROM sequence_enrollments se\n    INNER JOIN leads l ON se.lead_id = l.id\n    INNER JOIN lead_emails le ON se.email_id = le.id\n    INNER JOIN sequences s ON se.sequence_id = s.id\n    WHERE se.status = 'active'\n      AND se.next_send_at <= ?\n      AND s.status = 'active'\n    ORDER BY se.next_send_at ASC\n    LIMIT ?\n  ");
    var results = stmt.all(now, limit);
    return results.map(function (r) { return ({
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
        },
        email: {
            email: r.email_address
        },
        sequence: {
            name: r.sequence_name,
            total_steps: r.total_steps
        }
    }); });
}
function advanceEnrollmentStep(id, nextStepNumber, totalSteps) {
    var _a;
    var now = new Date().toISOString();
    if (nextStepNumber > totalSteps) {
        // Sequence complete
        var stmt = schema_js_1.db.prepare("\n      UPDATE sequence_enrollments\n      SET current_step = ?, status = 'completed', next_send_at = NULL, completed_at = ?\n      WHERE id = ?\n    ");
        stmt.run(nextStepNumber - 1, now, id);
    }
    else {
        // Get delay for next step
        var enrollment = getEnrollmentById(id);
        if (!enrollment)
            return;
        var nextStep = schema_js_1.db.prepare("\n      SELECT delay_hours FROM sequence_steps\n      WHERE sequence_id = ? AND step_number = ?\n    ").get(enrollment.sequence_id, nextStepNumber);
        var delayHours = (_a = nextStep === null || nextStep === void 0 ? void 0 : nextStep.delay_hours) !== null && _a !== void 0 ? _a : 24;
        var nextSendAt = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();
        var stmt = schema_js_1.db.prepare("\n      UPDATE sequence_enrollments\n      SET current_step = ?, next_send_at = ?\n      WHERE id = ?\n    ");
        stmt.run(nextStepNumber, nextSendAt, id);
    }
}
function updateEnrollmentStatus(id, status) {
    var now = new Date().toISOString();
    var stmt = schema_js_1.db.prepare("\n    UPDATE sequence_enrollments\n    SET status = ?, completed_at = CASE WHEN ? IN ('completed', 'replied', 'bounced', 'unsubscribed') THEN ? ELSE completed_at END\n    WHERE id = ?\n  ");
    stmt.run(status, status, now, id);
}
function getEnrollmentStats() {
    var results = schema_js_1.db.prepare("\n    SELECT status, COUNT(*) as count FROM sequence_enrollments GROUP BY status\n  ").all();
    var stats = { active: 0, completed: 0, replied: 0, bounced: 0, unsubscribed: 0 };
    for (var _i = 0, results_1 = results; _i < results_1.length; _i++) {
        var r = results_1[_i];
        if (r.status in stats) {
            stats[r.status] = r.count;
        }
    }
    return stats;
}
// Send log operations
function logSend(entry) {
    var id = (0, ulid_1.ulid)();
    var stmt = schema_js_1.db.prepare("\n    INSERT INTO send_log (id, lead_id, email_id, sequence_id, step_number, ses_message_id, status, sent_at)\n    VALUES (?, ?, ?, ?, ?, ?, ?, ?)\n  ");
    stmt.run(id, entry.lead_id, entry.email_id, entry.sequence_id, entry.step_number, entry.ses_message_id, entry.status, entry.sent_at);
    return getSendLogById(id);
}
function getSendLogById(id) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM send_log WHERE id = ?');
    return stmt.get(id);
}
function updateSendStatus(id, status) {
    var stmt = schema_js_1.db.prepare('UPDATE send_log SET status = ? WHERE id = ?');
    stmt.run(status, id);
}
function updateSendStatusByMessageId(sesMessageId, status) {
    var stmt = schema_js_1.db.prepare('UPDATE send_log SET status = ? WHERE ses_message_id = ?');
    stmt.run(status, sesMessageId);
}
function getSendLogForLead(leadId) {
    var stmt = schema_js_1.db.prepare('SELECT * FROM send_log WHERE lead_id = ? ORDER BY sent_at DESC');
    return stmt.all(leadId);
}
function getSendStats(sinceDays) {
    if (sinceDays === void 0) { sinceDays = 7; }
    var since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    var results = schema_js_1.db.prepare("\n    SELECT status, COUNT(*) as count FROM send_log WHERE sent_at >= ? GROUP BY status\n  ").all(since);
    var stats = { sent: 0, delivered: 0, bounced: 0, complained: 0, opened: 0, clicked: 0, bounceRate: 0, complaintRate: 0 };
    var total = 0;
    for (var _i = 0, results_2 = results; _i < results_2.length; _i++) {
        var r = results_2[_i];
        if (r.status in stats) {
            stats[r.status] = r.count;
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
function shouldPauseSending() {
    var stats = getSendStats(1); // Check last 24 hours
    var total = stats.sent + stats.delivered + stats.bounced + stats.complained;
    if (total < 10) {
        return { pause: false }; // Not enough data
    }
    if (stats.bounceRate > 5) {
        return { pause: true, reason: "Bounce rate ".concat(stats.bounceRate, "% exceeds 5% threshold") };
    }
    if (stats.complaintRate > 0.1) {
        return { pause: true, reason: "Complaint rate ".concat(stats.complaintRate, "% exceeds 0.1% threshold") };
    }
    return { pause: false };
}
// Get leads eligible for sequence enrollment
function getLeadsEligibleForEnrollment(sequenceId, limit) {
    if (limit === void 0) { limit = 100; }
    var stmt = schema_js_1.db.prepare("\n    SELECT l.*, le.id as email_id, le.email\n    FROM leads l\n    INNER JOIN lead_emails le ON l.id = le.lead_id\n    WHERE le.verification_status IN ('valid', 'catch_all')\n      AND l.score >= 50\n      AND l.pipeline_stage IN ('new', 'scored')\n      AND NOT EXISTS (\n        SELECT 1 FROM sequence_enrollments se\n        WHERE se.lead_id = l.id AND se.sequence_id = ?\n      )\n    ORDER BY l.score DESC\n    LIMIT ?\n  ");
    return stmt.all(sequenceId, limit);
}
// Stats
function getStats() {
    var _a;
    var totalLeads = schema_js_1.db.prepare('SELECT COUNT(*) as count FROM leads').get().count;
    var leadsWithEmails = schema_js_1.db.prepare("\n    SELECT COUNT(DISTINCT lead_id) as count FROM lead_emails\n  ").get().count;
    var verifiedEmails = schema_js_1.db.prepare("\n    SELECT COUNT(*) as count FROM lead_emails WHERE verification_status = 'valid'\n  ").get().count;
    var pipelineStages = schema_js_1.db.prepare("\n    SELECT pipeline_stage, COUNT(*) as count FROM leads GROUP BY pipeline_stage\n  ").all();
    var sources = schema_js_1.db.prepare("\n    SELECT source, COUNT(*) as count FROM leads GROUP BY source\n  ").all();
    var avgScore = (_a = schema_js_1.db.prepare("\n    SELECT AVG(score) as avg FROM leads WHERE score > 0\n  ").get().avg) !== null && _a !== void 0 ? _a : 0;
    return {
        totalLeads: totalLeads,
        leadsWithEmails: leadsWithEmails,
        verifiedEmails: verifiedEmails,
        byPipelineStage: Object.fromEntries(pipelineStages.map(function (p) { return [p.pipeline_stage, p.count]; })),
        bySource: Object.fromEntries(sources.map(function (s) { return [s.source, s.count]; })),
        avgScore: Math.round(avgScore * 10) / 10
    };
}
/**
 * Count emails sent today (UTC). Used by the sequence engine
 * to enforce the daily send limit.
 */
function getTodaySendCount() {
    var today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    var row = schema_js_1.db
        .prepare("SELECT COUNT(*) as count\n       FROM send_log\n       WHERE status = 'sent'\n         AND sent_at >= ?")
        .get("".concat(today, "T00:00:00.000Z"));
    return row.count;
}
// ── Outreach Functions ─────────────────────────────────────────────────────
/**
 * Get leads eligible for single outreach email.
 * Returns leads with verified emails that haven't received outreach yet.
 */
function getLeadsEligibleForOutreach(limit) {
    if (limit === void 0) { limit = 100; }
    var stmt = schema_js_1.db.prepare("\n    SELECT l.*, le.id as email_id, le.email\n    FROM leads l\n    INNER JOIN lead_emails le ON l.id = le.lead_id\n    WHERE le.verification_status IN ('valid', 'catch_all')\n      AND NOT EXISTS (\n        SELECT 1 FROM send_log sl\n        WHERE sl.lead_id = l.id AND sl.sequence_id IS NULL\n      )\n      AND NOT EXISTS (\n        SELECT 1 FROM sequence_enrollments se\n        WHERE se.lead_id = l.id AND se.status = 'active'\n      )\n    ORDER BY l.score DESC\n    LIMIT ?\n  ");
    return stmt.all(limit);
}
/**
 * Check if a lead has already received the single outreach email.
 */
function hasReceivedOutreach(leadId) {
    var stmt = schema_js_1.db.prepare("\n    SELECT 1 FROM send_log\n    WHERE lead_id = ? AND sequence_id IS NULL\n    LIMIT 1\n  ");
    return stmt.get(leadId) !== undefined;
}
/**
 * Get statistics about single outreach sends.
 */
function getOutreachStats() {
    var today = new Date().toISOString().slice(0, 10);
    var totalStmt = schema_js_1.db.prepare("\n    SELECT COUNT(*) as count FROM send_log WHERE sequence_id IS NULL\n  ");
    var todayStmt = schema_js_1.db.prepare("\n    SELECT COUNT(*) as count FROM send_log\n    WHERE sequence_id IS NULL AND sent_at >= ?\n  ");
    return {
        total: totalStmt.get().count,
        today: todayStmt.get("".concat(today, "T00:00:00.000Z")).count,
    };
}
