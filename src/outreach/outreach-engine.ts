import {
  getLeadsEligibleForOutreach,
  hasReceivedOutreach,
  getTodaySendCount,
  shouldPauseSending,
  getLeadById,
  getLeadEmailById,
  type Lead,
} from '../db/index.js';
import { sendEmail, isResendConfigured } from '../sequencer/resend-sender.js';
import {
  getEffectiveDailyLimit,
  getRandomDelay,
  isWithinSendingWindow,
} from '../sequencer/sending-config.js';
import { OUTREACH_SUBJECT, OUTREACH_BODY } from './template.js';

export interface OutreachSendResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  dailyLimitReached: boolean;
  errors: string[];
}

/**
 * Render the fixed outreach template with lead data.
 */
export function renderOutreachEmail(lead: Lead): { subject: string; body: string } {
  const teamName = lead.business_name;

  return {
    subject: OUTREACH_SUBJECT.replace('{{business_name}}', teamName),
    body: OUTREACH_BODY.replace(/\{\{business_name\}\}/g, teamName),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Process the outreach send queue.
 * Sends the single outreach email to eligible leads.
 */
export async function processOutreachQueue(
  limit = 50,
  onProgress?: (sent: number, total: number, lead: Lead, delayMs: number) => void,
): Promise<OutreachSendResult> {
  const result: OutreachSendResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    dailyLimitReached: false,
    errors: [],
  };

  // Gate checks
  if (!isResendConfigured()) {
    result.errors.push('Resend not configured');
    return result;
  }

  if (!isWithinSendingWindow()) {
    result.errors.push('Outside sending window');
    return result;
  }

  const pauseCheck = shouldPauseSending();
  if (pauseCheck.pause) {
    result.errors.push(`Sending paused: ${pauseCheck.reason}`);
    return result;
  }

  // Daily limit check
  const dailyLimit = getEffectiveDailyLimit();
  const sentToday = getTodaySendCount();
  const remainingToday = Math.max(0, dailyLimit - sentToday);

  if (remainingToday === 0) {
    result.dailyLimitReached = true;
    result.errors.push(`Daily limit reached (${dailyLimit}/day)`);
    return result;
  }

  const effectiveLimit = Math.min(limit, remainingToday);
  const eligibleLeads = getLeadsEligibleForOutreach(effectiveLimit);

  for (const leadData of eligibleLeads) {
    // Re-check limits each iteration
    if (result.sent + sentToday >= dailyLimit) {
      result.dailyLimitReached = true;
      break;
    }

    if (!isWithinSendingWindow()) {
      result.errors.push('Sending window closed');
      break;
    }

    result.processed++;

    const lead = getLeadById(leadData.id);
    const email = getLeadEmailById(leadData.email_id);

    if (!lead || !email) {
      result.skipped++;
      continue;
    }

    // Double-check hasn't received outreach
    if (hasReceivedOutreach(lead.id)) {
      result.skipped++;
      continue;
    }

    const { subject, body } = renderOutreachEmail(lead);

    const sendResult = await sendEmail({
      to: email.email,
      subject,
      htmlBody: body,
      leadId: lead.id,
      emailId: email.id,
      sequenceId: undefined, // NULL marks as single outreach
      stepNumber: undefined,
    });

    if (sendResult.success) {
      result.sent++;
    } else {
      result.failed++;
      result.errors.push(`Failed: ${email.email} - ${sendResult.error}`);
    }

    // Humanized delay between sends
    if (result.processed < eligibleLeads.length) {
      const delay = getRandomDelay();
      if (onProgress) {
        onProgress(result.sent, eligibleLeads.length, lead, delay);
      }
      await sleep(delay);
    } else if (onProgress) {
      onProgress(result.sent, eligibleLeads.length, lead, 0);
    }
  }

  return result;
}

/**
 * Get count of leads eligible for outreach.
 */
export function getOutreachEligibleCount(): number {
  return getLeadsEligibleForOutreach(10000).length;
}
