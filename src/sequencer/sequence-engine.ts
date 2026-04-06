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
  shouldPauseSending,
  type SequenceEnrollment,
  type Sequence,
  type Lead
} from '../db/index.js';
import { sendEmail, isSESConfigured } from './ses-sender.js';
import { renderEmail } from './template-engine.js';

export interface ProcessQueueResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export interface EnrollmentResult {
  enrolled: number;
  skipped: number;
  errors: string[];
}

/**
 * Process the send queue - send emails that are due
 */
export async function processSendQueue(
  limit = 50,
  onProgress?: (sent: number, total: number, lead: Lead) => void
): Promise<ProcessQueueResult> {
  const result: ProcessQueueResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  // Check if SES is configured
  if (!isSESConfigured()) {
    result.errors.push('SES not configured - set AWS credentials in .env');
    return result;
  }

  // Check if sending should be paused
  const pauseCheck = shouldPauseSending();
  if (pauseCheck.pause) {
    result.errors.push(`Sending paused: ${pauseCheck.reason}`);
    return result;
  }

  // Get enrollments due for send
  const dueEnrollments = getEnrollmentsDueForSend(limit);

  for (const enrollment of dueEnrollments) {
    result.processed++;

    try {
      // Get full lead and email data
      const lead = getLeadById(enrollment.lead_id);
      const email = getLeadEmailById(enrollment.email_id);
      const sequence = getSequenceById(enrollment.sequence_id);

      if (!lead || !email || !sequence) {
        result.skipped++;
        result.errors.push(`Missing data for enrollment ${enrollment.id}`);
        continue;
      }

      // Get the current step template
      const steps = getSequenceSteps(sequence.id);
      const nextStepNumber = enrollment.current_step + 1;
      const step = steps.find(s => s.step_number === nextStepNumber);

      if (!step) {
        // No more steps - mark as complete
        updateEnrollmentStatus(enrollment.id, 'completed');
        result.skipped++;
        continue;
      }

      // Render the email
      const { subject, body } = renderEmail(
        step.subject_template,
        step.body_template,
        lead,
        { includePersonalizedOpening: nextStepNumber === 1 } // Personalize first email
      );

      // Send the email
      const sendResult = await sendEmail({
        to: email.email,
        subject,
        htmlBody: body,
        leadId: lead.id,
        emailId: email.id,
        sequenceId: sequence.id,
        stepNumber: nextStepNumber
      });

      if (sendResult.success) {
        result.sent++;
        // Advance to next step
        advanceEnrollmentStep(enrollment.id, nextStepNumber + 1, sequence.total_steps);

        if (onProgress) {
          onProgress(result.sent, dueEnrollments.length, lead);
        }
      } else {
        result.failed++;
        result.errors.push(`Failed to send to ${email.email}: ${sendResult.error}`);

        // If it's a bounce, update enrollment status
        if (sendResult.error?.includes('bounce') || sendResult.error?.includes('invalid')) {
          updateEnrollmentStatus(enrollment.id, 'bounced');
        }
      }

      // Rate limit: wait between sends
      await sleep(200);

    } catch (error) {
      result.failed++;
      result.errors.push(`Error processing enrollment ${enrollment.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return result;
}

/**
 * Enroll leads in a sequence
 */
export function enrollLeadsInSequence(
  sequenceId: string,
  limit = 100,
  onProgress?: (enrolled: number, lead: Lead) => void
): EnrollmentResult {
  const result: EnrollmentResult = {
    enrolled: 0,
    skipped: 0,
    errors: []
  };

  const sequence = getSequenceById(sequenceId);
  if (!sequence) {
    result.errors.push(`Sequence not found: ${sequenceId}`);
    return result;
  }

  if (sequence.status !== 'active') {
    result.errors.push(`Sequence is not active: ${sequence.status}`);
    return result;
  }

  // Get eligible leads
  const eligibleLeads = getLeadsEligibleForEnrollment(sequenceId, limit);

  for (const lead of eligibleLeads) {
    try {
      enrollLeadInSequence(lead.id, sequenceId, lead.email_id);
      result.enrolled++;

      if (onProgress) {
        onProgress(result.enrolled, lead);
      }
    } catch (error) {
      result.skipped++;
      result.errors.push(`Failed to enroll ${lead.business_name}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return result;
}

/**
 * Get sequence engine status
 */
export function getSequenceEngineStatus(): {
  sesConfigured: boolean;
  sendingPaused: boolean;
  pauseReason?: string;
  enrollmentStats: ReturnType<typeof getEnrollmentStats>;
  sendStats: ReturnType<typeof getSendStats>;
} {
  const pauseCheck = shouldPauseSending();

  return {
    sesConfigured: isSESConfigured(),
    sendingPaused: pauseCheck.pause,
    pauseReason: pauseCheck.reason,
    enrollmentStats: getEnrollmentStats(),
    sendStats: getSendStats()
  };
}

/**
 * Preview what an email would look like for a lead
 */
export function previewSequenceEmail(
  sequenceId: string,
  stepNumber: number,
  leadId: string
): { subject: string; body: string } | null {
  const sequence = getSequenceById(sequenceId);
  const lead = getLeadById(leadId);

  if (!sequence || !lead) {
    return null;
  }

  const steps = getSequenceSteps(sequenceId);
  const step = steps.find(s => s.step_number === stepNumber);

  if (!step) {
    return null;
  }

  return renderEmail(
    step.subject_template,
    step.body_template,
    lead,
    { includePersonalizedOpening: stepNumber === 1 }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
