import { request } from 'undici';
import * as cheerio from 'cheerio';
import { scrapingRateLimiter, processInParallel } from '../utils/rate-limiter.js';
import {
  insertLeadEmail,
  emailExistsForLead,
  insertOrUpdateEnrichment,
  getLeadById,
  getLeadsWithoutEmails,
  type Lead,
  type LeadEmail
} from '../db/index.js';

// Common email patterns to validate
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const MAX_EMAILS = 2;

// Paths to check for contact information - PRIORITY ORDER: contact pages first, then homepage
const CONTACT_PATHS = [
  '/contact',
  '/contact-us',
  '/about',
  '/about-us',
  '', // Homepage last - usually has less specific contact info
];

// Keywords that indicate scheduling tools
const SCHEDULING_TOOLS = [
  'calendly',
  'acuity',
  'schedulicity',
  'setmore',
  'square appointments',
  'booksy',
  'timely',
  'vcita',
  'appointy',
  'picktime',
  'simplybook',
  'tutor cruncher',
  'tutorcruncher',
  'teachworks',
  'my tutor source',
  'tutorbird'
];

// Keywords indicating multiple tutors
const MULTI_TUTOR_KEYWORDS = [
  'our tutors',
  'our team',
  'meet our',
  'staff',
  'instructors',
  'educators',
  'teachers',
  'specialists'
];

// Disposable/invalid email domains to filter
const INVALID_DOMAINS = [
  'example.com',
  'test.com',
  'localhost',
  'domain.com',
  'email.com',
  'your-email.com',
  'yoursite.com',
  'website.com',
  'company.com'
];

interface PageContent {
  html: string;
  text: string;
  url: string;
}

interface EnrichmentData {
  emails: Array<{
    email: string;
    context: string;
    role: LeadEmail['role'];
  }>;
  hasMultipleTutors: boolean;
  existingSchedulingTool: string | null;
  linkedinUrl: string | null;
  facebookUrl: string | null;
  specialties: string[];
}

async function fetchPage(url: string): Promise<PageContent | null> {
  await scrapingRateLimiter.waitForSlot();
  try {
    const response = await request(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      maxRedirections: 3,
      headersTimeout: 10000,
      bodyTimeout: 15000
    });

    if (response.statusCode !== 200) {
      return null;
    }

    const html = await response.body.text();
    const $ = cheerio.load(html);

    // Remove scripts and styles
    $('script, style, noscript').remove();

    return {
      html,
      text: $('body').text().replace(/\s+/g, ' ').trim(),
      url
    };
  } catch (error) {
    // Silently fail on network errors
    return null;
  } finally {
    scrapingRateLimiter.releaseSlot();
  }
}

function extractEmails(text: string, html: string, maxEmails: number = MAX_EMAILS): Array<{ email: string; context: string }> {
  const emails: Array<{ email: string; context: string }> = [];
  const seen = new Set<string>();
  const $ = cheerio.load(html);

  // Helper to add email if valid and not seen
  const addEmail = (email: string, context: string): boolean => {
    if (emails.length >= maxEmails) return false;
    const lowerEmail = email.toLowerCase();
    if (!seen.has(lowerEmail) && isValidEmail(lowerEmail)) {
      seen.add(lowerEmail);
      emails.push({ email: lowerEmail, context: context.trim() });
      return true;
    }
    return false;
  };

  // PRIORITY 1: mailto: links (most reliable)
  $('a[href^="mailto:"]').each((_, el) => {
    if (emails.length >= maxEmails) return false;
    const href = $(el).attr('href');
    if (href) {
      const email = href.replace('mailto:', '').split('?')[0].trim();
      const linkText = $(el).text().trim();
      addEmail(email, linkText || 'mailto link');
    }
  });
  if (emails.length >= maxEmails) return emails;

  // PRIORITY 2: Footer section (often has business contact)
  const footerSelectors = ['footer', '#footer', '.footer', '[role="contentinfo"]', '.site-footer'];
  for (const selector of footerSelectors) {
    if (emails.length >= maxEmails) break;
    const footerHtml = $(selector).html() || '';
    const footerText = $(selector).text() || '';
    const footerEmails = (footerText + ' ' + footerHtml).match(EMAIL_REGEX) || [];
    for (const email of footerEmails) {
      if (emails.length >= maxEmails) break;
      addEmail(email, 'footer');
    }
  }
  if (emails.length >= maxEmails) return emails;

  // PRIORITY 3: Contact sections
  const contactSelectors = ['#contact', '.contact', '[class*="contact"]', '#get-in-touch', '.get-in-touch'];
  for (const selector of contactSelectors) {
    if (emails.length >= maxEmails) break;
    const sectionText = $(selector).text() || '';
    const sectionEmails = sectionText.match(EMAIL_REGEX) || [];
    for (const email of sectionEmails) {
      if (emails.length >= maxEmails) break;
      addEmail(email, 'contact section');
    }
  }
  if (emails.length >= maxEmails) return emails;

  // PRIORITY 4: Full page text (fallback)
  const textMatches = text.match(EMAIL_REGEX) || [];
  for (const email of textMatches) {
    if (emails.length >= maxEmails) break;
    // Try to find context around the email
    const contextMatch = text.match(new RegExp(`.{0,50}${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.{0,50}`, 'i'));
    addEmail(email, contextMatch ? contextMatch[0] : '');
  }

  return emails;
}

function isValidEmail(email: string): boolean {
  // Basic format check
  if (!email.includes('@') || !email.includes('.')) {
    return false;
  }

  const domain = email.split('@')[1];

  // Check for invalid domains
  if (INVALID_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) {
    return false;
  }

  // Check for image/asset emails (often found in src attributes)
  if (email.includes('/') || email.includes('\\')) {
    return false;
  }

  // Check for common non-email patterns
  if (email.endsWith('.png') || email.endsWith('.jpg') || email.endsWith('.gif')) {
    return false;
  }

  return true;
}

async function fetchWithRetry(url: string, retries = 2): Promise<PageContent | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await fetchPage(url);

    if (result) return result;

    // exponential backoff
    const delay = 1000 * Math.pow(2, attempt);
    await new Promise(res => setTimeout(res, delay));
  }

  return null;
}
function classifyEmailRole(email: string, context: string): LeadEmail['role'] {
  const emailLower = email.toLowerCase();
  const contextLower = context.toLowerCase();

  // Check for owner/founder indicators
  if (contextLower.includes('owner') || contextLower.includes('founder') || contextLower.includes('ceo') || contextLower.includes('director')) {
    return 'owner';
  }

  // Check for admin/staff indicators
  if (contextLower.includes('admin') || contextLower.includes('manager') || contextLower.includes('coordinator')) {
    return 'admin';
  }

  // Check email prefix patterns
  const prefix = emailLower.split('@')[0];
  if (['info', 'hello', 'contact', 'inquiries', 'support', 'help'].includes(prefix)) {
    return 'info';
  }

  // If it looks like a person's name (e.g., john@, john.smith@), might be owner for small businesses
  if (/^[a-z]+(\.[a-z]+)?$/.test(prefix) && !['info', 'contact', 'admin', 'support'].includes(prefix)) {
    return 'owner';
  }

  return 'unknown';
}

function detectSchedulingTool(html: string, text: string): string | null {
  const combined = (html + ' ' + text).toLowerCase();

  for (const tool of SCHEDULING_TOOLS) {
    if (combined.includes(tool)) {
      return tool;
    }
  }

  return null;
}

function detectMultipleTutors(text: string): boolean {
  const textLower = text.toLowerCase();

  for (const keyword of MULTI_TUTOR_KEYWORDS) {
    if (textLower.includes(keyword)) {
      return true;
    }
  }

  return false;
}

function extractSocialLinks(html: string): { linkedin: string | null; facebook: string | null } {
  const $ = cheerio.load(html);
  let linkedin: string | null = null;
  let facebook: string | null = null;

  $('a[href*="linkedin.com"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('linkedin.com/company')) {
      linkedin = href;
    }
  });

  $('a[href*="facebook.com"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !href.includes('sharer') && !href.includes('share.php')) {
      facebook = href;
    }
  });

  return { linkedin, facebook };
}

function extractSpecialties(text: string): string[] {
  const specialties: string[] = [];
  const textLower = text.toLowerCase();

  const subjectKeywords = [
    'math', 'mathematics', 'algebra', 'geometry', 'calculus',
    'reading', 'writing', 'english', 'essay',
    'science', 'physics', 'chemistry', 'biology',
    'sat', 'act', 'gre', 'gmat', 'lsat', 'mcat',
    'spanish', 'french', 'mandarin', 'chinese',
    'coding', 'programming', 'computer science',
    'elementary', 'middle school', 'high school', 'college',
    'test prep', 'homework help', 'study skills'
  ];

  for (const subject of subjectKeywords) {
    if (textLower.includes(subject)) {
      specialties.push(subject);
    }
  }

  return [...new Set(specialties)].slice(0, 10); // Dedupe and limit
}

export async function enrichLead(lead: Lead): Promise<EnrichmentData> {
  const result: EnrichmentData = {
    emails: [],
    hasMultipleTutors: false,
    existingSchedulingTool: null,
    linkedinUrl: null,
    facebookUrl: null,
    specialties: []
  };

  if (!lead.website) {
    return result;
  }

  // Normalize website URL
  let baseUrl = lead.website;
  if (!baseUrl.startsWith('http')) {
    baseUrl = 'https://' + baseUrl;
  }
  baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash

  const allHtml: string[] = [];
  const allText: string[] = [];

  // Fetch multiple pages
  for (const path of CONTACT_PATHS) {
  // Early exit if we already have enough emails
    if (result.emails.length >= MAX_EMAILS) {
      break;
    }

    const url = baseUrl + path;
    const page = await fetchWithRetry(url);

    if (page) {
      allHtml.push(page.html);
      allText.push(page.text);

      const pageEmails = extractEmails(page.text, page.html);
      for (const { email, context } of pageEmails) {
        if (result.emails.length >= MAX_EMAILS) break;

        const existing = result.emails.find(e => e.email === email);
        if (!existing) {
          result.emails.push({
            email,
            context,
            role: classifyEmailRole(email, context)
          });
        }
      }

      if (!result.existingSchedulingTool) {
        result.existingSchedulingTool = detectSchedulingTool(page.html, page.text);
      }

      if (!result.hasMultipleTutors) {
        result.hasMultipleTutors = detectMultipleTutors(page.text);
      }

      const social = extractSocialLinks(page.html);
      if (social.linkedin && !result.linkedinUrl) {
        result.linkedinUrl = social.linkedin;
      }
      if (social.facebook && !result.facebookUrl) {
        result.facebookUrl = social.facebook;
      }
    }
  }

  // Extract specialties from combined text
  result.specialties = extractSpecialties(allText.join(' '));

  return result;
}

export async function enrichAndSaveLead(leadId: string): Promise<{
  emailsFound: number;
  enrichmentSaved: boolean;
}> {
  const lead = getLeadById(leadId);
  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  const enrichment = await enrichLead(lead);

  // Save emails
  let emailsAdded = 0;
  for (const { email, role } of enrichment.emails) {
    if (!emailExistsForLead(leadId, email)) {
      insertLeadEmail({
        lead_id: leadId,
        email,
        contact_name: null,
        role,
        verification_status: 'unverified',
        source: 'scraped',
        is_primary: emailsAdded === 0 ? 1 : 0 // First email is primary
      });
      emailsAdded++;
    }
  }

  // Save enrichment data
  insertOrUpdateEnrichment({
    lead_id: leadId,
    has_multiple_tutors: enrichment.hasMultipleTutors ? 1 : 0,
    existing_scheduling_tool: enrichment.existingSchedulingTool,
    linkedin_url: enrichment.linkedinUrl,
    facebook_url: enrichment.facebookUrl,
    founded_year: null,
    team_size_estimate: null,
    specialties: enrichment.specialties.length > 0 ? JSON.stringify(enrichment.specialties) : null,
    raw_data: null
  });

  return {
    emailsFound: emailsAdded,
    enrichmentSaved: true
  };
}

// Generate common email patterns for a domain
export function generateEmailPatterns(domain: string, firstName?: string, lastName?: string): string[] {
  const patterns: string[] = [
    `info@${domain}`,
    `hello@${domain}`,
    `contact@${domain}`,
    `inquiries@${domain}`,
    `admin@${domain}`
  ];

  if (firstName) {
    const first = firstName.toLowerCase();
    patterns.push(`${first}@${domain}`);

    if (lastName) {
      const last = lastName.toLowerCase();
      patterns.push(`${first}.${last}@${domain}`);
      patterns.push(`${first}${last}@${domain}`);
      patterns.push(`${first[0]}${last}@${domain}`);
    }
  }

  return patterns;
}

export interface BatchEnrichmentResult {
  total: number;
  processed: number;
  emailsFound: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface BatchEnrichmentOptions {
  concurrency?: number;
  retries?: number;
  onProgress?: (result: BatchEnrichmentResult, lead: Lead, emailsFound: number) => void;
}

/**
 * Batch enrich multiple leads in parallel with rate limiting
 */
export async function enrichLeadsBatch(
  leads: Lead[],
  options: BatchEnrichmentOptions = {}
): Promise<BatchEnrichmentResult> {
  const { concurrency = 5, retries = 2, onProgress } = options;

  const result: BatchEnrichmentResult = {
    total: leads.length,
    processed: 0,
    emailsFound: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0
  };

  // Filter leads that have websites
  const leadsWithWebsites = leads.filter(l => l.website);
  result.skipped = leads.length - leadsWithWebsites.length;

  if (leadsWithWebsites.length === 0) {
    return result;
  }

  await processInParallel(
    leadsWithWebsites,
    async (lead) => {
      const enrichResult = await enrichAndSaveLead(lead.id);
      return { lead, emailsFound: enrichResult.emailsFound };
    },
    {
      concurrency,
      retries,
      retryDelayMs: 2000,
      onProgress: (completed, _total, { lead, emailsFound }) => {
        result.processed = completed;
        result.emailsFound += emailsFound;
        result.succeeded++;
        if (onProgress) {
          onProgress(result, lead, emailsFound);
        }
      },
      onError: (error, lead) => {
        result.processed++;
        result.failed++;
        console.error(`Failed to enrich ${lead.business_name}: ${error.message}`);
      }
    }
  );

  return result;
}

/**
 * Enrich all leads without emails in parallel batches
 */
export async function enrichAllLeadsWithoutEmails(
  options: BatchEnrichmentOptions & { limit?: number } = {}
): Promise<BatchEnrichmentResult> {
  const { limit, ...batchOptions } = options;
  let leads = getLeadsWithoutEmails();

  if (limit && limit > 0) {
    leads = leads.slice(0, limit);
  }

  return enrichLeadsBatch(leads, batchOptions);
}
