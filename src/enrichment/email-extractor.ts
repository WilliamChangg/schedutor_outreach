import { request } from 'undici';
import * as cheerio from 'cheerio';
import { scrapingRateLimiter } from '../utils/rate-limiter.js';
import {
  insertLeadEmail,
  emailExistsForLead,
  insertOrUpdateEnrichment,
  getLeadById,
  type Lead,
  type LeadEmail
} from '../db/index.js';
import { fetchWithPuppeteer } from './puppeteer-fetcher.js';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const MAX_EMAILS = 2;
const MAX_PAGES = 12; // Cap total pages fetched per lead (increased from 6)

// ─── EXPANDED STATIC PATHS (fallback only) ──────────────────────────
const STATIC_CONTACT_PATHS = [
  '/',
  '/contact',
  '/contact-us',
  '/contact-me',
  '/contactus',
  '/get-in-touch',
  '/reach-out',
  '/about',
  '/about-us',
  '/about-me',
  '/aboutus',
  '/team',
  '/our-team',
  '/staff',
  '/people',
  '/support',
  '/help',
  '/connect',
  '/info',
  '/inquiry',
  '/inquire',
  '/location',
  '/locations',
  '/services',
  '/tutors',
  '/our-tutors',
  '/pricing',
  '/rates',
  '/faq',
  '/book',
  '/booking',
  '/schedule',
  // New paths for owner/founder info
  '/founder',
  '/owner',
  '/meet-the-team',
  '/leadership',
  '/management',
  '/director',
  '/principal',
  '/bio',
  '/biography',
  '/credentials',
  '/who-we-are',
  '/meet-us',
  '/our-story',
];

const SCHEDULING_TOOLS = [
  'calendly', 'acuity', 'schedulicity', 'setmore',
  'square appointments', 'booksy', 'timely', 'vcita',
  'appointy', 'picktime', 'simplybook', 'tutor cruncher',
  'tutorcruncher', 'teachworks', 'my tutor source', 'tutorbird',
  'youcanbook', 'doodle', 'book.me', 'hubspot meetings',
];

const MULTI_TUTOR_KEYWORDS = [
  'our tutors', 'our team', 'meet our', 'staff',
  'instructors', 'educators', 'teachers', 'specialists',
  'team members', 'our experts', 'faculty',
];

const INVALID_DOMAINS = [
  'example.com', 'test.com', 'localhost', 'domain.com',
  'email.com', 'your-email.com', 'yoursite.com',
  'website.com', 'company.com', 'sentry.io',
  'wixpress.com', 'squarespace.com', 'wordpress.com',
  'w3.org', 'schema.org', 'googleapis.com',
  'gravatar.com', 'cloudflare.com',
];

interface PageContent {
  html: string;
  text: string;
  url: string;
  $: cheerio.CheerioAPI;
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

// ─── 1. SMARTER FETCHING ────────────────────────────────────────────

// Track domains that are blocking us with time-limited blocking
interface BlockedDomain {
  blockedAt: number;
  failureCount: number;
}
const blockedDomains = new Map<string, BlockedDomain>();

// Calculate block duration: 30min base, doubles each failure, max 24hr
function getBlockDuration(failureCount: number): number {
  const baseMs = 30 * 60 * 1000; // 30 minutes
  const maxMs = 24 * 60 * 60 * 1000; // 24 hours
  return Math.min(baseMs * Math.pow(2, failureCount - 1), maxMs);
}

function isDomainBlocked(domain: string): boolean {
  const blocked = blockedDomains.get(domain);
  if (!blocked) return false;

  const blockDuration = getBlockDuration(blocked.failureCount);
  if (Date.now() - blocked.blockedAt > blockDuration) {
    // Block has expired - allow retry
    return false;
  }
  return true;
}

function markDomainBlocked(domain: string): void {
  const existing = blockedDomains.get(domain);
  blockedDomains.set(domain, {
    blockedAt: Date.now(),
    failureCount: (existing?.failureCount || 0) + 1,
  });
}

// Helper to safely read response body with error event handling
async function safeReadBody(body: import('undici').Dispatcher.ResponseData['body']): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];

    body.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    body.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    body.on('error', () => {
      // Socket closed or other error - resolve with whatever we have
      if (chunks.length > 0) {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      } else {
        resolve(null);
      }
    });
  });
}

// Check if HTML indicates bot protection (Cloudflare, etc.)
function isBotProtectionPage(html: string): boolean {
  const botIndicators = [
    'Just a moment...',
    'Checking your browser',
    'cf_chl_opt',
    'challenge-platform',
    '_cf_chl',
    'Attention Required! | Cloudflare',
    'Access denied',
    'Please verify you are a human',
    'captcha',
  ];
  return botIndicators.some(indicator => html.includes(indicator));
}

async function fetchPage(url: string): Promise<PageContent | null> {
  try {
    // Check if this domain is already known to be blocked
    const domain = new URL(url).hostname;
    if (isDomainBlocked(domain)) {
      return null;
    }

    await scrapingRateLimiter.waitForSlot();

    const response = await request(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity', // avoid compressed responses we can't parse
      },
      maxRedirections: 5,
      headersTimeout: 12000,
      bodyTimeout: 20000,
    });

    if (response.statusCode !== 200) return null;

    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null; // Skip PDFs, images, etc.
    }

    // Use safe body reader that handles socket errors
    const html = await safeReadBody(response.body);
    if (!html) {
      markDomainBlocked(domain);
      return null;
    }

    // Check for bot protection pages
    if (isBotProtectionPage(html)) {
      markDomainBlocked(domain);
      return null;
    }

    const $ = cheerio.load(html);
    $('script, style, noscript, svg').remove();

    return {
      html,
      text: $('body').text().replace(/\s+/g, ' ').trim(),
      url,
      $,
    };
  } catch {
    // On error, mark domain as blocked with time-limited backoff
    try {
      const domain = new URL(url).hostname;
      markDomainBlocked(domain);
    } catch {}
    return null;
  }
}

async function fetchWithRetry(url: string, retries = 2): Promise<PageContent | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await fetchPage(url);
    if (result) return result;
    if (attempt < retries) {
      await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempt)));
    }
  }
  return null;
}

// Try multiple URL variants: www/non-www and http/https
async function fetchWithFallback(baseUrl: string): Promise<PageContent | null> {
  const variants: string[] = [];

  try {
    const url = new URL(baseUrl);

    // Add original URL
    variants.push(url.toString());

    // Try HTTPS if HTTP
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      variants.push(url.toString());
    }

    // Try with/without www for each protocol
    const urlWithWww = new URL(baseUrl);
    const urlWithoutWww = new URL(baseUrl);

    if (urlWithWww.hostname.startsWith('www.')) {
      urlWithoutWww.hostname = urlWithWww.hostname.replace('www.', '');
    } else {
      urlWithWww.hostname = 'www.' + urlWithoutWww.hostname;
    }

    variants.push(urlWithWww.toString());
    variants.push(urlWithoutWww.toString());

    // Also try HTTPS versions
    urlWithWww.protocol = 'https:';
    urlWithoutWww.protocol = 'https:';
    variants.push(urlWithWww.toString());
    variants.push(urlWithoutWww.toString());
  } catch {
    variants.push(baseUrl);
  }

  // Dedupe and try each variant
  const uniqueVariants = [...new Set(variants)];
  for (const variant of uniqueVariants) {
    const result = await fetchWithRetry(variant, 1);
    if (result) return result;
  }

  return null;
}

// ─── 2. DYNAMIC LINK DISCOVERY ──────────────────────────────────────
// Instead of only checking hardcoded paths, discover contact/about
// links from the actual navigation of the homepage with quality scoring.

interface DiscoveredLink {
  url: string;
  score: number;
}

function discoverContactLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const found: DiscoveredLink[] = [];
  const seenUrls = new Set<string>();

  const contactPatterns =
    /\b(contact|about|team|staff|people|connect|reach|get.?in.?touch|inquiry|support|founder|owner|leadership|meet|principal)\b/i;

  // High-value link locations
  const navSelectors = ['nav', 'header', '.nav', '.navigation', '#nav', '[role="navigation"]'];
  const footerSelectors = ['footer', '.footer', '#footer', '[role="contentinfo"]'];

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    const text = $el.text().toLowerCase().trim();

    // Skip social media and external links
    if (/facebook|linkedin|twitter|instagram|youtube|tiktok/i.test(href)) {
      return;
    }

    // Match by link text OR by href path
    if (!contactPatterns.test(text) && !contactPatterns.test(href)) {
      return;
    }

    try {
      const resolved = new URL(href, baseUrl).toString();
      const base = new URL(baseUrl);
      const target = new URL(resolved);

      // Only follow links on the same domain
      if (target.hostname !== base.hostname &&
          target.hostname !== 'www.' + base.hostname &&
          'www.' + target.hostname !== base.hostname) {
        return;
      }

      // Normalize URL: strip trailing slash and query params for deduplication
      const normalized = resolved.replace(/\/$/, '').split('?')[0];

      // Calculate score based on location and text
      let score = 0;

      // Location bonuses
      const isInNav = navSelectors.some(sel => $el.closest(sel).length > 0);
      const isInFooter = footerSelectors.some(sel => $el.closest(sel).length > 0);
      if (isInNav) score += 30;
      if (isInFooter) score += 20;

      // High-value text matches (likely owner/decision maker)
      if (/founder|owner|principal|director/i.test(text)) score += 35;
      if (/contact|email|reach/i.test(text)) score += 25;
      if (/about|team|staff/i.test(text)) score += 15;
      if (/meet/i.test(text)) score += 20;

      // Path match bonuses
      if (/\/contact/i.test(href)) score += 20;
      if (/\/about/i.test(href)) score += 10;
      if (/\/team|\/staff|\/people/i.test(href)) score += 15;
      if (/\/founder|\/owner|\/leadership/i.test(href)) score += 30;

      if (seenUrls.has(normalized)) {
        // Update score if higher
        const existing = found.find(f => f.url === normalized);
        if (existing) {
          existing.score = Math.max(existing.score, score);
        }
        return;
      }
      seenUrls.add(normalized);

      found.push({ url: normalized, score });
    } catch {
      // relative URL that couldn't resolve — skip
    }
  });

  // Sort by score descending, return URLs only
  return found
    .sort((a, b) => b.score - a.score)
    .map(f => f.url);
}

// ─── 3. COMPREHENSIVE EMAIL EXTRACTION ──────────────────────────────

function extractEmails(
  page: PageContent,
  maxEmails: number = MAX_EMAILS
): Array<{ email: string; context: string }> {
  const emails: Array<{ email: string; context: string }> = [];
  const seen = new Set<string>();
  const { $, text, html } = page;

  const addEmail = (email: string, context: string): boolean => {
    if (emails.length >= maxEmails) return false;
    const lower = email.toLowerCase().replace(/\.$/, ''); // strip trailing dot
    if (!seen.has(lower) && isValidEmail(lower)) {
      seen.add(lower);
      emails.push({ email: lower, context: context.trim().slice(0, 200) });
      return true;
    }
    return false;
  };

  // ── P1: mailto: links ──
  $('a[href^="mailto:"]').each((_, el) => {
    if (emails.length >= maxEmails) return false;
    const href = $(el).attr('href') || '';
    const email = decodeURIComponent(href.replace('mailto:', '').split('?')[0]).trim();
    addEmail(email, $(el).text().trim() || 'mailto link');
  });
  if (emails.length >= maxEmails) return emails;

  // ── P2: CloudFlare email protection ──
  $('a[data-cfemail], span[data-cfemail], [data-cfemail]').each((_, el) => {
    if (emails.length >= maxEmails) return false;
    const encoded = $(el).attr('data-cfemail');
    if (encoded) {
      const decoded = decodeCfEmail(encoded);
      if (decoded) addEmail(decoded, 'cloudflare protected');
    }
  });
  if (emails.length >= maxEmails) return emails;

  // ── P3: HTML data attributes ──
  $('[data-email], [data-mail], [data-contact-email]').each((_, el) => {
    if (emails.length >= maxEmails) return false;
    const email =
      $(el).attr('data-email') ||
      $(el).attr('data-mail') ||
      $(el).attr('data-contact-email');
    if (email) addEmail(email, 'data attribute');
  });
  if (emails.length >= maxEmails) return emails;

  // ── P4: JSON-LD structured data ──
  $('script[type="application/ld+json"]').each((_, el) => {
    if (emails.length >= maxEmails) return false;
    try {
      const json = JSON.parse($(el).html() || '');
      extractEmailsFromJsonLd(json, (email) => addEmail(email, 'structured data'));
    } catch {
      // malformed JSON-LD
    }
  });
  if (emails.length >= maxEmails) return emails;

  // ── P5: Meta tags ──
  const metaSelectors = [
    'meta[name="email"]',
    'meta[property="og:email"]',
    'meta[name="contact:email"]',
    'meta[itemprop="email"]',
  ];
  for (const sel of metaSelectors) {
    const content = $(sel).attr('content');
    if (content) addEmail(content, 'meta tag');
  }
  if (emails.length >= maxEmails) return emails;

  // ── P6: Itemprop="email" elements ──
  $('[itemprop="email"]').each((_, el) => {
    if (emails.length >= maxEmails) return false;
    const email = $(el).attr('content') || $(el).attr('href')?.replace('mailto:', '') || $(el).text();
    if (email) addEmail(email.trim(), 'schema.org itemprop');
  });
  if (emails.length >= maxEmails) return emails;

  // ── P7: Footer section ──
  const footerSelectors = [
    'footer', '#footer', '.footer',
    '[role="contentinfo"]', '.site-footer', '.page-footer',
  ];
  for (const selector of footerSelectors) {
    if (emails.length >= maxEmails) break;
    $(selector).each((_, el) => {
      const sectionText = $(el).text() || '';
      const sectionHtml = $(el).html() || '';
      // Check for obfuscated emails too
      const found = extractObfuscatedEmails(sectionText);
      for (const email of found) addEmail(email, 'footer');
      const regexMatches = (sectionText + ' ' + sectionHtml).match(EMAIL_REGEX) || [];
      for (const email of regexMatches) addEmail(email, 'footer');
    });
  }
  if (emails.length >= maxEmails) return emails;

  // ── P8: Contact sections ──
  const contactSelectors = [
    '#contact', '.contact', '[class*="contact"]',
    '#get-in-touch', '.get-in-touch',
    '[class*="email"]', '[id*="email"]',
    '[class*="reach"]', '[id*="contact"]',
  ];
  for (const selector of contactSelectors) {
    if (emails.length >= maxEmails) break;
    const sectionText = $(selector).text() || '';
    for (const email of extractObfuscatedEmails(sectionText)) {
      addEmail(email, 'contact section');
    }
    for (const email of sectionText.match(EMAIL_REGEX) || []) {
      addEmail(email, 'contact section');
    }
  }
  if (emails.length >= maxEmails) return emails;

  // ── P9: Input fields with email values ──
  $('input[type="hidden"], input[type="text"]').each((_, el) => {
    if (emails.length >= maxEmails) return false;
    const val = $(el).attr('value') || '';
    if (EMAIL_REGEX.test(val)) {
      addEmail(val.match(EMAIL_REGEX)![0], 'hidden input');
    }
  });
  if (emails.length >= maxEmails) return emails;

  // ── P10: Full page — obfuscated emails ──
  for (const email of extractObfuscatedEmails(text)) {
    if (emails.length >= maxEmails) break;
    addEmail(email, 'obfuscated in text');
  }
  if (emails.length >= maxEmails) return emails;

  // ── P11: Full page text regex (last resort) ──
  for (const email of text.match(EMAIL_REGEX) || []) {
    if (emails.length >= maxEmails) break;
    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ctx = text.match(new RegExp(`.{0,50}${escaped}.{0,50}`, 'i'));
    addEmail(email, ctx ? ctx[0] : '');
  }

  return emails;
}

// ─── 4. DEOBFUSCATION HELPERS ───────────────────────────────────────

// Decode CloudFlare's __cf_email__ protection
function decodeCfEmail(encoded: string): string | null {
  try {
    const key = parseInt(encoded.substring(0, 2), 16);
    let email = '';
    for (let i = 2; i < encoded.length; i += 2) {
      const charCode = parseInt(encoded.substring(i, i + 2), 16) ^ key;
      email += String.fromCharCode(charCode);
    }
    return email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

// Normalize Unicode characters that are used to obfuscate emails
function normalizeUnicodeEmail(text: string): string {
  return text
    // Full-width @ (U+FF20) -> @
    .replace(/\uff20/g, '@')
    // Ideographic full stop (U+3002) -> .
    .replace(/\u3002/g, '.')
    // Full-width dot (U+FF0E) -> .
    .replace(/\uff0e/g, '.')
    // Full-width letters -> ASCII
    .replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

// Handle common text obfuscation patterns
function extractObfuscatedEmails(text: string): string[] {
  const results: string[] = [];

  // First normalize Unicode obfuscation
  const normalizedText = normalizeUnicodeEmail(text);

  // Pattern: "user [at] domain [dot] com" and variants
  const obfuscationPatterns = [
    // Existing patterns
    /([a-zA-Z0-9._%+-]+)\s*[$$\(]\s*at\s*[$$\)]\s*([a-zA-Z0-9.-]+)\s*[$$\(]\s*dot\s*[$$\)]\s*([a-zA-Z]{2,})/gi,
    /([a-zA-Z0-9._%+-]+)\s*\{at\}\s*([a-zA-Z0-9.-]+)\s*\{dot\}\s*([a-zA-Z]{2,})/gi,
    /([a-zA-Z0-9._%+-]+)\s*\bat\b\s*([a-zA-Z0-9.-]+)\s*\bdot\b\s*([a-zA-Z]{2,})/gi,
    // "user AT domain DOT com"
    /([a-zA-Z0-9._%+-]+)\s+AT\s+([a-zA-Z0-9.-]+)\s+DOT\s+([a-zA-Z]{2,})/g,

    // NEW: Bracket notation [at] [dot] with optional spaces
    /([a-zA-Z0-9._%+-]+)\s*\[\s*at\s*\]\s*([a-zA-Z0-9.-]+)\s*\[\s*dot\s*\]\s*([a-zA-Z]{2,})/gi,

    // NEW: Hyphen separators: user-at-domain-dot-com
    /([a-zA-Z0-9._]+)-at-([a-zA-Z0-9.-]+)-dot-([a-zA-Z]{2,})/gi,

    // NEW: Spaced parenthesis ( at ) ( dot )
    /([a-zA-Z0-9._%+-]+)\s*\(\s*at\s*\)\s*([a-zA-Z0-9.-]+)\s*\(\s*dot\s*\)\s*([a-zA-Z]{2,})/gi,

    // NEW: Angle brackets <at> <dot>
    /([a-zA-Z0-9._%+-]+)\s*<\s*at\s*>\s*([a-zA-Z0-9.-]+)\s*<\s*dot\s*>\s*([a-zA-Z]{2,})/gi,
  ];

  for (const pattern of obfuscationPatterns) {
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const email = `${match[1]}@${match[2]}.${match[3]}`.toLowerCase();
      if (isValidEmail(email)) {
        results.push(email);
      }
    }
  }

  // Handle HTML entity encoded @ symbols that might appear in text
  const entityDecoded = normalizedText
    .replace(/&#64;/g, '@')
    .replace(/&#x40;/g, '@')
    .replace(/&commat;/g, '@')
    .replace(/\(dot\)/gi, '.')
    .replace(/\[dot\]/gi, '.')
    .replace(/\{dot\}/gi, '.')
    .replace(/\(at\)/gi, '@')
    .replace(/\[at\]/gi, '@')
    .replace(/\{at\}/gi, '@');

  if (entityDecoded !== normalizedText) {
    const found = entityDecoded.match(EMAIL_REGEX) || [];
    results.push(...found.filter(isValidEmail));
  }

  return results;
}

// Recursively extract emails from JSON-LD objects with depth limit
function extractEmailsFromJsonLd(
  obj: unknown,
  onEmail: (email: string) => void,
  depth: number = 0,
  maxDepth: number = 10
): void {
  // Prevent infinite recursion
  if (depth > maxDepth || !obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractEmailsFromJsonLd(item, onEmail, depth + 1, maxDepth);
    }
    return;
  }

  const record = obj as Record<string, unknown>;

  // Handle @graph arrays (common in WordPress/Yoast SEO)
  if (record['@graph'] && Array.isArray(record['@graph'])) {
    for (const item of record['@graph']) {
      extractEmailsFromJsonLd(item, onEmail, depth + 1, maxDepth);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    const keyLower = key.toLowerCase();

    if (typeof value === 'string') {
      // Direct email-like keys
      if (
        keyLower === 'email' ||
        keyLower === 'mail' ||
        keyLower === 'contactemail' ||
        keyLower === 'workemail' ||
        keyLower === 'personalemail' ||
        keyLower.includes('email')
      ) {
        const cleaned = value.replace('mailto:', '').trim();
        if (cleaned.includes('@')) {
          onEmail(cleaned);
        }
      }

      // Check sameAs for mailto: links
      if (keyLower === 'sameas' && value.startsWith('mailto:')) {
        const email = value.replace('mailto:', '').split('?')[0];
        onEmail(email);
      }

      // Check URL/href fields for mailto: links
      if ((keyLower === 'url' || keyLower === 'href') && value.startsWith('mailto:')) {
        const email = value.replace('mailto:', '').split('?')[0];
        onEmail(email);
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recurse into nested objects (contactPoint, author, etc.)
      extractEmailsFromJsonLd(value, onEmail, depth + 1, maxDepth);
    }
  }
}

// ─── 5. IMPROVED VALIDATION ─────────────────────────────────────────

function isValidEmail(email: string): boolean {
  if (!email.includes('@') || !email.includes('.')) return false;

  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) return false;
  if (localPart.length > 64 || domain.length > 253) return false;

  // Domain must end with valid TLD (2-6 letters, optionally followed by country code)
  // This catches garbage like "email@domain.comphone"
  if (!/\.[a-z]{2,6}$/i.test(domain)) {
    return false;
  }

  // Domain should only contain valid characters
  if (!/^[a-z0-9.-]+$/i.test(domain)) {
    return false;
  }

  // Invalid domains
  if (INVALID_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) {
    return false;
  }

  // Asset paths that regex accidentally matched
  if (/[/\\]/.test(email)) return false;

  // File extensions that aren't TLDs
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|json|xml|pdf|zip)$/i.test(email)) {
    return false;
  }

  // Starts or ends with dot/dash in local part
  if (/^[.\-]|[.\-]$/.test(localPart)) return false;

  // CSS/code artifacts
  if (/^[0-9]+px/.test(localPart) || localPart.includes('--')) return false;

  // Local part should only contain valid characters
  if (!/^[a-z0-9._%+-]+$/i.test(localPart)) {
    return false;
  }

  return true;
}

// Score an email for prioritization (higher = better for outreach)
function scoreEmailForOutreach(email: string, role: LeadEmail['role']): number {
  let score = 0;
  const prefix = email.split('@')[0].toLowerCase();

  // Prefer owner/personal emails over generic ones
  if (role === 'owner') score += 30;
  if (role === 'admin') score += 20;
  if (role === 'info') score += 10;

  // Personal names are best (likely decision makers)
  if (/^[a-z]+\.[a-z]+$/.test(prefix)) score += 25; // john.smith
  if (/^[a-z]{2,15}$/.test(prefix) && !['info', 'hello', 'contact', 'support', 'help', 'admin', 'office', 'sales', 'team', 'mail', 'email'].includes(prefix)) {
    score += 20; // john (but not generic words)
  }

  // Generic contact emails are ok but less ideal
  if (['info', 'hello', 'contact'].includes(prefix)) score += 5;

  // Penalize generic/department emails
  if (['support', 'help', 'sales', 'billing', 'hr', 'jobs', 'careers', 'noreply', 'no-reply'].includes(prefix)) {
    score -= 20;
  }

  return score;
}

// ─── UNCHANGED HELPERS ──────────────────────────────────────────────

function classifyEmailRole(email: string, context: string): LeadEmail['role'] {
  const emailLower = email.toLowerCase();
  const contextLower = context.toLowerCase();

  if (/owner|founder|ceo|director|principal/.test(contextLower)) return 'owner';
  if (/admin|manager|coordinator|operations/.test(contextLower)) return 'admin';

  const prefix = emailLower.split('@')[0];
  if (['info', 'hello', 'contact', 'inquiries', 'support', 'help', 'office'].includes(prefix)) {
    return 'info';
  }
  if (/^[a-z]+(\.[a-z]+)?$/.test(prefix)) return 'owner';

  return 'unknown';
}

function detectSchedulingTool(html: string, text: string): string | null {
  const combined = (html + ' ' + text).toLowerCase();
  for (const tool of SCHEDULING_TOOLS) {
    if (combined.includes(tool)) return tool;
  }
  return null;
}

function detectMultipleTutors(text: string): boolean {
  const lower = text.toLowerCase();
  return MULTI_TUTOR_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractSocialLinks(html: string): {
  linkedin: string | null;
  facebook: string | null;
} {
  const $ = cheerio.load(html);
  let linkedin: string | null = null;
  let facebook: string | null = null;

  $('a[href*="linkedin.com"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('linkedin.com/company')) linkedin = href;
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
  const lower = text.toLowerCase();
  const subjects = [
    'math','mathematics','algebra','geometry','calculus',
    'reading','writing','english','essay',
    'science','physics','chemistry','biology',
    'sat','act','gre','gmat','lsat','mcat',
    'spanish','french','mandarin','chinese',
    'coding','programming','computer science',
    'elementary','middle school','high school','college',
    'test prep','homework help','study skills',
  ];
  return [...new Set(subjects.filter((s) => lower.includes(s)))].slice(0, 10);
}

// ─── 6. REWRITTEN ORCHESTRATOR ──────────────────────────────────────

// Franchises/chains where we can't scrape individual location emails
const SKIP_FRANCHISES = [
  'kumon',
  'sylvan',
  'mathnasium',
  'huntington',
  'oxford learning',
  'tutor doctor',
  'club z',
];

function shouldSkipLead(lead: Lead): boolean {
  const nameLower = lead.business_name.toLowerCase();
  const websiteLower = (lead.website || '').toLowerCase();

  return SKIP_FRANCHISES.some(franchise =>
    nameLower.includes(franchise) || websiteLower.includes(franchise)
  );
}

export async function enrichLead(lead: Lead): Promise<EnrichmentData> {
  const result: EnrichmentData = {
    emails: [],
    hasMultipleTutors: false,
    existingSchedulingTool: null,
    linkedinUrl: null,
    facebookUrl: null,
    specialties: [],
  };

  // Skip franchises where we can't get individual location emails
  if (shouldSkipLead(lead)) return result;

  if (!lead.website) return result;

  let baseUrl = lead.website;
  if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
  baseUrl = baseUrl.replace(/\/$/, '');

  const visited = new Set<string>();
  const allText: string[] = [];
  let pagesFetched = 0;

  const processPage = (page: PageContent) => {
    allText.push(page.text);

    // Extract emails with the new comprehensive extractor
    const pageEmails = extractEmails(page, MAX_EMAILS - result.emails.length);
    for (const { email, context } of pageEmails) {
      if (result.emails.length >= MAX_EMAILS) break;
      if (!result.emails.some((e) => e.email === email)) {
        result.emails.push({
          email,
          context,
          role: classifyEmailRole(email, context),
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
    if (social.linkedin && !result.linkedinUrl) result.linkedinUrl = social.linkedin;
    if (social.facebook && !result.facebookUrl) result.facebookUrl = social.facebook;
  };

  // ── STEP 1: Fetch homepage FIRST to discover real contact links ──
  const homepage = await fetchWithFallback(baseUrl);
  if (homepage) {
    visited.add(homepage.url);
    pagesFetched++;
    processPage(homepage);

    // Discover contact-related links from actual navigation
    if (result.emails.length < MAX_EMAILS) {
      const discoveredLinks = discoverContactLinks(homepage.$, baseUrl);

      for (const link of discoveredLinks) {
        if (result.emails.length >= MAX_EMAILS || pagesFetched >= MAX_PAGES) break;
        const normalized = link.replace(/\/$/, '');
        if (visited.has(normalized)) continue;
        visited.add(normalized);

        const page = await fetchWithRetry(normalized, 1);
        if (page) {
          pagesFetched++;
          processPage(page);
        }
      }
    }
  }

  // ── STEP 2: Fall back to static paths for anything not yet tried ──
  if (result.emails.length < MAX_EMAILS) {
    for (const path of STATIC_CONTACT_PATHS) {
      if (result.emails.length >= MAX_EMAILS || pagesFetched >= MAX_PAGES) break;
      const url = baseUrl + path;
      const normalized = url.replace(/\/$/, '');
      if (visited.has(normalized)) continue;
      visited.add(normalized);

      const page = await fetchWithRetry(normalized, 1);
      if (page) {
        pagesFetched++;
        processPage(page);
      }
    }
  }

  // ── STEP 3: Puppeteer fallback for JS-rendered pages ──
  // Only use if we fetched pages but found no emails (suggests JS-rendered content)
  if (result.emails.length === 0 && pagesFetched > 0) {
    // Try homepage with Puppeteer
    const puppeteerHomepage = await fetchWithPuppeteer(baseUrl);
    if (puppeteerHomepage) {
      const $ = cheerio.load(puppeteerHomepage.html);
      processPage({
        html: puppeteerHomepage.html,
        text: puppeteerHomepage.text,
        url: puppeteerHomepage.url,
        $,
      });

      // If still no emails, try /contact with Puppeteer
      if (result.emails.length === 0) {
        const contactUrl = baseUrl + '/contact';
        if (!visited.has(contactUrl.replace(/\/$/, ''))) {
          const puppeteerContact = await fetchWithPuppeteer(contactUrl);
          if (puppeteerContact) {
            const $contact = cheerio.load(puppeteerContact.html);
            processPage({
              html: puppeteerContact.html,
              text: puppeteerContact.text,
              url: puppeteerContact.url,
              $: $contact,
            });
          }
        }
      }
    }
  }

  result.specialties = extractSpecialties(allText.join(' '));
  return result;
}

// ─── enrichAndSaveLead stays the same ───────────────────────────────

export async function enrichAndSaveLead(leadId: string): Promise<{
  emailsFound: number;
  emails: string[];
  enrichmentSaved: boolean;
}> {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  const enrichment = await enrichLead(lead);

  // Sort emails by outreach score (best email first)
  const sortedEmails = enrichment.emails
    .map(e => ({ ...e, score: scoreEmailForOutreach(e.email, e.role) }))
    .sort((a, b) => b.score - a.score);

  const addedEmails: string[] = [];

  for (const { email, role } of sortedEmails) {
    if (!emailExistsForLead(leadId, email)) {
      insertLeadEmail({
        lead_id: leadId,
        email,
        contact_name: null,
        role,
        verification_status: 'unverified',
        source: 'scraped',
        is_primary: addedEmails.length === 0 ? 1 : 0,
      });
      addedEmails.push(email);
    }
  }

  insertOrUpdateEnrichment({
    lead_id: leadId,
    has_multiple_tutors: enrichment.hasMultipleTutors ? 1 : 0,
    existing_scheduling_tool: enrichment.existingSchedulingTool,
    linkedin_url: enrichment.linkedinUrl,
    facebook_url: enrichment.facebookUrl,
    founded_year: null,
    team_size_estimate: null,
    specialties:
      enrichment.specialties.length > 0
        ? JSON.stringify(enrichment.specialties)
        : null,
    raw_data: null,
    emails_found_count: addedEmails.length,
  });

  return { emailsFound: addedEmails.length, emails: addedEmails, enrichmentSaved: true };
}