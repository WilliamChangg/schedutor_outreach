import {
  getEnrollmentsDueForSend,
  getSequenceSteps,
  advanceEnrollmentStep,
  updateEnrollmentStatus,
  getLeadById,
  getLeadEmailById,
  getSequenceById,
  enrollLeadInSequence,
  getLeadsEligibleForEnrollment,
  getEnrollmentStats,
  getSendStats,
  getTodaySendCount, // ← new DB helper (see note below)
  shouldPauseSending,
  type SequenceEnrollment,
  type Sequence,
  type Lead,
} from '../db/index.js';
import { sendEmail, sendRawEmail, isResendConfigured } from './resend-sender.js';
import { renderEmail } from './template-engine.js';
import {
  getSendingConfig,
  getEffectiveDailyLimit,
  getRandomDelay,
  isWithinSendingWindow,
} from './sending-config.js';

// ── Result types ────────────────────────────────────────────────────────────

export interface ProcessQueueResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  dailyLimitReached: boolean;
  errors: string[];
}

export interface EnrollmentResult {
  enrolled: number;
  skipped: number;
  errors: string[];
}

export interface TestSendResult {
  success: boolean;
  messageId?: string;
  subject: string;
  error?: string;
}

// ── Process send queue ──────────────────────────────────────────────────────

export async function processSendQueue(
  limit = 50,
  onProgress?: (sent: number, total: number, lead: Lead, delayMs: number) => void,
): Promise<ProcessQueueResult> {
  const result: ProcessQueueResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    dailyLimitReached: false,
    errors: [],
  };

  // ── Gate checks ──────────────────────────────────────────────────────────

  if (!isResendConfigured()) {
    result.errors.push('Resend not configured – set RESEND_API_KEY in .env');
    return result;
  }

  if (!isWithinSendingWindow()) {
    const cfg = getSendingConfig();
    result.errors.push(
      `Outside sending window (${cfg.sendingWindowStartHour}:00–${cfg.sendingWindowEndHour}:00 ${cfg.timezone})`,
    );
    return result;
  }

  const pauseCheck = shouldPauseSending();
  if (pauseCheck.pause) {
    result.errors.push(`Sending paused: ${pauseCheck.reason}`);
    return result;
  }

  // ── Daily limit ──────────────────────────────────────────────────────────

  const dailyLimit = getEffectiveDailyLimit();
  const sentToday = getTodaySendCount();
  const remainingToday = Math.max(0, dailyLimit - sentToday);

  if (remainingToday === 0) {
    result.dailyLimitReached = true;
    result.errors.push(
      `Daily limit reached (${dailyLimit}/day). Sent today: ${sentToday}`,
    );
    return result;
  }

  // Never exceed the remaining daily budget
  const effectiveLimit = Math.min(limit, remainingToday);

  // ── Fetch & send ─────────────────────────────────────────────────────────

  const dueEnrollments = getEnrollmentsDueForSend(effectiveLimit);

  for (const enrollment of dueEnrollments) {
    // Re-check daily budget each iteration (other processes could be sending)
    if (result.sent + sentToday >= dailyLimit) {
      result.dailyLimitReached = true;
      result.errors.push('Daily limit reached mid-batch');
      break;
    }

    // Stop if we leave the sending window
    if (!isWithinSendingWindow()) {
      result.errors.push('Sending window closed mid-batch');
      break;
    }

    result.processed++;

    try {
      const lead = getLeadById(enrollment.lead_id);
      const email = getLeadEmailById(enrollment.email_id);
      const sequence = getSequenceById(enrollment.sequence_id);

      if (!lead || !email || !sequence) {
        result.skipped++;
        result.errors.push(`Missing data for enrollment ${enrollment.id}`);
        continue;
      }

      // Resolve the next step template
      const steps = getSequenceSteps(sequence.id);
      const nextStepNumber = enrollment.current_step + 1;
      const step = steps.find((s) => s.step_number === nextStepNumber);

      if (!step) {
        updateEnrollmentStatus(enrollment.id, 'completed');
        result.skipped++;
        continue;
      }

      // Render
      const { subject, body } = renderEmail(
        step.subject_template,
        step.body_template,
        lead,
        { includePersonalizedOpening: nextStepNumber === 1 },
      );

      // Send
      const sendResult = await sendEmail({
        to: email.email,
        subject,
        htmlBody: body,
        leadId: lead.id,
        emailId: email.id,
        sequenceId: sequence.id,
        stepNumber: nextStepNumber,
      });

      if (sendResult.success) {
        result.sent++;
        advanceEnrollmentStep(enrollment.id, nextStepNumber + 1, sequence.total_steps);
      } else {
        result.failed++;
        result.errors.push(`Failed to send to ${email.email}: ${sendResult.error}`);
        if (sendResult.error?.includes('bounce') || sendResult.error?.includes('invalid')) {
          updateEnrollmentStatus(enrollment.id, 'bounced');
        }
      }

      // ── Humanised random delay ───────────────────────────────────────────
      const delay = getRandomDelay();
      if (onProgress) {
        onProgress(result.sent, dueEnrollments.length, lead, delay);
      }
      await sleep(delay);
    } catch (error) {
      result.failed++;
      result.errors.push(
        `Error processing enrollment ${enrollment.id}: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }

  return result;
}

// ── Test send ───────────────────────────────────────────────────────────────

/**
 * Send a real test email to an address you own, using an actual
 * sequence template rendered against a real lead.
 *
 * If no sequenceId / stepNumber is provided, the first active
 * sequence's first step is used.
 */
export async function sendTestSequenceEmail(options: {
  /** Recipient (your own email) */
  to: string;
  /** Lead ID to use for template variables */
  leadId: string;
  /** Sequence to pull the template from (optional) */
  sequenceId?: string;
  /** Step number within the sequence (default 1) */
  stepNumber?: number;
}): Promise<TestSendResult> {
  const { to, leadId, sequenceId, stepNumber = 1 } = options;

  if (!isResendConfigured()) {
    return { success: false, subject: '', error: 'Resend not configured' };
  }

  const lead = getLeadById(leadId);
  if (!lead) {
    return { success: false, subject: '', error: `Lead not found: ${leadId}` };
  }

  let seqId = sequenceId;
  if (!seqId) {
    return { success: false, subject: '', error: 'sequenceId is required' };
  }

  const sequence = getSequenceById(seqId);
  if (!sequence) {
    return { success: false, subject: '', error: `Sequence not found: ${seqId}` };
  }

  const steps = getSequenceSteps(seqId);
  const step = steps.find((s) => s.step_number === stepNumber);
  if (!step) {
    return {
      success: false,
      subject: '',
      error: `Step ${stepNumber} not found in sequence ${seqId}`,
    };
  }

  const { subject, body } = renderEmail(
    step.subject_template,
    step.body_template,
    lead,
    { includePersonalizedOpening: stepNumber === 1 },
  );

  const testSubject = `[TEST] ${subject}`;

  // Strip any HTML tags from the rendered body for plain text send
  const plainBody = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const sendResult = await sendRawEmail({
    to,
    subject: testSubject,
    text: plainBody,
  });

  return {
    success: sendResult.success,
    messageId: sendResult.messageId,
    subject: testSubject,
    error: sendResult.error,
  };
}

/**
 * Send test emails to multiple addresses (e.g. your own inboxes)
 * for every step in a sequence, so you can review the full flow.
 */
export async function sendTestSequenceAllSteps(options: {
  to: string[];
  leadId: string;
  sequenceId: string;
  delayBetweenMs?: number;
}): Promise<TestSendResult[]> {
  const { to, leadId, sequenceId, delayBetweenMs = 2000 } = options;
  const results: TestSendResult[] = [];

  const sequence = getSequenceById(sequenceId);
  if (!sequence) {
    return [{ success: false, subject: '', error: `Sequence not found: ${sequenceId}` }];
  }

  const steps = getSequenceSteps(sequenceId).sort((a, b) => a.step_number - b.step_number);

  for (const step of steps) {
    for (const recipient of to) {
      const r = await sendTestSequenceEmail({
        to: recipient,
        leadId,
        sequenceId,
        stepNumber: step.step_number,
      });
      results.push(r);
      await sleep(delayBetweenMs);
    }
  }

  return results;
}

// ── Enrollment ──────────────────────────────────────────────────────────────

export function enrollLeadsInSequence(
  sequenceId: string,
  limit = 100,
  onProgress?: (enrolled: number, lead: Lead) => void,
): EnrollmentResult {
  const result: EnrollmentResult = { enrolled: 0, skipped: 0, errors: [] };

  const sequence = getSequenceById(sequenceId);
  if (!sequence) {
    result.errors.push(`Sequence not found: ${sequenceId}`);
    return result;
  }
  if (sequence.status !== 'active') {
    result.errors.push(`Sequence is not active: ${sequence.status}`);
    return result;
  }

  const eligibleLeads = getLeadsEligibleForEnrollment(sequenceId, limit);

  for (const lead of eligibleLeads) {
    try {
      enrollLeadInSequence(lead.id, sequenceId, lead.email_id);
      result.enrolled++;
      if (onProgress) onProgress(result.enrolled, lead);
    } catch (error) {
      result.skipped++;
      result.errors.push(
        `Failed to enroll ${lead.business_name}: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }

  return result;
}

// ── Status ──────────────────────────────────────────────────────────────────

export function getSequenceEngineStatus() {
  const pauseCheck = shouldPauseSending();
  const sendingConfig = getSendingConfig();
  const dailyLimit = getEffectiveDailyLimit();
  const sentToday = getTodaySendCount();

  return {
    resendConfigured: isResendConfigured(),
    sendingPaused: pauseCheck.pause,
    pauseReason: pauseCheck.reason,
    withinSendingWindow: isWithinSendingWindow(),
    dailyLimit,
    sentToday,
    remainingToday: Math.max(0, dailyLimit - sentToday),
    sendingConfig,
    enrollmentStats: getEnrollmentStats(),
    sendStats: getSendStats(),
  };
}

// ── Preview ─────────────────────────────────────────────────────────────────

export function previewSequenceEmail(
  sequenceId: string,
  stepNumber: number,
  leadId: string,
): { subject: string; body: string } | null {
  const sequence = getSequenceById(sequenceId);
  const lead = getLeadById(leadId);
  if (!sequence || !lead) return null;

  const steps = getSequenceSteps(sequenceId);
  const step = steps.find((s) => s.step_number === stepNumber);
  if (!step) return null;

  return renderEmail(step.subject_template, step.body_template, lead, {
    includePersonalizedOpening: stepNumber === 1,
  });
}

// ── Util ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}