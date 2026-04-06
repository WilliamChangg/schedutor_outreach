import { request } from 'undici';
import * as cheerio from 'cheerio';
import { scrapingRateLimiter } from '../utils/rate-limiter.js';
import { insertLeadEmail, emailExistsForLead, insertOrUpdateEnrichment, getLeadById } from '../db/index.js';
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const MAX_EMAILS = 2;
const MAX_PAGES = 6; // Cap total pages fetched per lead
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
// ─── 1. SMARTER FETCHING ────────────────────────────────────────────
// Track domains that are blocking us to avoid repeated attempts
const blockedDomains = new Set();
// Helper to safely read response body with error event handling
async function safeReadBody(body) {
    return new Promise((resolve) => {
        const chunks = [];
        body.on('data', (chunk) => {
            chunks.push(chunk);
        });
        body.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf-8'));
        });
        body.on('error', () => {
            // Socket closed or other error - resolve with whatever we have
            if (chunks.length > 0) {
                resolve(Buffer.concat(chunks).toString('utf-8'));
            }
            else {
                resolve(null);
            }
        });
    });
}
// Check if HTML indicates bot protection (Cloudflare, etc.)
function isBotProtectionPage(html) {
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
async function fetchPage(url) {
    try {
        // Check if this domain is already known to be blocked
        const domain = new URL(url).hostname;
        if (blockedDomains.has(domain)) {
            return null;
        }
        await scrapingRateLimiter.waitForSlot();
        const response = await request(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
                    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                    'Chrome/120.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'identity', // avoid compressed responses we can't parse
            },
            maxRedirections: 5,
            headersTimeout: 12000,
            bodyTimeout: 20000,
        });
        if (response.statusCode !== 200)
            return null;
        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            return null; // Skip PDFs, images, etc.
        }
        // Use safe body reader that handles socket errors
        const html = await safeReadBody(response.body);
        if (!html) {
            blockedDomains.add(domain);
            return null;
        }
        // Check for bot protection pages
        if (isBotProtectionPage(html)) {
            blockedDomains.add(domain);
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
    }
    catch {
        // On error, mark domain as blocked to skip further attempts
        try {
            const domain = new URL(url).hostname;
            blockedDomains.add(domain);
        }
        catch { }
        return null;
    }
}
async function fetchWithRetry(url, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        const result = await fetchPage(url);
        if (result)
            return result;
        if (attempt < retries) {
            await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, attempt)));
        }
    }
    return null;
}
// Try multiple URL variants: www/non-www and http/https
async function fetchWithFallback(baseUrl) {
    const variants = [];
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
        }
        else {
            urlWithWww.hostname = 'www.' + urlWithoutWww.hostname;
        }
        variants.push(urlWithWww.toString());
        variants.push(urlWithoutWww.toString());
        // Also try HTTPS versions
        urlWithWww.protocol = 'https:';
        urlWithoutWww.protocol = 'https:';
        variants.push(urlWithWww.toString());
        variants.push(urlWithoutWww.toString());
    }
    catch {
        variants.push(baseUrl);
    }
    // Dedupe and try each variant
    const uniqueVariants = [...new Set(variants)];
    for (const variant of uniqueVariants) {
        const result = await fetchWithRetry(variant, 1);
        if (result)
            return result;
    }
    return null;
}
// ─── 2. DYNAMIC LINK DISCOVERY ──────────────────────────────────────
// Instead of only checking hardcoded paths, discover contact/about
// links from the actual navigation of the homepage.
function discoverContactLinks($, baseUrl) {
    const found = new Set();
    const contactPatterns = /\b(contact|about|team|staff|people|connect|reach|get.?in.?touch|inquiry|inquire|support|help)\b/i;
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().toLowerCase().trim();
        // Match by link text OR by href path
        if (contactPatterns.test(text) || contactPatterns.test(href)) {
            try {
                const resolved = new URL(href, baseUrl).toString();
                // Only follow links on the same domain
                const base = new URL(baseUrl);
                const target = new URL(resolved);
                if (target.hostname === base.hostname ||
                    target.hostname === 'www.' + base.hostname ||
                    'www.' + target.hostname === base.hostname) {
                    found.add(resolved.replace(/\/$/, ''));
                }
            }
            catch {
                // relative URL that couldn't resolve — skip
            }
        }
    });
    return [...found];
}
// ─── 3. COMPREHENSIVE EMAIL EXTRACTION ──────────────────────────────
function extractEmails(page, maxEmails = MAX_EMAILS) {
    const emails = [];
    const seen = new Set();
    const { $, text, html } = page;
    const addEmail = (email, context) => {
        if (emails.length >= maxEmails)
            return false;
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
        if (emails.length >= maxEmails)
            return false;
        const href = $(el).attr('href') || '';
        const email = decodeURIComponent(href.replace('mailto:', '').split('?')[0]).trim();
        addEmail(email, $(el).text().trim() || 'mailto link');
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P2: CloudFlare email protection ──
    $('a[data-cfemail], span[data-cfemail], [data-cfemail]').each((_, el) => {
        if (emails.length >= maxEmails)
            return false;
        const encoded = $(el).attr('data-cfemail');
        if (encoded) {
            const decoded = decodeCfEmail(encoded);
            if (decoded)
                addEmail(decoded, 'cloudflare protected');
        }
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P3: HTML data attributes ──
    $('[data-email], [data-mail], [data-contact-email]').each((_, el) => {
        if (emails.length >= maxEmails)
            return false;
        const email = $(el).attr('data-email') ||
            $(el).attr('data-mail') ||
            $(el).attr('data-contact-email');
        if (email)
            addEmail(email, 'data attribute');
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P4: JSON-LD structured data ──
    $('script[type="application/ld+json"]').each((_, el) => {
        if (emails.length >= maxEmails)
            return false;
        try {
            const json = JSON.parse($(el).html() || '');
            extractEmailsFromJsonLd(json, (email) => addEmail(email, 'structured data'));
        }
        catch {
            // malformed JSON-LD
        }
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P5: Meta tags ──
    const metaSelectors = [
        'meta[name="email"]',
        'meta[property="og:email"]',
        'meta[name="contact:email"]',
        'meta[itemprop="email"]',
    ];
    for (const sel of metaSelectors) {
        const content = $(sel).attr('content');
        if (content)
            addEmail(content, 'meta tag');
    }
    if (emails.length >= maxEmails)
        return emails;
    // ── P6: Itemprop="email" elements ──
    $('[itemprop="email"]').each((_, el) => {
        if (emails.length >= maxEmails)
            return false;
        const email = $(el).attr('content') || $(el).attr('href')?.replace('mailto:', '') || $(el).text();
        if (email)
            addEmail(email.trim(), 'schema.org itemprop');
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P7: Footer section ──
    const footerSelectors = [
        'footer', '#footer', '.footer',
        '[role="contentinfo"]', '.site-footer', '.page-footer',
    ];
    for (const selector of footerSelectors) {
        if (emails.length >= maxEmails)
            break;
        $(selector).each((_, el) => {
            const sectionText = $(el).text() || '';
            const sectionHtml = $(el).html() || '';
            // Check for obfuscated emails too
            const found = extractObfuscatedEmails(sectionText);
            for (const email of found)
                addEmail(email, 'footer');
            const regexMatches = (sectionText + ' ' + sectionHtml).match(EMAIL_REGEX) || [];
            for (const email of regexMatches)
                addEmail(email, 'footer');
        });
    }
    if (emails.length >= maxEmails)
        return emails;
    // ── P8: Contact sections ──
    const contactSelectors = [
        '#contact', '.contact', '[class*="contact"]',
        '#get-in-touch', '.get-in-touch',
        '[class*="email"]', '[id*="email"]',
        '[class*="reach"]', '[id*="contact"]',
    ];
    for (const selector of contactSelectors) {
        if (emails.length >= maxEmails)
            break;
        const sectionText = $(selector).text() || '';
        for (const email of extractObfuscatedEmails(sectionText)) {
            addEmail(email, 'contact section');
        }
        for (const email of sectionText.match(EMAIL_REGEX) || []) {
            addEmail(email, 'contact section');
        }
    }
    if (emails.length >= maxEmails)
        return emails;
    // ── P9: Input fields with email values ──
    $('input[type="hidden"], input[type="text"]').each((_, el) => {
        if (emails.length >= maxEmails)
            return false;
        const val = $(el).attr('value') || '';
        if (EMAIL_REGEX.test(val)) {
            addEmail(val.match(EMAIL_REGEX)[0], 'hidden input');
        }
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P10: Full page — obfuscated emails ──
    for (const email of extractObfuscatedEmails(text)) {
        if (emails.length >= maxEmails)
            break;
        addEmail(email, 'obfuscated in text');
    }
    if (emails.length >= maxEmails)
        return emails;
    // ── P11: Full page text regex (last resort) ──
    for (const email of text.match(EMAIL_REGEX) || []) {
        if (emails.length >= maxEmails)
            break;
        const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const ctx = text.match(new RegExp(`.{0,50}${escaped}.{0,50}`, 'i'));
        addEmail(email, ctx ? ctx[0] : '');
    }
    return emails;
}
// ─── 4. DEOBFUSCATION HELPERS ───────────────────────────────────────
// Decode CloudFlare's __cf_email__ protection
function decodeCfEmail(encoded) {
    try {
        const key = parseInt(encoded.substring(0, 2), 16);
        let email = '';
        for (let i = 2; i < encoded.length; i += 2) {
            const charCode = parseInt(encoded.substring(i, i + 2), 16) ^ key;
            email += String.fromCharCode(charCode);
        }
        return email.includes('@') ? email : null;
    }
    catch {
        return null;
    }
}
// Handle common text obfuscation patterns
function extractObfuscatedEmails(text) {
    const results = [];
    // Pattern: "user [at] domain [dot] com" and variants
    const obfuscationPatterns = [
        /([a-zA-Z0-9._%+-]+)\s*[$$\(]\s*at\s*[$$\)]\s*([a-zA-Z0-9.-]+)\s*[$$\(]\s*dot\s*[$$\)]\s*([a-zA-Z]{2,})/gi,
        /([a-zA-Z0-9._%+-]+)\s*\{at\}\s*([a-zA-Z0-9.-]+)\s*\{dot\}\s*([a-zA-Z]{2,})/gi,
        /([a-zA-Z0-9._%+-]+)\s*\bat\b\s*([a-zA-Z0-9.-]+)\s*\bdot\b\s*([a-zA-Z]{2,})/gi,
        // "user AT domain DOT com"
        /([a-zA-Z0-9._%+-]+)\s+AT\s+([a-zA-Z0-9.-]+)\s+DOT\s+([a-zA-Z]{2,})/g,
        // HTML entity obfuscation decoded in text: "user&#64;domain.com"
    ];
    for (const pattern of obfuscationPatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const email = `${match[1]}@${match[2]}.${match[3]}`.toLowerCase();
            if (isValidEmail(email)) {
                results.push(email);
            }
        }
    }
    // Handle HTML entity encoded @ symbols that might appear in text
    const entityDecoded = text
        .replace(/&#64;/g, '@')
        .replace(/&#x40;/g, '@')
        .replace(/&commat;/g, '@');
    if (entityDecoded !== text) {
        const found = entityDecoded.match(EMAIL_REGEX) || [];
        results.push(...found.filter(isValidEmail));
    }
    return results;
}
// Recursively extract emails from JSON-LD objects
function extractEmailsFromJsonLd(obj, onEmail) {
    if (!obj || typeof obj !== 'object')
        return;
    if (Array.isArray(obj)) {
        for (const item of obj)
            extractEmailsFromJsonLd(item, onEmail);
        return;
    }
    const record = obj;
    for (const [key, value] of Object.entries(record)) {
        if ((key === 'email' || key === 'contactPoint' || key === 'sameAs') &&
            typeof value === 'string' &&
            value.includes('@')) {
            const cleaned = value.replace('mailto:', '');
            onEmail(cleaned);
        }
        else if (typeof value === 'object') {
            extractEmailsFromJsonLd(value, onEmail);
        }
    }
}
// ─── 5. IMPROVED VALIDATION ─────────────────────────────────────────
function isValidEmail(email) {
    if (!email.includes('@') || !email.includes('.'))
        return false;
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain)
        return false;
    if (localPart.length > 64 || domain.length > 253)
        return false;
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
    if (/[/\\]/.test(email))
        return false;
    // File extensions that aren't TLDs
    if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|json|xml|pdf|zip)$/i.test(email)) {
        return false;
    }
    // Starts or ends with dot/dash in local part
    if (/^[.\-]|[.\-]$/.test(localPart))
        return false;
    // CSS/code artifacts
    if (/^[0-9]+px/.test(localPart) || localPart.includes('--'))
        return false;
    // Local part should only contain valid characters
    if (!/^[a-z0-9._%+-]+$/i.test(localPart)) {
        return false;
    }
    return true;
}
// Score an email for prioritization (higher = better for outreach)
function scoreEmailForOutreach(email, role) {
    let score = 0;
    const prefix = email.split('@')[0].toLowerCase();
    // Prefer owner/personal emails over generic ones
    if (role === 'owner')
        score += 30;
    if (role === 'admin')
        score += 20;
    if (role === 'info')
        score += 10;
    // Personal names are best (likely decision makers)
    if (/^[a-z]+\.[a-z]+$/.test(prefix))
        score += 25; // john.smith
    if (/^[a-z]{2,15}$/.test(prefix) && !['info', 'hello', 'contact', 'support', 'help', 'admin', 'office', 'sales', 'team', 'mail', 'email'].includes(prefix)) {
        score += 20; // john (but not generic words)
    }
    // Generic contact emails are ok but less ideal
    if (['info', 'hello', 'contact'].includes(prefix))
        score += 5;
    // Penalize generic/department emails
    if (['support', 'help', 'sales', 'billing', 'hr', 'jobs', 'careers', 'noreply', 'no-reply'].includes(prefix)) {
        score -= 20;
    }
    return score;
}
// ─── UNCHANGED HELPERS ──────────────────────────────────────────────
function classifyEmailRole(email, context) {
    const emailLower = email.toLowerCase();
    const contextLower = context.toLowerCase();
    if (/owner|founder|ceo|director|principal/.test(contextLower))
        return 'owner';
    if (/admin|manager|coordinator|operations/.test(contextLower))
        return 'admin';
    const prefix = emailLower.split('@')[0];
    if (['info', 'hello', 'contact', 'inquiries', 'support', 'help', 'office'].includes(prefix)) {
        return 'info';
    }
    if (/^[a-z]+(\.[a-z]+)?$/.test(prefix))
        return 'owner';
    return 'unknown';
}
function detectSchedulingTool(html, text) {
    const combined = (html + ' ' + text).toLowerCase();
    for (const tool of SCHEDULING_TOOLS) {
        if (combined.includes(tool))
            return tool;
    }
    return null;
}
function detectMultipleTutors(text) {
    const lower = text.toLowerCase();
    return MULTI_TUTOR_KEYWORDS.some((kw) => lower.includes(kw));
}
function extractSocialLinks(html) {
    const $ = cheerio.load(html);
    let linkedin = null;
    let facebook = null;
    $('a[href*="linkedin.com"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('linkedin.com/company'))
            linkedin = href;
    });
    $('a[href*="facebook.com"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.includes('sharer') && !href.includes('share.php')) {
            facebook = href;
        }
    });
    return { linkedin, facebook };
}
function extractSpecialties(text) {
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
// ─── 6. REWRITTEN ORCHESTRATOR ──────────────────────────────────────
export async function enrichLead(lead) {
    const result = {
        emails: [],
        hasMultipleTutors: false,
        existingSchedulingTool: null,
        linkedinUrl: null,
        facebookUrl: null,
        specialties: [],
    };
    if (!lead.website)
        return result;
    let baseUrl = lead.website;
    if (!baseUrl.startsWith('http'))
        baseUrl = 'https://' + baseUrl;
    baseUrl = baseUrl.replace(/\/$/, '');
    const visited = new Set();
    const allText = [];
    let pagesFetched = 0;
    const processPage = (page) => {
        allText.push(page.text);
        // Extract emails with the new comprehensive extractor
        const pageEmails = extractEmails(page, MAX_EMAILS - result.emails.length);
        for (const { email, context } of pageEmails) {
            if (result.emails.length >= MAX_EMAILS)
                break;
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
        if (social.linkedin && !result.linkedinUrl)
            result.linkedinUrl = social.linkedin;
        if (social.facebook && !result.facebookUrl)
            result.facebookUrl = social.facebook;
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
                if (result.emails.length >= MAX_EMAILS || pagesFetched >= MAX_PAGES)
                    break;
                const normalized = link.replace(/\/$/, '');
                if (visited.has(normalized))
                    continue;
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
            if (result.emails.length >= MAX_EMAILS || pagesFetched >= MAX_PAGES)
                break;
            const url = baseUrl + path;
            const normalized = url.replace(/\/$/, '');
            if (visited.has(normalized))
                continue;
            visited.add(normalized);
            const page = await fetchWithRetry(normalized, 1);
            if (page) {
                pagesFetched++;
                processPage(page);
            }
        }
    }
    result.specialties = extractSpecialties(allText.join(' '));
    return result;
}
// ─── enrichAndSaveLead stays the same ───────────────────────────────
export async function enrichAndSaveLead(leadId) {
    const lead = getLeadById(leadId);
    if (!lead)
        throw new Error(`Lead not found: ${leadId}`);
    const enrichment = await enrichLead(lead);
    // Sort emails by outreach score (best email first)
    const sortedEmails = enrichment.emails
        .map(e => ({ ...e, score: scoreEmailForOutreach(e.email, e.role) }))
        .sort((a, b) => b.score - a.score);
    let emailsAdded = 0;
    for (const { email, role } of sortedEmails) {
        if (!emailExistsForLead(leadId, email)) {
            insertLeadEmail({
                lead_id: leadId,
                email,
                contact_name: null,
                role,
                verification_status: 'unverified',
                source: 'scraped',
                is_primary: emailsAdded === 0 ? 1 : 0,
            });
            emailsAdded++;
        }
    }
    // FALLBACK: If no emails scraped, generate pattern-based guesses
    if (emailsAdded === 0 && lead.website) {
        const domain = extractDomainFromUrl(lead.website);
        if (domain && !isGenericDomain(domain)) {
            const patterns = generateEmailPatterns(domain);
            // Only add the most common patterns (info@, hello@, contact@)
            for (const email of patterns.slice(0, 3)) {
                if (!emailExistsForLead(leadId, email)) {
                    insertLeadEmail({
                        lead_id: leadId,
                        email,
                        contact_name: null,
                        role: 'info',
                        verification_status: 'unverified',
                        source: 'pattern_guess',
                        is_primary: emailsAdded === 0 ? 1 : 0,
                    });
                    emailsAdded++;
                }
            }
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
        specialties: enrichment.specialties.length > 0
            ? JSON.stringify(enrichment.specialties)
            : null,
        raw_data: null,
        emails_found_count: emailsAdded,
    });
    return { emailsFound: emailsAdded, enrichmentSaved: true };
}
// Helper to extract domain from URL
function extractDomainFromUrl(url) {
    try {
        let cleanUrl = url;
        if (!cleanUrl.startsWith('http'))
            cleanUrl = 'https://' + cleanUrl;
        const parsed = new URL(cleanUrl);
        return parsed.hostname.replace(/^www\./, '');
    }
    catch {
        return null;
    }
}
// Check if domain is a generic hosting platform (don't guess emails for these)
function isGenericDomain(domain) {
    const genericDomains = [
        'wixsite.com', 'squarespace.com', 'wordpress.com', 'weebly.com',
        'godaddysites.com', 'carrd.co', 'sites.google.com', 'canva.site',
        'webflow.io', 'netlify.app', 'vercel.app', 'github.io',
        'kumon.com', 'sylvanlearning.com', 'oxfordlearning.com', // Franchises
        'tutordoctor.com', 'huntingtonhelps.com', 'mathnasium.com',
    ];
    return genericDomains.some(g => domain.includes(g));
}
export function generateEmailPatterns(domain, firstName, lastName) {
    const patterns = [
        `info@${domain}`,
        `hello@${domain}`,
        `contact@${domain}`,
        `inquiries@${domain}`,
        `admin@${domain}`,
    ];
    if (firstName) {
        const first = firstName.toLowerCase();
        patterns.push(`${first}@${domain}`);
        if (lastName) {
            const last = lastName.toLowerCase();
            patterns.push(`${first}.${last}@${domain}`, `${first}${last}@${domain}`, `${first[0]}${last}@${domain}`, `${last}@${domain}`);
        }
    }
    return patterns;
}
