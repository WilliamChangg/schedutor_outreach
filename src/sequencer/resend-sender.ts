import { Resend } from 'resend';
import { logSend, shouldPauseSending } from '../db/index.js';

// ── Environment ─────────────────────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'william@schedutor.com';
const FROM_NAME = process.env.FROM_NAME || 'William';

// ── Client ──────────────────────────────────────────────────────────────────

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    if (!RESEND_API_KEY) {
      throw new Error('Resend API key not configured. Set RESEND_API_KEY in .env');
    }
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
  leadId: string;
  emailId: string;
  sequenceId?: string;
  stepNumber?: number;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  sendLogId?: string;
  error?: string;
}

// ── Strip HTML to plain text ────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Core send (plain text only) ─────────────────────────────────────────────

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const pauseCheck = shouldPauseSending();
  if (pauseCheck.pause) {
    return { success: false, error: `Sending paused: ${pauseCheck.reason}` };
  }

  const client = getResendClient();
  const plainBody = options.textBody || stripHtml(options.htmlBody);

  try {
    const { data, error } = await client.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [options.to],
      subject: options.subject,
      text: plainBody,
      replyTo: options.replyTo || FROM_EMAIL,
    });

    if (error) {
      const sendLog = logSend({
        lead_id: options.leadId,
        email_id: options.emailId,
        sequence_id: options.sequenceId || null,
        step_number: options.stepNumber || null,
        ses_message_id: null,
        status: 'bounced',
        sent_at: new Date().toISOString(),
      });
      return { success: false, sendLogId: sendLog.id, error: error.message };
    }

    const messageId = data?.id;
    const sendLog = logSend({
      lead_id: options.leadId,
      email_id: options.emailId,
      sequence_id: options.sequenceId || null,
      step_number: options.stepNumber || null,
      ses_message_id: messageId || null,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    return { success: true, messageId: messageId ?? undefined, sendLogId: sendLog.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const sendLog = logSend({
      lead_id: options.leadId,
      email_id: options.emailId,
      sequence_id: options.sequenceId || null,
      step_number: options.stepNumber || null,
      ses_message_id: null,
      status: 'bounced',
      sent_at: new Date().toISOString(),
    });
    return { success: false, sendLogId: sendLog.id, error: errorMessage };
  }
}

// ── Raw send (no logging, no pause check – used for test emails) ────────────

export async function sendRawEmail(options: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const client = getResendClient();

  try {
    const { data, error } = await client.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [options.to],
      subject: options.subject,
      text: options.text,
      replyTo: options.replyTo || FROM_EMAIL,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, messageId: data?.id ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ── Test connection (sends real rendered email) ─────────────────────────────

export async function testResendConnection(testEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getResendClient();

    const { getAllSequences, getSequenceSteps, getAllLeads } = await import('../db/index.js');
    const { renderEmail } = await import('./template-engine.js');

    const sequences = getAllSequences();
    const leads = getAllLeads(10);

    if (sequences.length === 0 || leads.length === 0) {
      return {
        success: false,
        error: 'No sequences or leads found. Import a sequence and discover some leads first.',
      };
    }

    const steps = getSequenceSteps(sequences[0].id);
    if (steps.length === 0) {
      return { success: false, error: 'Sequence has no steps.' };
    }

    // Pick a random lead so each test looks different
    const lead = leads[Math.floor(Math.random() * leads.length)];

    const rendered = renderEmail(
      steps[0].subject_template,
      steps[0].body_template,
      lead,
      { includePersonalizedOpening: true },
    );

    const plainBody = stripHtml(rendered.body);

    const { error } = await client.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [testEmail],
      subject: `[TEST] ${rendered.subject}`,
      text: plainBody,
      replyTo: FROM_EMAIL,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ── Config check ────────────────────────────────────────────────────────────

export function isResendConfigured(): boolean {
  return !!(RESEND_API_KEY && FROM_EMAIL);
}