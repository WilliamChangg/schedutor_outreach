"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichLead = enrichLead;
exports.enrichAndSaveLead = enrichAndSaveLead;
var undici_1 = require("undici");
var cheerio = require("cheerio");
var rate_limiter_js_1 = require("../utils/rate-limiter.js");
var index_js_1 = require("../db/index.js");
var puppeteer_fetcher_js_1 = require("./puppeteer-fetcher.js");
// ─── REGEX ───────────────────────────────────────────────────────────
// NOTE: Do NOT use this as a module-level singleton with .test() —
// the /g flag persists lastIndex across calls, causing silent alternating
// true/false results. Always call getEmailRegex() for a fresh instance.
function getEmailRegex() {
    return /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
}
// Non-global version safe for .test() calls
var EMAIL_REGEX_TEST = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
var MAX_EMAILS = 2;
var MAX_PAGES = 12;
// ─── EXPANDED STATIC PATHS (fallback only) ───────────────────────────
var STATIC_CONTACT_PATHS = [
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
var SCHEDULING_TOOLS = [
    'calendly', 'acuity', 'schedulicity', 'setmore',
    'square appointments', 'booksy', 'timely', 'vcita',
    'appointy', 'picktime', 'simplybook', 'tutor cruncher',
    'tutorcruncher', 'teachworks', 'my tutor source', 'tutorbird',
    'youcanbook', 'doodle', 'book.me', 'hubspot meetings',
];
var MULTI_TUTOR_KEYWORDS = [
    'our tutors', 'our team', 'meet our', 'staff',
    'instructors', 'educators', 'teachers', 'specialists',
    'team members', 'our experts', 'faculty',
];
var INVALID_DOMAINS = [
    'example.com', 'test.com', 'localhost', 'domain.com',
    'email.com', 'your-email.com', 'yoursite.com',
    'website.com', 'company.com', 'sentry.io',
    'wixpress.com', 'squarespace.com', 'wordpress.com',
    'w3.org', 'schema.org', 'googleapis.com',
    'gravatar.com', 'cloudflare.com',
];
// Rotated UA pool — reduces fingerprinting from a single static string
var USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
];
function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}
var domainFailures = new Map();
// Cache for robots.txt allow/deny decisions
var robotsCache = new Map();
function getBlockDuration(failureCount) {
    var baseMs = 30 * 60 * 1000;
    var maxMs = 24 * 60 * 60 * 1000;
    return Math.min(baseMs * Math.pow(2, failureCount - 1), maxMs);
}
function isDomainBotBlocked(domain) {
    var failure = domainFailures.get(domain);
    if (!(failure === null || failure === void 0 ? void 0 : failure.botBlockedAt))
        return false;
    return Date.now() - failure.botBlockedAt < getBlockDuration(1);
}
function isDomainTimeoutBacked(domain) {
    var failure = domainFailures.get(domain);
    if (!failure)
        return false;
    // Back off for 5 minutes after 3+ consecutive timeouts
    if (failure.timeoutCount >= 3) {
        return Date.now() - failure.lastTimeoutAt < 5 * 60 * 1000;
    }
    return false;
}
function markDomainBotBlocked(domain) {
    var _a, _b;
    var existing = domainFailures.get(domain);
    domainFailures.set(domain, {
        botBlockedAt: Date.now(),
        timeoutCount: (_a = existing === null || existing === void 0 ? void 0 : existing.timeoutCount) !== null && _a !== void 0 ? _a : 0,
        lastTimeoutAt: (_b = existing === null || existing === void 0 ? void 0 : existing.lastTimeoutAt) !== null && _b !== void 0 ? _b : 0,
    });
}
function markDomainTimeout(domain) {
    var _a, _b;
    var existing = domainFailures.get(domain);
    domainFailures.set(domain, {
        botBlockedAt: (_a = existing === null || existing === void 0 ? void 0 : existing.botBlockedAt) !== null && _a !== void 0 ? _a : null,
        timeoutCount: ((_b = existing === null || existing === void 0 ? void 0 : existing.timeoutCount) !== null && _b !== void 0 ? _b : 0) + 1,
        lastTimeoutAt: Date.now(),
    });
}
function isScrapingAllowed(baseUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var domain, resp, body, blocked, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    try {
                        domain = new URL(baseUrl).hostname;
                    }
                    catch (_c) {
                        return [2 /*return*/, true];
                    }
                    if (robotsCache.has(domain))
                        return [2 /*return*/, robotsCache.get(domain)];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, (0, undici_1.request)(baseUrl + '/robots.txt', {
                            headers: { 'User-Agent': getRandomUA() },
                            headersTimeout: 5000,
                            bodyTimeout: 5000,
                            maxRedirections: 3,
                        })];
                case 2:
                    resp = _b.sent();
                    return [4 /*yield*/, safeReadBody(resp.body)];
                case 3:
                    body = _b.sent();
                    blocked = !!body &&
                        body.includes('User-agent: *') &&
                        body.includes('Disallow: /');
                    robotsCache.set(domain, !blocked);
                    return [2 /*return*/, !blocked];
                case 4:
                    _a = _b.sent();
                    // If we can't fetch robots.txt, assume allowed
                    robotsCache.set(domain, true);
                    return [2 /*return*/, true];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function safeReadBody(body) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) {
                    var chunks = [];
                    body.on('data', function (chunk) { return chunks.push(chunk); });
                    body.on('end', function () { return resolve(Buffer.concat(chunks).toString('utf-8')); });
                    body.on('error', function () {
                        resolve(chunks.length > 0 ? Buffer.concat(chunks).toString('utf-8') : null);
                    });
                })];
        });
    });
}
function isBotProtectionPage(html) {
    var botIndicators = [
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
    return botIndicators.some(function (indicator) { return html.includes(indicator); });
}
function buildPageContent(html, url) {
    var $ = cheerio.load(html);
    $('script, style, noscript, svg').remove();
    return {
        html: html,
        text: $('body').text().replace(/\s+/g, ' ').trim(),
        url: url,
        $: $,
    };
}
function fetchPage(url) {
    return __awaiter(this, void 0, void 0, function () {
        var domain, response, contentType, html, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 4, , 5]);
                    domain = new URL(url).hostname;
                    // Skip confirmed bot-blocked domains
                    if (isDomainBotBlocked(domain))
                        return [2 /*return*/, null];
                    // Temporarily back off domains with repeated timeout failures
                    if (isDomainTimeoutBacked(domain))
                        return [2 /*return*/, null];
                    return [4 /*yield*/, rate_limiter_js_1.scrapingRateLimiter.waitForSlot()];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, (0, undici_1.request)(url, {
                            headers: {
                                'User-Agent': getRandomUA(),
                                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                'Accept-Language': 'en-US,en;q=0.5',
                                'Accept-Encoding': 'identity',
                            },
                            maxRedirections: 5,
                            headersTimeout: 12000,
                            bodyTimeout: 20000,
                        })];
                case 2:
                    response = _b.sent();
                    // Confirmed bot protection — hard block the domain
                    if (response.statusCode === 403 || response.statusCode === 429) {
                        markDomainBotBlocked(domain);
                        return [2 /*return*/, null];
                    }
                    if (response.statusCode !== 200)
                        return [2 /*return*/, null];
                    contentType = response.headers['content-type'] || '';
                    if (!contentType.includes('text/html') &&
                        !contentType.includes('application/xhtml')) {
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, safeReadBody(response.body)];
                case 3:
                    html = _b.sent();
                    if (!html) {
                        // Empty body is a transient failure, not a bot block
                        markDomainTimeout(domain);
                        return [2 /*return*/, null];
                    }
                    if (isBotProtectionPage(html)) {
                        markDomainBotBlocked(domain);
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, buildPageContent(html, url)];
                case 4:
                    _a = _b.sent();
                    // Network errors / timeouts — count separately, do NOT hard-block
                    try {
                        markDomainTimeout(new URL(url).hostname);
                    }
                    catch (_c) { }
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function fetchWithRetry(url_1) {
    return __awaiter(this, arguments, void 0, function (url, retries) {
        var _loop_1, attempt, state_1;
        if (retries === void 0) { retries = 2; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _loop_1 = function (attempt) {
                        var result;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, fetchPage(url)];
                                case 1:
                                    result = _b.sent();
                                    if (result)
                                        return [2 /*return*/, { value: result }];
                                    if (!(attempt < retries)) return [3 /*break*/, 3];
                                    return [4 /*yield*/, new Promise(function (res) { return setTimeout(res, 1000 * Math.pow(2, attempt)); })];
                                case 2:
                                    _b.sent();
                                    _b.label = 3;
                                case 3: return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 0;
                    _a.label = 1;
                case 1:
                    if (!(attempt <= retries)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _a.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _a.label = 3;
                case 3:
                    attempt++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, null];
            }
        });
    });
}
function fetchWithFallback(baseUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var variants, url, urlWithWww, urlWithoutWww, uniqueVariants, _i, uniqueVariants_1, variant, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    variants = [];
                    try {
                        url = new URL(baseUrl);
                        variants.push(url.toString());
                        if (url.protocol === 'http:') {
                            url.protocol = 'https:';
                            variants.push(url.toString());
                        }
                        urlWithWww = new URL(baseUrl);
                        urlWithoutWww = new URL(baseUrl);
                        if (urlWithWww.hostname.startsWith('www.')) {
                            urlWithoutWww.hostname = urlWithWww.hostname.replace('www.', '');
                        }
                        else {
                            urlWithWww.hostname = 'www.' + urlWithoutWww.hostname;
                        }
                        variants.push(urlWithWww.toString());
                        variants.push(urlWithoutWww.toString());
                        urlWithWww.protocol = 'https:';
                        urlWithoutWww.protocol = 'https:';
                        variants.push(urlWithWww.toString());
                        variants.push(urlWithoutWww.toString());
                    }
                    catch (_b) {
                        variants.push(baseUrl);
                    }
                    uniqueVariants = __spreadArray([], new Set(variants), true);
                    _i = 0, uniqueVariants_1 = uniqueVariants;
                    _a.label = 1;
                case 1:
                    if (!(_i < uniqueVariants_1.length)) return [3 /*break*/, 4];
                    variant = uniqueVariants_1[_i];
                    return [4 /*yield*/, fetchWithRetry(variant, 1)];
                case 2:
                    result = _a.sent();
                    if (result)
                        return [2 /*return*/, result];
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, null];
            }
        });
    });
}
// ─── 2. SITEMAP PARSING ──────────────────────────────────────────────
function extractUrlsFromSitemap(baseUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var urls, sitemapPage, matches, _i, matches_1, match, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    urls = [];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fetchWithRetry(baseUrl + '/sitemap.xml', 1)];
                case 2:
                    sitemapPage = _b.sent();
                    if (!sitemapPage)
                        return [2 /*return*/, urls];
                    matches = sitemapPage.html.match(/<loc>(.*?)<\/loc>/gi) || [];
                    for (_i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
                        match = matches_1[_i];
                        urls.push(match.replace(/<\/?loc>/gi, '').trim());
                    }
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, urls];
            }
        });
    });
}
function discoverContactLinks($, baseUrl) {
    var found = [];
    var seenUrls = new Set();
    var contactPatterns = /\b(contact|about|team|staff|people|connect|reach|get.?in.?touch|inquiry|support|founder|owner|leadership|meet|principal)\b/i;
    // Broader patterns to catch nav links like "Meet Sarah" or "Our Approach"
    var broadPatterns = /\b(meet|our|story|approach|learn|tutor|work|welcome|hire|bio|profile)\b/i;
    var navSelectors = ['nav', 'header', '.nav', '.navigation', '#nav', '[role="navigation"]'];
    var footerSelectors = ['footer', '.footer', '#footer', '[role="contentinfo"]'];
    $('a[href]').each(function (_, el) {
        var $el = $(el);
        var href = $el.attr('href') || '';
        var text = $el.text().toLowerCase().trim();
        if (/facebook|linkedin|twitter|instagram|youtube|tiktok/i.test(href))
            return;
        var isInNav = navSelectors.some(function (sel) { return $el.closest(sel).length > 0; });
        var matchesStrict = contactPatterns.test(text) || contactPatterns.test(href);
        var matchesBroad = broadPatterns.test(text) || broadPatterns.test(href);
        // Require either a strict match, or a broad match in nav (to catch "Meet Sarah" etc.)
        if (!matchesStrict && !(matchesBroad && isInNav))
            return;
        try {
            var resolved = new URL(href, baseUrl).toString();
            var base = new URL(baseUrl);
            var target = new URL(resolved);
            if (target.hostname !== base.hostname &&
                target.hostname !== 'www.' + base.hostname &&
                'www.' + target.hostname !== base.hostname) {
                return;
            }
            var normalized_1 = resolved.replace(/\/$/, '').split('?')[0];
            var score = 0;
            var isInFooter = footerSelectors.some(function (sel) { return $el.closest(sel).length > 0; });
            if (isInNav)
                score += 30;
            if (isInFooter)
                score += 20;
            if (/founder|owner|principal|director/i.test(text))
                score += 35;
            if (/contact|email|reach/i.test(text))
                score += 25;
            if (/about|team|staff/i.test(text))
                score += 15;
            if (/meet/i.test(text))
                score += 20;
            if (/\/contact/i.test(href))
                score += 20;
            if (/\/about/i.test(href))
                score += 10;
            if (/\/team|\/staff|\/people/i.test(href))
                score += 15;
            if (/\/founder|\/owner|\/leadership/i.test(href))
                score += 30;
            if (seenUrls.has(normalized_1)) {
                var existing = found.find(function (f) { return f.url === normalized_1; });
                if (existing)
                    existing.score = Math.max(existing.score, score);
                return;
            }
            seenUrls.add(normalized_1);
            found.push({ url: normalized_1, score: score });
        }
        catch (_a) { }
    });
    return found.sort(function (a, b) { return b.score - a.score; }).map(function (f) { return f.url; });
}
// ─── 4. COMPREHENSIVE EMAIL EXTRACTION ───────────────────────────────
function extractEmails(page, maxEmails) {
    if (maxEmails === void 0) { maxEmails = MAX_EMAILS; }
    var emails = [];
    var seen = new Set();
    var $ = page.$, text = page.text, html = page.html;
    var addEmail = function (email, context) {
        if (emails.length >= maxEmails)
            return false;
        var lower = email.toLowerCase().replace(/\.$/, '');
        if (!seen.has(lower) && isValidEmail(lower)) {
            seen.add(lower);
            emails.push({ email: lower, context: context.trim().slice(0, 200) });
            return true;
        }
        return false;
    };
    // ── P1: mailto: links ──
    $('a[href^="mailto:"]').each(function (_, el) {
        if (emails.length >= maxEmails)
            return false;
        var href = $(el).attr('href') || '';
        var email = decodeURIComponent(href.replace('mailto:', '').split('?')[0]).trim();
        addEmail(email, $(el).text().trim() || 'mailto link');
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P2: CloudFlare email protection ──
    $('a[data-cfemail], span[data-cfemail], [data-cfemail]').each(function (_, el) {
        if (emails.length >= maxEmails)
            return false;
        var encoded = $(el).attr('data-cfemail');
        if (encoded) {
            var decoded = decodeCfEmail(encoded);
            if (decoded)
                addEmail(decoded, 'cloudflare protected');
        }
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P3: HTML data attributes ──
    $('[data-email], [data-mail], [data-contact-email]').each(function (_, el) {
        if (emails.length >= maxEmails)
            return false;
        var email = $(el).attr('data-email') ||
            $(el).attr('data-mail') ||
            $(el).attr('data-contact-email');
        if (email)
            addEmail(email, 'data attribute');
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P4: JSON-LD structured data ──
    $('script[type="application/ld+json"]').each(function (_, el) {
        if (emails.length >= maxEmails)
            return false;
        try {
            var json = JSON.parse($(el).html() || '');
            extractEmailsFromJsonLd(json, function (email) { return addEmail(email, 'structured data'); });
        }
        catch (_a) { }
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P5: Meta tags ──
    var metaSelectors = [
        'meta[name="email"]',
        'meta[property="og:email"]',
        'meta[name="contact:email"]',
        'meta[itemprop="email"]',
    ];
    for (var _i = 0, metaSelectors_1 = metaSelectors; _i < metaSelectors_1.length; _i++) {
        var sel = metaSelectors_1[_i];
        var content = $(sel).attr('content');
        if (content)
            addEmail(content, 'meta tag');
    }
    if (emails.length >= maxEmails)
        return emails;
    // ── P6: Itemprop="email" elements ──
    $('[itemprop="email"]').each(function (_, el) {
        var _a;
        if (emails.length >= maxEmails)
            return false;
        var email = $(el).attr('content') ||
            ((_a = $(el).attr('href')) === null || _a === void 0 ? void 0 : _a.replace('mailto:', '')) ||
            $(el).text();
        if (email)
            addEmail(email.trim(), 'schema.org itemprop');
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P6.5: Form action mailto ──
    // Small business sites often use mailto: as form action
    $('form[action^="mailto:"]').each(function (_, el) {
        if (emails.length >= maxEmails)
            return false;
        var action = $(el).attr('action') || '';
        var email = action.replace('mailto:', '').split('?')[0].trim();
        addEmail(email, 'form action mailto');
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P6.6: Hidden/text inputs with recipient fields (FormMail pattern) ──
    $('input[name="_to"], input[name="recipient"], input[name="_replyto"]').each(function (_, el) {
        if (emails.length >= maxEmails)
            return false;
        var val = $(el).attr('value') || '';
        if (val.includes('@'))
            addEmail(val.trim(), 'form recipient field');
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P7: Footer section ──
    var footerSelectors = [
        'footer', '#footer', '.footer',
        '[role="contentinfo"]', '.site-footer', '.page-footer',
    ];
    for (var _a = 0, footerSelectors_1 = footerSelectors; _a < footerSelectors_1.length; _a++) {
        var selector = footerSelectors_1[_a];
        if (emails.length >= maxEmails)
            break;
        $(selector).each(function (_, el) {
            var sectionText = $(el).text() || '';
            var sectionHtml = $(el).html() || '';
            for (var _i = 0, _a = extractObfuscatedEmails(sectionText); _i < _a.length; _i++) {
                var email = _a[_i];
                addEmail(email, 'footer');
            }
            for (var _b = 0, _c = (sectionText + ' ' + sectionHtml).match(getEmailRegex()) || []; _b < _c.length; _b++) {
                var email = _c[_b];
                addEmail(email, 'footer');
            }
        });
    }
    if (emails.length >= maxEmails)
        return emails;
    // ── P8: Contact sections ──
    var contactSelectors = [
        '#contact', '.contact', '[class*="contact"]',
        '#get-in-touch', '.get-in-touch',
        '[class*="email"]', '[id*="email"]',
        '[class*="reach"]', '[id*="contact"]',
    ];
    for (var _b = 0, contactSelectors_1 = contactSelectors; _b < contactSelectors_1.length; _b++) {
        var selector = contactSelectors_1[_b];
        if (emails.length >= maxEmails)
            break;
        var sectionText = $(selector).text() || '';
        for (var _c = 0, _d = extractObfuscatedEmails(sectionText); _c < _d.length; _c++) {
            var email = _d[_c];
            addEmail(email, 'contact section');
        }
        for (var _e = 0, _f = sectionText.match(getEmailRegex()) || []; _e < _f.length; _e++) {
            var email = _f[_e];
            addEmail(email, 'contact section');
        }
    }
    if (emails.length >= maxEmails)
        return emails;
    // ── P9: Input fields with email values ──
    $('input[type="hidden"], input[type="text"]').each(function (_, el) {
        if (emails.length >= maxEmails)
            return false;
        var val = $(el).attr('value') || '';
        // Use non-global regex for .test() to avoid lastIndex state bug
        if (EMAIL_REGEX_TEST.test(val)) {
            var match = val.match(getEmailRegex());
            if (match)
                addEmail(match[0], 'hidden input');
        }
    });
    if (emails.length >= maxEmails)
        return emails;
    // ── P10: Full page — obfuscated emails ──
    for (var _g = 0, _h = extractObfuscatedEmails(text); _g < _h.length; _g++) {
        var email = _h[_g];
        if (emails.length >= maxEmails)
            break;
        addEmail(email, 'obfuscated in text');
    }
    if (emails.length >= maxEmails)
        return emails;
    // ── P11: Full page text regex (last resort) ──
    for (var _j = 0, _k = text.match(getEmailRegex()) || []; _j < _k.length; _j++) {
        var email = _k[_j];
        if (emails.length >= maxEmails)
            break;
        var escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var ctx = text.match(new RegExp(".{0,50}".concat(escaped, ".{0,50}"), 'i'));
        addEmail(email, ctx ? ctx[0] : '');
    }
    return emails;
}
// ─── 5. DEOBFUSCATION HELPERS ────────────────────────────────────────
function decodeCfEmail(encoded) {
    try {
        var key = parseInt(encoded.substring(0, 2), 16);
        var email = '';
        for (var i = 2; i < encoded.length; i += 2) {
            var charCode = parseInt(encoded.substring(i, i + 2), 16) ^ key;
            email += String.fromCharCode(charCode);
        }
        return email.includes('@') ? email : null;
    }
    catch (_a) {
        return null;
    }
}
function normalizeUnicodeEmail(text) {
    return text
        .replace(/\uff20/g, '@')
        .replace(/\u3002/g, '.')
        .replace(/\uff0e/g, '.')
        .replace(/[\uff01-\uff5e]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    });
}
function extractObfuscatedEmails(text) {
    var results = [];
    var normalizedText = normalizeUnicodeEmail(text);
    var obfuscationPatterns = [
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
    for (var _i = 0, obfuscationPatterns_1 = obfuscationPatterns; _i < obfuscationPatterns_1.length; _i++) {
        var pattern = obfuscationPatterns_1[_i];
        var match = void 0;
        while ((match = pattern.exec(normalizedText)) !== null) {
            var email = "".concat(match[1], "@").concat(match[2], ".").concat(match[3]).toLowerCase();
            if (isValidEmail(email))
                results.push(email);
        }
    }
    var entityDecoded = normalizedText
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
        var found = entityDecoded.match(getEmailRegex()) || [];
        results.push.apply(results, found.filter(isValidEmail));
    }
    return results;
}
function extractEmailsFromJsonLd(obj, onEmail, depth, maxDepth) {
    if (depth === void 0) { depth = 0; }
    if (maxDepth === void 0) { maxDepth = 10; }
    if (depth > maxDepth || !obj || typeof obj !== 'object')
        return;
    if (Array.isArray(obj)) {
        for (var _i = 0, obj_1 = obj; _i < obj_1.length; _i++) {
            var item = obj_1[_i];
            extractEmailsFromJsonLd(item, onEmail, depth + 1, maxDepth);
        }
        return;
    }
    var record = obj;
    if (record['@graph'] && Array.isArray(record['@graph'])) {
        for (var _a = 0, _b = record['@graph']; _a < _b.length; _a++) {
            var item = _b[_a];
            extractEmailsFromJsonLd(item, onEmail, depth + 1, maxDepth);
        }
    }
    for (var _c = 0, _d = Object.entries(record); _c < _d.length; _c++) {
        var _e = _d[_c], key = _e[0], value = _e[1];
        var keyLower = key.toLowerCase();
        if (typeof value === 'string') {
            if (keyLower === 'email' ||
                keyLower === 'mail' ||
                keyLower === 'contactemail' ||
                keyLower === 'workemail' ||
                keyLower === 'personalemail' ||
                keyLower.includes('email')) {
                var cleaned = value.replace('mailto:', '').trim();
                if (cleaned.includes('@'))
                    onEmail(cleaned);
            }
            if (keyLower === 'sameas' && value.startsWith('mailto:')) {
                onEmail(value.replace('mailto:', '').split('?')[0]);
            }
            if ((keyLower === 'url' || keyLower === 'href') &&
                value.startsWith('mailto:')) {
                onEmail(value.replace('mailto:', '').split('?')[0]);
            }
        }
        else if (typeof value === 'object' && value !== null) {
            extractEmailsFromJsonLd(value, onEmail, depth + 1, maxDepth);
        }
    }
}
// ─── 6. VALIDATION ───────────────────────────────────────────────────
function isValidEmail(email) {
    if (!email.includes('@') || !email.includes('.'))
        return false;
    var _a = email.split('@'), localPart = _a[0], domain = _a[1];
    if (!localPart || !domain)
        return false;
    if (localPart.length > 64 || domain.length > 253)
        return false;
    if (!/\.[a-z]{2,6}$/i.test(domain))
        return false;
    if (!/^[a-z0-9.-]+$/i.test(domain))
        return false;
    if (INVALID_DOMAINS.some(function (d) { return domain === d || domain.endsWith('.' + d); })) {
        return false;
    }
    if (/[/\\]/.test(email))
        return false;
    if (/\.(png|jpg|jpeg|gif|svg|webp|css|js|json|xml|pdf|zip)$/i.test(email)) {
        return false;
    }
    if (/^[.\-]|[.\-]$/.test(localPart))
        return false;
    if (/^[0-9]+px/.test(localPart) || localPart.includes('--'))
        return false;
    if (!/^[a-z0-9._%+-]+$/i.test(localPart))
        return false;
    return true;
}
function scoreEmailForOutreach(email, role) {
    var score = 0;
    var prefix = email.split('@')[0].toLowerCase();
    if (role === 'owner')
        score += 30;
    if (role === 'admin')
        score += 20;
    if (role === 'info')
        score += 10;
    if (/^[a-z]+\.[a-z]+$/.test(prefix))
        score += 25;
    if (/^[a-z]{2,15}$/.test(prefix) &&
        !['info', 'hello', 'contact', 'support', 'help', 'admin', 'office', 'sales', 'team', 'mail', 'email'].includes(prefix)) {
        score += 20;
    }
    if (['info', 'hello', 'contact'].includes(prefix))
        score += 5;
    if (['support', 'help', 'sales', 'billing', 'hr', 'jobs', 'careers', 'noreply', 'no-reply'].includes(prefix)) {
        score -= 20;
    }
    return score;
}
// ─── UNCHANGED HELPERS ───────────────────────────────────────────────
function classifyEmailRole(email, context) {
    var emailLower = email.toLowerCase();
    var contextLower = context.toLowerCase();
    if (/owner|founder|ceo|director|principal/.test(contextLower))
        return 'owner';
    if (/admin|manager|coordinator|operations/.test(contextLower))
        return 'admin';
    var prefix = emailLower.split('@')[0];
    if (['info', 'hello', 'contact', 'inquiries', 'support', 'help', 'office'].includes(prefix)) {
        return 'info';
    }
    if (/^[a-z]+(\.[a-z]+)?$/.test(prefix))
        return 'owner';
    return 'unknown';
}
function detectSchedulingTool(html, text) {
    var combined = (html + ' ' + text).toLowerCase();
    for (var _i = 0, SCHEDULING_TOOLS_1 = SCHEDULING_TOOLS; _i < SCHEDULING_TOOLS_1.length; _i++) {
        var tool = SCHEDULING_TOOLS_1[_i];
        if (combined.includes(tool))
            return tool;
    }
    return null;
}
function detectMultipleTutors(text) {
    var lower = text.toLowerCase();
    return MULTI_TUTOR_KEYWORDS.some(function (kw) { return lower.includes(kw); });
}
function extractSocialLinks(html) {
    var $ = cheerio.load(html);
    var linkedin = null;
    var facebook = null;
    $('a[href*="linkedin.com"]').each(function (_, el) {
        var href = $(el).attr('href');
        if (href && href.includes('linkedin.com/company'))
            linkedin = href;
    });
    $('a[href*="facebook.com"]').each(function (_, el) {
        var href = $(el).attr('href');
        if (href && !href.includes('sharer') && !href.includes('share.php')) {
            facebook = href;
        }
    });
    return { linkedin: linkedin, facebook: facebook };
}
function extractSpecialties(text) {
    var lower = text.toLowerCase();
    var subjects = [
        'math', 'mathematics', 'algebra', 'geometry', 'calculus',
        'reading', 'writing', 'english', 'essay',
        'science', 'physics', 'chemistry', 'biology',
        'sat', 'act', 'gre', 'gmat', 'lsat', 'mcat',
        'spanish', 'french', 'mandarin', 'chinese',
        'coding', 'programming', 'computer science',
        'elementary', 'middle school', 'high school', 'college',
        'test prep', 'homework help', 'study skills',
    ];
    return __spreadArray([], new Set(subjects.filter(function (s) { return lower.includes(s); })), true).slice(0, 10);
}
// ─── 7. ORCHESTRATOR ─────────────────────────────────────────────────
var SKIP_FRANCHISES = [
    'kumon', 'sylvan', 'mathnasium', 'huntington',
    'oxford learning', 'tutor doctor', 'club z',
];
function shouldSkipLead(lead) {
    var nameLower = lead.business_name.toLowerCase();
    var websiteLower = (lead.website || '').toLowerCase();
    return SKIP_FRANCHISES.some(function (franchise) {
        return nameLower.includes(franchise) || websiteLower.includes(franchise);
    });
}
function enrichLead(lead) {
    return __awaiter(this, void 0, void 0, function () {
        var result, baseUrl, visited, allText, pagesFetched, processPage, discoveredLinks, homepage, _i, discoveredLinks_1, link, normalized, page, _a, STATIC_CONTACT_PATHS_1, path, url, normalized, page, sitemapUrls, contactishUrls, _b, contactishUrls_1, url, normalized, page, puppeteerTargets, _c, _d, link, _e, puppeteerTargets_1, target, puppeteerPage, $;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    result = {
                        emails: [],
                        hasMultipleTutors: false,
                        existingSchedulingTool: null,
                        linkedinUrl: null,
                        facebookUrl: null,
                        specialties: [],
                    };
                    if (shouldSkipLead(lead))
                        return [2 /*return*/, result];
                    if (!lead.website)
                        return [2 /*return*/, result];
                    baseUrl = lead.website;
                    if (!baseUrl.startsWith('http'))
                        baseUrl = 'https://' + baseUrl;
                    baseUrl = baseUrl.replace(/\/$/, '');
                    return [4 /*yield*/, isScrapingAllowed(baseUrl)];
                case 1:
                    // Skip domains that disallow all crawlers via robots.txt
                    if (!(_f.sent()))
                        return [2 /*return*/, result];
                    visited = new Set();
                    allText = [];
                    pagesFetched = 0;
                    processPage = function (page) {
                        allText.push(page.text);
                        var pageEmails = extractEmails(page, MAX_EMAILS - result.emails.length);
                        var _loop_2 = function (email, context) {
                            if (result.emails.length >= MAX_EMAILS)
                                return "break";
                            if (!result.emails.some(function (e) { return e.email === email; })) {
                                result.emails.push({ email: email, context: context, role: classifyEmailRole(email, context) });
                            }
                        };
                        for (var _i = 0, pageEmails_1 = pageEmails; _i < pageEmails_1.length; _i++) {
                            var _a = pageEmails_1[_i], email = _a.email, context = _a.context;
                            var state_2 = _loop_2(email, context);
                            if (state_2 === "break")
                                break;
                        }
                        if (!result.existingSchedulingTool) {
                            result.existingSchedulingTool = detectSchedulingTool(page.html, page.text);
                        }
                        if (!result.hasMultipleTutors) {
                            result.hasMultipleTutors = detectMultipleTutors(page.text);
                        }
                        var social = extractSocialLinks(page.html);
                        if (social.linkedin && !result.linkedinUrl)
                            result.linkedinUrl = social.linkedin;
                        if (social.facebook && !result.facebookUrl)
                            result.facebookUrl = social.facebook;
                    };
                    discoveredLinks = [];
                    return [4 /*yield*/, fetchWithFallback(baseUrl)];
                case 2:
                    homepage = _f.sent();
                    if (!homepage) return [3 /*break*/, 6];
                    visited.add(homepage.url);
                    pagesFetched++;
                    processPage(homepage);
                    discoveredLinks = discoverContactLinks(homepage.$, baseUrl);
                    if (!(result.emails.length < MAX_EMAILS)) return [3 /*break*/, 6];
                    _i = 0, discoveredLinks_1 = discoveredLinks;
                    _f.label = 3;
                case 3:
                    if (!(_i < discoveredLinks_1.length)) return [3 /*break*/, 6];
                    link = discoveredLinks_1[_i];
                    if (result.emails.length >= MAX_EMAILS || pagesFetched >= MAX_PAGES)
                        return [3 /*break*/, 6];
                    normalized = link.replace(/\/$/, '');
                    if (visited.has(normalized))
                        return [3 /*break*/, 5];
                    visited.add(normalized);
                    return [4 /*yield*/, fetchWithRetry(normalized, 1)];
                case 4:
                    page = _f.sent();
                    if (page) {
                        pagesFetched++;
                        processPage(page);
                    }
                    _f.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6:
                    if (!(result.emails.length < MAX_EMAILS)) return [3 /*break*/, 10];
                    _a = 0, STATIC_CONTACT_PATHS_1 = STATIC_CONTACT_PATHS;
                    _f.label = 7;
                case 7:
                    if (!(_a < STATIC_CONTACT_PATHS_1.length)) return [3 /*break*/, 10];
                    path = STATIC_CONTACT_PATHS_1[_a];
                    if (result.emails.length >= MAX_EMAILS || pagesFetched >= MAX_PAGES)
                        return [3 /*break*/, 10];
                    url = baseUrl + path;
                    normalized = url.replace(/\/$/, '');
                    if (visited.has(normalized))
                        return [3 /*break*/, 9];
                    visited.add(normalized);
                    return [4 /*yield*/, fetchWithRetry(normalized, 1)];
                case 8:
                    page = _f.sent();
                    if (page) {
                        pagesFetched++;
                        processPage(page);
                    }
                    _f.label = 9;
                case 9:
                    _a++;
                    return [3 /*break*/, 7];
                case 10:
                    if (!(result.emails.length < MAX_EMAILS)) return [3 /*break*/, 15];
                    return [4 /*yield*/, extractUrlsFromSitemap(baseUrl)];
                case 11:
                    sitemapUrls = _f.sent();
                    contactishUrls = sitemapUrls
                        .filter(function (u) { return /contact|about|team|staff|people|founder|owner/i.test(u); })
                        .slice(0, 5);
                    _b = 0, contactishUrls_1 = contactishUrls;
                    _f.label = 12;
                case 12:
                    if (!(_b < contactishUrls_1.length)) return [3 /*break*/, 15];
                    url = contactishUrls_1[_b];
                    if (result.emails.length >= MAX_EMAILS || pagesFetched >= MAX_PAGES)
                        return [3 /*break*/, 15];
                    normalized = url.replace(/\/$/, '');
                    if (visited.has(normalized))
                        return [3 /*break*/, 14];
                    visited.add(normalized);
                    return [4 /*yield*/, fetchWithRetry(normalized, 1)];
                case 13:
                    page = _f.sent();
                    if (page) {
                        pagesFetched++;
                        processPage(page);
                    }
                    _f.label = 14;
                case 14:
                    _b++;
                    return [3 /*break*/, 12];
                case 15:
                    if (!(result.emails.length === 0 && pagesFetched > 0)) return [3 /*break*/, 19];
                    puppeteerTargets = [baseUrl, baseUrl + '/contact', baseUrl + '/about'];
                    for (_c = 0, _d = discoveredLinks.slice(0, 3); _c < _d.length; _c++) {
                        link = _d[_c];
                        if (!puppeteerTargets.includes(link))
                            puppeteerTargets.push(link);
                    }
                    _e = 0, puppeteerTargets_1 = puppeteerTargets;
                    _f.label = 16;
                case 16:
                    if (!(_e < puppeteerTargets_1.length)) return [3 /*break*/, 19];
                    target = puppeteerTargets_1[_e];
                    if (result.emails.length >= MAX_EMAILS)
                        return [3 /*break*/, 19];
                    return [4 /*yield*/, (0, puppeteer_fetcher_js_1.fetchWithPuppeteer)(target)];
                case 17:
                    puppeteerPage = _f.sent();
                    if (puppeteerPage) {
                        $ = cheerio.load(puppeteerPage.html);
                        $('script, style, noscript, svg').remove();
                        processPage({
                            html: puppeteerPage.html,
                            text: puppeteerPage.text,
                            url: puppeteerPage.url,
                            $: $,
                        });
                    }
                    _f.label = 18;
                case 18:
                    _e++;
                    return [3 /*break*/, 16];
                case 19:
                    result.specialties = extractSpecialties(allText.join(' '));
                    return [2 /*return*/, result];
            }
        });
    });
}
// ─── enrichAndSaveLead (unchanged logic) ─────────────────────────────
function enrichAndSaveLead(leadId) {
    return __awaiter(this, void 0, void 0, function () {
        var lead, enrichment, sortedEmails, addedEmails, _i, sortedEmails_1, _a, email, role;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    lead = (0, index_js_1.getLeadById)(leadId);
                    if (!lead)
                        throw new Error("Lead not found: ".concat(leadId));
                    return [4 /*yield*/, enrichLead(lead)];
                case 1:
                    enrichment = _b.sent();
                    sortedEmails = enrichment.emails
                        .map(function (e) { return (__assign(__assign({}, e), { score: scoreEmailForOutreach(e.email, e.role) })); })
                        .sort(function (a, b) { return b.score - a.score; });
                    addedEmails = [];
                    for (_i = 0, sortedEmails_1 = sortedEmails; _i < sortedEmails_1.length; _i++) {
                        _a = sortedEmails_1[_i], email = _a.email, role = _a.role;
                        if (!(0, index_js_1.emailExistsForLead)(leadId, email)) {
                            (0, index_js_1.insertLeadEmail)({
                                lead_id: leadId,
                                email: email,
                                contact_name: null,
                                role: role,
                                verification_status: 'unverified',
                                source: 'scraped',
                                is_primary: addedEmails.length === 0 ? 1 : 0,
                            });
                            addedEmails.push(email);
                        }
                    }
                    (0, index_js_1.insertOrUpdateEnrichment)({
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
                        emails_found_count: addedEmails.length,
                    });
                    return [2 /*return*/, {
                            emailsFound: addedEmails.length,
                            emails: addedEmails,
                            enrichmentSaved: true,
                        }];
            }
        });
    });
}
