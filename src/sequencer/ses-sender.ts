import { SESClient, SendEmailCommand, type SendEmailCommandInput } from '@aws-sdk/client-ses';
import { logSend, updateSendStatus, shouldPauseSending, type SendLogEntry } from '../db/index.js';

// Load from environment
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'hello@mail.schedutor.com';
const SES_FROM_NAME = process.env.SES_FROM_NAME || 'Schedutor';
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || '123 Main St, Suite 100, San Francisco, CA 94102';
const UNSUBSCRIBE_URL = process.env.UNSUBSCRIBE_URL || 'https://schedutor.com/unsubscribe';

// Initialize SES client
let sesClient: SESClient | null = null;

function getSESClient(): SESClient {
  if (!sesClient) {
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env');
    }

    sesClient = new SESClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
      }
    });
  }
  return sesClient;
}

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

/**
 * Generate CAN-SPAM compliant footer
 */
export function generateComplianceFooter(unsubscribeToken?: string): { html: string; text: string } {
  const unsubscribeLink = unsubscribeToken
    ? `${UNSUBSCRIBE_URL}?token=${unsubscribeToken}`
    : UNSUBSCRIBE_URL;

  const html = `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
      <p>${SES_FROM_NAME}<br>${COMPANY_ADDRESS}</p>
      <p>
        <a href="${unsubscribeLink}" style="color: #666;">Unsubscribe</a> |
        You're receiving this because your business was listed as a tutoring service.
      </p>
    </div>
  `;

  const text = `
---
${SES_FROM_NAME}
${COMPANY_ADDRESS}

Unsubscribe: ${unsubscribeLink}
You're receiving this because your business was listed as a tutoring service.
  `.trim();

  return { html, text };
}

/**
 * Send an email via Amazon SES
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  // Check if we should pause sending
  const pauseCheck = shouldPauseSending();
  if (pauseCheck.pause) {
    return {
      success: false,
      error: `Sending paused: ${pauseCheck.reason}`
    };
  }

  const client = getSESClient();

  // Add compliance footer
  const footer = generateComplianceFooter();
  const fullHtmlBody = options.htmlBody + footer.html;
  const fullTextBody = (options.textBody || stripHtml(options.htmlBody)) + '\n\n' + footer.text;

  const params: SendEmailCommandInput = {
    Source: `${SES_FROM_NAME} <${SES_FROM_EMAIL}>`,
    Destination: {
      ToAddresses: [options.to]
    },
    Message: {
      Subject: {
        Data: options.subject,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: fullHtmlBody,
          Charset: 'UTF-8'
        },
        Text: {
          Data: fullTextBody,
          Charset: 'UTF-8'
        }
      }
    },
    ReplyToAddresses: options.replyTo ? [options.replyTo] : [SES_FROM_EMAIL]
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await client.send(command);

    const messageId = response.MessageId;

    // Log the send
    const sendLog = logSend({
      lead_id: options.leadId,
      email_id: options.emailId,
      sequence_id: options.sequenceId || null,
      step_number: options.stepNumber || null,
      ses_message_id: messageId || null,
      status: 'sent',
      sent_at: new Date().toISOString()
    });

    return {
      success: true,
      messageId,
      sendLogId: sendLog.id
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log failed attempt
    const sendLog = logSend({
      lead_id: options.leadId,
      email_id: options.emailId,
      sequence_id: options.sequenceId || null,
      step_number: options.stepNumber || null,
      ses_message_id: null,
      status: 'bounced', // Mark as bounced for failed sends
      sent_at: new Date().toISOString()
    });

    return {
      success: false,
      sendLogId: sendLog.id,
      error: errorMessage
    };
  }
}

/**
 * Strip HTML tags for plain text version
 */
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

/**
 * Test SES connection by sending a test email
 */
export async function testSESConnection(testEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    const client = getSESClient();

    const params: SendEmailCommandInput = {
      Source: `${SES_FROM_NAME} <${SES_FROM_EMAIL}>`,
      Destination: {
        ToAddresses: [testEmail]
      },
      Message: {
        Subject: {
          Data: 'Schedutor SES Test',
          Charset: 'UTF-8'
        },
        Body: {
          Text: {
            Data: 'This is a test email from Schedutor to verify SES configuration is working.',
            Charset: 'UTF-8'
          }
        }
      }
    };

    const command = new SendEmailCommand(params);
    await client.send(command);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check if SES is configured
 */
export function isSESConfigured(): boolean {
  return !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && SES_FROM_EMAIL);
}
