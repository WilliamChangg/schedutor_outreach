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

// ─── REGEX ───────────────────────────────────────────────────────────
// NOTE: Do NOT use this as a module-level singleton with .test() —
// the /g flag persists lastIndex across calls, causing silent alternating
// true/false results. Always call getEmailRegex() for a fresh instance.
function getEmailRegex(): RegExp {
  return /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
}
// Non-global version safe for .test() calls
const EMAIL_REGEX_TEST = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

const MAX_EMAILS = 2;
const MAX_PAGES = 12;

// ─── EXPANDED STATIC PATHS (fallback only) ───────────────────────────
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

// Rotated UA pool — reduces fingerprinting from a single static string
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];

function getRandomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

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

// ─── 1. SMARTER FETCHING ─────────────────────────────────────────────

// Separate tracking for bot-blocks vs transient network failures.
// Previously, a single timeout would hard-block a domain for 30+ minutes,
// causing legitimate sites to be skipped for an entire run.
interface DomainFailure {
  botBlockedAt: number | null;  // set only on confirmed 403/429/bot-page
  timeoutCount: number;         // incremented on network errors/timeouts
  lastTimeoutAt: number;        // used for temporary timeout back-off
}

const domainFailures = new Map<string, DomainFailure>();

// Cache for robots.txt allow/deny decisions
const robotsCache = new Map<string, boolean>();

function getBlockDuration(failureCount: number): number {
  const baseMs = 30 * 60 * 1000;
  const maxMs = 24 * 60 * 60 * 1000;
  return Math.min(baseMs * Math.pow(2, failureCount - 1), maxMs);
}

function isDomainBotBlocked(domain: string): boolean {
  const failure = domainFailures.get(domain);
  if (!failure?.botBlockedAt) return false;
  return Date.now() - failure.botBlockedAt < getBlockDuration(1);
}

function isDomainTimeoutBacked(domain: string): boolean {
  const failure = domainFailures.get(domain);
  if (!failure) return false;
  // Back off for 5 minutes after 3+ consecutive timeouts
  if (failure.timeoutCount >= 3) {
    return Date.now() - failure.lastTimeoutAt < 5 * 60 * 1000;
  }
  return false;
}

function markDomainBotBlocked(domain: string): void {
  const existing = domainFailures.get(domain);
  domainFailures.set(domain, {
    botBlockedAt: Date.now(),
    timeoutCount: existing?.timeoutCount ?? 0,
    lastTimeoutAt: existing?.lastTimeoutAt ?? 0,
  });
}

function markDomainTimeout(domain: string): void {
  const existing = domainFailures.get(domain);
  domainFailures.set(domain, {
    botBlockedAt: existing?.botBlockedAt ?? null,
    timeoutCount: (existing?.timeoutCount ?? 0) + 1,
    lastTimeoutAt: Date.now(),
  });
}

async function isScrapingAllowed(baseUrl: string): Promise<boolean> {
  let domain: string;
  try {
    domain = new URL(baseUrl).hostname;
  } catch {
    return true;
  }

  if (robotsCache.has(domain)) return robotsCache.get(domain)!;

  try {
    const resp = await request(baseUrl + '/robots.txt', {
      headers: { 'User-Agent': getRandomUA() },
      headersTimeout: 5000,
      bodyTimeout: 5000,
      maxRedirections: 3,
    });
    const body = await safeReadBody(resp.body);
    // Only skip if robots.txt explicitly disallows all crawlers on all paths
    const blocked =
      !!body &&
      body.includes('User-agent: *') &&
      body.includes('Disallow: /');
    robotsCache.set(domain, !blocked);
    return !blocked;
  } catch {
    // If we can't fetch robots.txt, assume allowed
    robotsCache.set(domain, true);
    return true;
  }
}

async function safeReadBody(
  body: import('undici').Dispatcher.ResponseData['body']
): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    body.on('data', (chunk: Buffer) => chunks.push(chunk));
    body.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    body.on('error', () => {
      resolve(chunks.length > 0 ? Buffer.concat(chunks).toString('utf-8') : null);
    });
  });
}

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
  return botIndicators.some((indicator) => html.includes(indicator));
}

function buildPageContent(html: string, url: string): PageContent {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg').remove();
  return {
    html,
    text: $('body').text().replace(/\s+/g, ' ').trim(),
    url,
    $,
  };
}

async function fetchPage(url: string): Promise<PageContent | null> {
  try {
    const domain = new URL(url).hostname;

    // Skip confirmed bot-blocked domains
    if (isDomainBotBlocked(domain)) return null;

    // Temporarily back off domains with repeated timeout failures
    if (isDomainTimeoutBacked(domain)) return null;

    await scrapingRateLimiter.waitForSlot();

    const response = await request(url, {
      headers: {
        'User-Agent': getRandomUA(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'identity',
      },
      maxRedirections: 5,
      headersTimeout: 12000,
      bodyTimeout: 20000,
    });

    // Confirmed bot protection — hard block the domain
    if (response.statusCode === 403 || response.statusCode === 429) {
      markDomainBotBlocked(domain);
      return null;
    }

    if (response.statusCode !== 200) return null;

    const contentType = response.headers['content-type'] || '';
    if (
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml')
    ) {
      return null;
    }

    const html = await safeReadBody(response.body);
    if (!html) {
      // Empty body is a transient failure, not a bot block
      markDomainTimeout(domain);
      return null;
    }

    if (isBotProtectionPage(html)) {
      markDomainBotBlocked(domain);
      return null;
    }

    return buildPageContent(html, url);
  } catch {
    // Network errors / timeouts — count separately, do NOT hard-block
    try {
      markDomainTimeout(new URL(url).hostname);
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

async function fetchWithFallback(baseUrl: string): Promise<PageContent | null> {
  const variants: string[] = [];

  try {
    const url = new URL(baseUrl);
    variants.push(url.toString());

    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      variants.push(url.toString());
    }

    const urlWithWww = new URL(baseUrl);
    const urlWithoutWww = new URL(baseUrl);

    if (urlWithWww.hostname.startsWith('www.')) {
      urlWithoutWww.hostname = urlWithWww.hostname.replace('www.', '');
    } else {
      urlWithWww.hostname = 'www.' + urlWithoutWww.hostname;
    }

    variants.push(urlWithWww.toString());
    variants.push(urlWithoutWww.toString());

    urlWithWww.protocol = 'https:';
    urlWithoutWww.protocol = 'https:';
    variants.push(urlWithWww.toString());
    variants.push(urlWithoutWww.toString());
  } catch {
    variants.push(baseUrl);
  }

  const uniqueVariants = [...new Set(variants)];
  for (const variant of uniqueVariants) {
    const result = await fetchWithRetry(variant, 1);
    if (result) return result;
  }

  return null;
}

// ─── 2. SITEMAP PARSING ──────────────────────────────────────────────

async function extractUrlsFromSitemap(baseUrl: string): Promise<string[]> {
  const urls: string[] = [];
  try {
    const sitemapPage = await fetchWithRetry(baseUrl + '/sitemap.xml', 1);
    if (!sitemapPage) return urls;
    const matches = sitemapPage.html.match(/<loc>(.*?)<\/loc>/gi) || [];
    for (const match of matches) {
      urls.push(match.replace(/<\/?loc>/gi, '').trim());
    }
  } catch {}
  return urls;
}

// ─── 3. DYNAMIC LINK DISCOVERY ───────────────────────────────────────

interface DiscoveredLink {
  url: string;
  score: number;
}

function discoverContactLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const found: DiscoveredLink[] = [];
  const seenUrls = new Set<string>();

  const contactPatterns =
    /\b(contact|about|team|staff|people|connect|reach|get.?in.?touch|inquiry|support|founder|owner|leadership|meet|principal)\b/i;

  // Broader patterns to catch nav links like "Meet Sarah" or "Our Approach"
  const broadPatterns =
    /\b(meet|our|story|approach|learn|tutor|work|welcome|hire|bio|profile)\b/i;

  const navSelectors = ['nav', 'header', '.nav', '.navigation', '#nav', '[role="navigation"]'];
  const footerSelectors = ['footer', '.footer', '#footer', '[role="contentinfo"]'];

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    const text = $el.text().toLowerCase().trim();

    if (/facebook|linkedin|twitter|instagram|youtube|tiktok/i.test(href)) return;

    const isInNav = navSelectors.some((sel) => $el.closest(sel).length > 0);
    const matchesStrict = contactPatterns.test(text) || contactPatterns.test(href);
    const matchesBroad = broadPatterns.test(text) || broadPatterns.test(href);

    // Require either a strict match, or a broad match in nav (to catch "Meet Sarah" etc.)
    if (!matchesStrict && !(matchesBroad && isInNav)) return;

    try {
      const resolved = new URL(href, baseUrl).toString();
      const base = new URL(baseUrl);
      const target = new URL(resolved);

      if (
        target.hostname !== base.hostname &&
        target.hostname !== 'www.' + base.hostname &&
        'www.' + target.hostname !== base.hostname
      ) {
        return;
      }

      const normalized = resolved.replace(/\/$/, '').split('?')[0];

      let score = 0;
      const isInFooter = footerSelectors.some((sel) => $el.closest(sel).length > 0);
      if (isInNav) score += 30;
      if (isInFooter) score += 20;

      if (/founder|owner|principal|director/i.test(text)) score += 35;
      if (/contact|email|reach/i.test(text)) score += 25;
      if (/about|team|staff/i.test(text)) score += 15;
      if (/meet/i.test(text)) score += 20;

      if (/\/contact/i.test(href)) score += 20;
      if (/\/about/i.test(href)) score += 10;
      if (/\/team|\/staff|\/people/i.test(href)) score += 15;
      if (/\/founder|\/owner|\/leadership/i.test(href)) score += 30;

      if (seenUrls.has(normalized)) {
        const existing = found.find((f) => f.url === normalized);
        if (existing) existing.score = Math.max(existing.score, score);
        return;
      }
      seenUrls.add(normalized);
      found.push({ url: normalized, score });
    } catch {}
  });

  return found.sort((a, b) => b.score - a.score).map((f) => f.url);
}

// ─── 4. COMPREHENSIVE EMAIL EXTRACTION ───────────────────────────────

function extractEmails(
  page: PageContent,
  maxEmails: number = MAX_EMAILS
): Array<{ email: string; context: string }> {
  const emails: Array<{ email: string; context: string }> = [];
  const seen = new Set<string>();
  const { $, text, html } = page;

  const addEmail = (email: string, context: string): boolean => {
    if (emails.length >= maxEmails) return false;
    const lower = email.toLowerCase().replace(/\.$/, '');
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
    } catch {}
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
    const email =
      $(el).attr('content') ||
      $(el).attr('href')?.replace('mailto:', '') ||
      $(el).text();
    if (email) addEmail(email.trim(), 'schema.org itemprop');
  });
  if (emails.length >= maxEmails) return emails;

  // ── P6.5: Form action mailto ──
  // Small business sites often use mailto: as form action
  $('form[action^="mailto:"]').each((_, el) => {
    if (emails.length >= maxEmails) return false;
    const action = $(el).attr('action') || '';
    const email = action.replace('mailto:', '').split('?')[0].trim();
    addEmail(email, 'form action mailto');
  });
  if (emails.length >= maxEmails) return emails;

  // ── P6.6: Hidden/text inputs with recipient fields (FormMail pattern) ──
  $('input[name="_to"], input[name="recipient"], input[name="_replyto"]').each((_, el) => {
    if (emails.length >= maxEmails) return false;
    const val = $(el).attr('value') || '';
    if (val.includes('@')) addEmail(val.trim(), 'form recipient field');
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
      for (const email of extractObfuscatedEmails(sectionText)) addEmail(email, 'footer');
      for (const email of (sectionText + ' ' + sectionHtml).match(getEmailRegex()) || []) {
        addEmail(email, 'footer');
      }
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
    for (const email of extractObfuscatedEmails(sectionText)) addEmail(email, 'contact section');
    for (const email of sectionText.match(getEmailRegex()) || []) addEmail(email, 'contact section');
  }
  if (emails.length >= maxEmails) return emails;

  // ── P9: Input fields with email values ──
  $('input[type="hidden"], input[type="text"]').each((_, el) => {
    if (emails.length >= maxEmails) return false;
    const val = $(el).attr('value') || '';
    // Use non-global regex for .test() to avoid lastIndex state bug
    if (EMAIL_REGEX_TEST.test(val)) {
      const match = val.match(getEmailRegex());
      if (match) addEmail(match[0], 'hidden input');
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
  for (const email of text.match(getEmailRegex()) || []) {
    if (emails.length >= maxEmails) break;
    const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ctx = text.match(new RegExp(`.{0,50}${escaped}.{0,50}`, 'i'));
    addEmail(email, ctx ? ctx[0] : '');
  }

  return emails;
}

// ─── 5. DEOBFUSCATION HELPERS ────────────────────────────────────────

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

function normalizeUnicodeEmail(text: string): string {
  return text
    .replace(/\uff20/g, '@')
    .replace(/\u3002/g, '.')
    .replace(/\uff0e/g, '.')
    .replace(/[\uff01-\uff5e]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    );
}

function extractObfuscatedEmails(text: string): string[] {
  const results: string[] = [];
  const normalizedText = normalizeUnicodeEmail(text);

  const obfuscationPatterns = [
    // user (at) domain (dot) com  — parenthesis variant
    /([a-zA-Z0-9._%+-]+)\s*\(\s*at\s*\)\s*([a-zA-Z0-9.-]+)\s*\(\s*dot\s*\)\s*([a-zA-Z]{2,})/gi,

    // user [at] domain [dot] com  — square bracket variant
    /([a-zA-Z0-9._%+-]+)\s*$$\s*at\s*$$\s*([a-zA-Z0-9.-]+)\s*$$\s*dot\s*$$\s*([a-zA-Z]{2,})/gi,

    // user {at} domain {dot} com  — curly brace variant
    /([a-zA-Z0-9._%+-]+)\s*\{\s*at\s*\}\s*([a-zA-Z0-9.-]+)\s*\{\s*dot\s*\}\s*([a-zA-Z]{2,})/gi,

    // user <at> domain <dot> com  — angle bracket variant
    /([a-zA-Z0-9._%+-]+)\s*<\s*at\s*>\s*([a-zA-Z0-9.-]+)\s*<\s*dot\s*>\s*([a-zA-Z]{2,})/gi,

    // user at domain dot com  — plain word boundary variant (case-insensitive)
    /([a-zA-Z0-9._%+-]+)\s+at\s+([a-zA-Z0-9.-]+)\s+dot\s+([a-zA-Z]{2,})/gi,

    // user AT domain DOT com  — uppercase explicit variant
    /([a-zA-Z0-9._%+-]+)\s+AT\s+([a-zA-Z0-9.-]+)\s+DOT\s+([a-zA-Z]{2,})/g,

    // user-at-domain-dot-com  — hyphen separator variant
    /([a-zA-Z0-9._]+)-at-([a-zA-Z0-9.-]+)-dot-([a-zA-Z]{2,})/gi,
  ];

  for (const pattern of obfuscationPatterns) {
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const email = `${match[1]}@${match[2]}.${match[3]}`.toLowerCase();
      if (isValidEmail(email)) results.push(email);
    }
  }

  const entityDecoded = normalizedText
    .replace(/&#64;/g, '@')
    .replace(/&#x40;/g, '@')
    .replace(/&commat;/g, '@')
    .replace(/\(dot\)/gi, '.')
    .replace(/$$dot$$/gi, '.')
    .replace(/\{dot\}/gi, '.')
    .replace(/\(at\)/gi, '@')
    .replace(/$$at$$/gi, '@')
    .replace(/\{at\}/gi, '@');

  if (entityDecoded !== normalizedText) {
    const found = entityDecoded.match(getEmailRegex()) || [];
    results.push(...found.filter(isValidEmail));
  }

  return results;
}

function extractEmailsFromJsonLd(
  obj: unknown,
  onEmail: (email: string) => void,
  depth: number = 0,
  maxDepth: number = 10
): void {
  if (depth > maxDepth || !obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) extractEmailsFromJsonLd(item, onEmail, depth + 1, maxDepth);
    return;
  }

  const record = obj as Record<string, unknown>;

  if (record['@graph'] && Array.isArray(record['@graph'])) {
    for (const item of record['@graph']) {
      extractEmailsFromJsonLd(item, onEmail, depth + 1, maxDepth);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    const keyLower = key.toLowerCase();

    if (typeof value === 'string') {
      if (
        keyLower === 'email' ||
        keyLower === 'mail' ||
        keyLower === 'contactemail' ||
        keyLower === 'workemail' ||
        keyLower === 'personalemail' ||
        keyLower.includes('email')
      ) {
        const cleaned = value.replace('mailto:', '').trim();
        if (cleaned.includes('@')) onEmail(cleaned);
      }

      if (keyLower === 'sameas' && value.startsWith('mailto:')) {
        onEmail(value.replace('mailto:', '').split('?')[0]);
      }

      if (
        (keyLower === 'url' || keyLower === 'href') &&
        value.startsWith('mailto:')
      ) {
        onEmail(value.replace('mailto:', '').split('?')[0]);
      }
    } else if (typeof value === 'object' && value !== null) {
      extractEmailsFromJsonLd(value, onEmail, depth + 1, maxDepth);
    }
  }
}

// ─── 6. VALIDATION ───────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  if (!email.includes('@') || !email.includes('.')) return false;

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return false;
  if (localPart.length > 64 || domain.length > 253) return false;

  if (!/\.[a-z]{2,6}$/i.test(domain)) return false;
  if (!/^[a-z0-9.-]+$/i.test(domain)) return false;

  if (INVALID_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) {
    return false;
  }

  if (/[/\\]/.test(email)) return false;

  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|json|xml|pdf|zip)$/i.test(email)) {
    return false;
  }

  if (/^[.\-]|[.\-]$/.test(localPart)) return false;
  if (/^[0-9]+px/.test(localPart) || localPart.includes('--')) return false;
  if (!/^[a-z0-9._%+-]+$/i.test(localPart)) return false;

  return true;
}

function scoreEmailForOutreach(email: string, role: LeadEmail['role']): number {
  let score = 0;
  const prefix = email.split('@')[0].toLowerCase();

  if (role === 'owner') score += 30;
  if (role === 'admin') score += 20;
  if (role === 'info') score += 10;

  if (/^[a-z]+\.[a-z]+$/.test(prefix)) score += 25;
  if (
    /^[a-z]{2,15}$/.test(prefix) &&
    !['info', 'hello', 'contact', 'support', 'help', 'admin', 'office', 'sales', 'team', 'mail', 'email'].includes(prefix)
  ) {
    score += 20;
  }

  if (['info', 'hello', 'contact'].includes(prefix)) score += 5;

  if (
    ['support', 'help', 'sales', 'billing', 'hr', 'jobs', 'careers', 'noreply', 'no-reply'].includes(prefix)
  ) {
    score -= 20;
  }

  return score;
}

// ─── UNCHANGED HELPERS ───────────────────────────────────────────────

function classifyEmailRole(email: string, context: string): LeadEmail['role'] {
  const emailLower = email.toLowerCase();
  const contextLower = context.toLowerCase();

  if (/owner|founder|ceo|director|principal/.test(contextLower)) return 'owner';
  if (/admin|manager|coordinator|operations/.test(contextLower)) return 'admin';

  const prefix = emailLower.split('@')[0];
  if (
    ['info', 'hello', 'contact', 'inquiries', 'support', 'help', 'office'].includes(prefix)
  ) {
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
    'math', 'mathematics', 'algebra', 'geometry', 'calculus',
    'reading', 'writing', 'english', 'essay',
    'science', 'physics', 'chemistry', 'biology',
    'sat', 'act', 'gre', 'gmat', 'lsat', 'mcat',
    'spanish', 'french', 'mandarin', 'chinese',
    'coding', 'programming', 'computer science',
    'elementary', 'middle school', 'high school', 'college',
    'test prep', 'homework help', 'study skills',
  ];
  return [...new Set(subjects.filter((s) => lower.includes(s)))].slice(0, 10);
}

// ─── 7. ORCHESTRATOR ─────────────────────────────────────────────────

const SKIP_FRANCHISES = [
  'kumon', 'sylvan', 'mathnasium', 'huntington',
  'oxford learning', 'tutor doctor', 'club z',
];

function shouldSkipLead(lead: Lead): boolean {
  const nameLower = lead.business_name.toLowerCase();
  const websiteLower = (lead.website || '').toLowerCase();
  return SKIP_FRANCHISES.some(
    (franchise) =>
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

  if (shouldSkipLead(lead)) return result;
  if (!lead.website) return result;

  let baseUrl = lead.website;
  if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;
  baseUrl = baseUrl.replace(/\/$/, '');

  // Skip domains that disallow all crawlers via robots.txt
  if (!(await isScrapingAllowed(baseUrl))) return result;

  const visited = new Set<string>();
  const allText: string[] = [];
  let pagesFetched = 0;

  const processPage = (page: PageContent) => {
    allText.push(page.text);

    const pageEmails = extractEmails(page, MAX_EMAILS - result.emails.length);
    for (const { email, context } of pageEmails) {
      if (result.emails.length >= MAX_EMAILS) break;
      if (!result.emails.some((e) => e.email === email)) {
        result.emails.push({ email, context, role: classifyEmailRole(email, context) });
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

  // ── STEP 1: Fetch homepage and discover real contact links ──
  let discoveredLinks: string[] = [];
  const homepage = await fetchWithFallback(baseUrl);
  if (homepage) {
    visited.add(homepage.url);
    pagesFetched++;
    processPage(homepage);

    discoveredLinks = discoverContactLinks(homepage.$, baseUrl);

    if (result.emails.length < MAX_EMAILS) {
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

  // ── STEP 2: Fallback to static paths ──
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

  // ── STEP 2.5: Sitemap pass for contact/staff/team URLs ──
  if (result.emails.length < MAX_EMAILS) {
    const sitemapUrls = await extractUrlsFromSitemap(baseUrl);
    const contactishUrls = sitemapUrls
      .filter((u) => /contact|about|team|staff|people|founder|owner/i.test(u))
      .slice(0, 5);

    for (const url of contactishUrls) {
      if (result.emails.length >= MAX_EMAILS || pagesFetched >= MAX_PAGES) break;
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
  // Triggered when pages were fetched but yielded no emails (JS-gated content).
  // Now covers discovered links too — not just homepage + /contact.
  if (result.emails.length === 0 && pagesFetched > 0) {
    // Build an ordered list of Puppeteer targets:
    // 1. Homepage
    // 2. /contact
    // 3. Top discovered links not yet attempted
    const puppeteerTargets: string[] = [baseUrl, baseUrl + '/contact', baseUrl + '/about'];

    for (const link of discoveredLinks.slice(0, 3)) {
      if (!puppeteerTargets.includes(link)) puppeteerTargets.push(link);
    }

    for (const target of puppeteerTargets) {
      if (result.emails.length >= MAX_EMAILS) break;
      const puppeteerPage = await fetchWithPuppeteer(target);
      if (puppeteerPage) {
        const $ = cheerio.load(puppeteerPage.html);
        $('script, style, noscript, svg').remove();
        processPage({
          html: puppeteerPage.html,
          text: puppeteerPage.text,
          url: puppeteerPage.url,
          $,
        });
      }
    }
  }

  result.specialties = extractSpecialties(allText.join(' '));
  return result;
}

// ─── enrichAndSaveLead (unchanged logic) ─────────────────────────────

export async function enrichAndSaveLead(leadId: string): Promise<{
  emailsFound: number;
  emails: string[];
  enrichmentSaved: boolean;
}> {
  const lead = getLeadById(leadId);
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  const enrichment = await enrichLead(lead);

  const sortedEmails = enrichment.emails
    .map((e) => ({ ...e, score: scoreEmailForOutreach(e.email, e.role) }))
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

  return {
    emailsFound: addedEmails.length,
    emails: addedEmails,
    enrichmentSaved: true,
  };
}