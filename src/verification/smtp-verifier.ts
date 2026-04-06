import { promises as dns } from 'dns';
import * as net from 'net';
import { smtpRateLimiter } from '../utils/rate-limiter.js';
import {
  updateEmailVerificationStatus,
  getUnverifiedEmails,
  type LeadEmail
} from '../db/index.js';

// Disposable email domains to reject
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com',
  'throwaway.email', 'fakeinbox.com', 'trashmail.com', 'yopmail.com',
  'getnada.com', 'temp-mail.org', 'dispostable.com', 'maildrop.cc'
]);

// Common catch-all indicators
const CATCH_ALL_INDICATORS = [
  'accept all',
  'accepted',
  '250 ok',
  '250 2.1.5'
];

export interface VerificationResult {
  email: string;
  status: LeadEmail['verification_status'];
  mxRecords: string[];
  smtpResponse?: string;
  isCatchAll: boolean;
  isDisposable: boolean;
  error?: string;
}

/**
 * Get MX records for a domain
 */
async function getMxRecords(domain: string): Promise<string[]> {
  try {
    const records = await dns.resolveMx(domain);
    // Sort by priority (lower is better)
    return records
      .sort((a, b) => a.priority - b.priority)
      .map(r => r.exchange);
  } catch (error) {
    return [];
  }
}

/**
 * Check if domain is a known disposable email provider
 */
function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

/**
 * Connect to SMTP server and verify email with RCPT TO
 */
async function smtpVerify(
  email: string,
  mxHost: string,
  timeout: number = 10000
): Promise<{ accepted: boolean; response: string; error?: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let response = '';
    let step = 0;
    const domain = email.split('@')[1];

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve({ accepted: false, response: 'timeout', error: 'Connection timeout' });
    }, timeout);

    socket.on('error', (err) => {
      clearTimeout(timer);
      cleanup();
      resolve({ accepted: false, response: '', error: err.message });
    });

    socket.on('data', (data) => {
      const line = data.toString();
      response += line;

      // Check for SMTP response codes
      const code = parseInt(line.substring(0, 3), 10);

      if (step === 0 && code === 220) {
        // Server ready, send EHLO
        step = 1;
        socket.write(`EHLO verify.schedutor.com\r\n`);
      } else if (step === 1 && code === 250) {
        // EHLO accepted, send MAIL FROM
        step = 2;
        socket.write(`MAIL FROM:<verify@schedutor.com>\r\n`);
      } else if (step === 2 && code === 250) {
        // MAIL FROM accepted, send RCPT TO
        step = 3;
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (step === 3) {
        // RCPT TO response - this determines if email is valid
        clearTimeout(timer);
        socket.write('QUIT\r\n');
        cleanup();

        if (code === 250 || code === 251) {
          resolve({ accepted: true, response: line.trim() });
        } else if (code === 550 || code === 551 || code === 552 || code === 553) {
          // User not found / rejected
          resolve({ accepted: false, response: line.trim() });
        } else if (code === 450 || code === 451 || code === 452) {
          // Temporary failure - treat as unknown
          resolve({ accepted: false, response: line.trim(), error: 'Temporary failure' });
        } else {
          resolve({ accepted: false, response: line.trim() });
        }
      } else if (code >= 400) {
        // Error response
        clearTimeout(timer);
        cleanup();
        resolve({ accepted: false, response: line.trim(), error: `SMTP error: ${code}` });
      }
    });

    socket.on('close', () => {
      clearTimeout(timer);
    });

    // Connect to MX server on port 25
    socket.connect(25, mxHost);
  });
}

/**
 * Check if domain is a catch-all (accepts any email)
 */
async function checkCatchAll(domain: string, mxHost: string): Promise<boolean> {
  // Generate a random email that shouldn't exist
  const randomEmail = `nonexistent_${Date.now()}_${Math.random().toString(36).substring(7)}@${domain}`;

  try {
    const result = await smtpVerify(randomEmail, mxHost, 8000);
    return result.accepted;
  } catch {
    return false;
  }
}

/**
 * Verify a single email address
 */
export async function verifyEmail(email: string): Promise<VerificationResult> {
  const result: VerificationResult = {
    email,
    status: 'unknown',
    mxRecords: [],
    isCatchAll: false,
    isDisposable: false
  };

  // Basic format validation
  if (!email || !email.includes('@')) {
    result.status = 'invalid';
    result.error = 'Invalid email format';
    return result;
  }

  const domain = email.split('@')[1].toLowerCase();

  // Check for disposable domains
  if (isDisposableDomain(domain)) {
    result.status = 'invalid';
    result.isDisposable = true;
    result.error = 'Disposable email domain';
    return result;
  }

  // Get MX records
  await smtpRateLimiter.waitForSlot();
  const mxRecords = await getMxRecords(domain);
  result.mxRecords = mxRecords;

  if (mxRecords.length === 0) {
    result.status = 'invalid';
    result.error = 'No MX records found';
    return result;
  }

  // Try SMTP verification with the primary MX
  const primaryMx = mxRecords[0];

  try {
    await smtpRateLimiter.waitForSlot();
    const smtpResult = await smtpVerify(email, primaryMx);
    result.smtpResponse = smtpResult.response;

    if (smtpResult.error && smtpResult.error.includes('timeout')) {
      result.status = 'unknown';
      result.error = 'SMTP timeout';
      return result;
    }

    if (smtpResult.accepted) {
      // Check if it's a catch-all domain
      await smtpRateLimiter.waitForSlot();
      const isCatchAll = await checkCatchAll(domain, primaryMx);
      result.isCatchAll = isCatchAll;

      if (isCatchAll) {
        result.status = 'catch_all';
      } else {
        result.status = 'valid';
      }
    } else if (smtpResult.error) {
      result.status = 'unknown';
      result.error = smtpResult.error;
    } else {
      result.status = 'invalid';
    }
  } catch (error) {
    result.status = 'unknown';
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return result;
}

/**
 * Verify an email and update the database
 */
export async function verifyAndUpdateEmail(emailId: string, email: string): Promise<VerificationResult> {
  const result = await verifyEmail(email);
  updateEmailVerificationStatus(emailId, result.status);
  return result;
}

/**
 * Batch verify all unverified emails
 */
export async function verifyUnverifiedEmails(
  limit: number = 100,
  onProgress?: (completed: number, total: number, result: VerificationResult) => void
): Promise<{
  total: number;
  valid: number;
  invalid: number;
  catchAll: number;
  unknown: number;
}> {
  const emails = getUnverifiedEmails(limit);
  const stats = { total: emails.length, valid: 0, invalid: 0, catchAll: 0, unknown: 0 };

  for (let i = 0; i < emails.length; i++) {
    const emailRecord = emails[i];
    const result = await verifyAndUpdateEmail(emailRecord.id, emailRecord.email);

    switch (result.status) {
      case 'valid':
        stats.valid++;
        break;
      case 'invalid':
        stats.invalid++;
        break;
      case 'catch_all':
        stats.catchAll++;
        break;
      default:
        stats.unknown++;
    }

    if (onProgress) {
      onProgress(i + 1, emails.length, result);
    }
  }

  return stats;
}
