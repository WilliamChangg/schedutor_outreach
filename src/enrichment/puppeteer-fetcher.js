"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeBrowser = closeBrowser;
exports.fetchWithPuppeteer = fetchWithPuppeteer;
var puppeteer_extra_1 = require("puppeteer-extra");
var puppeteer_extra_plugin_stealth_1 = require("puppeteer-extra-plugin-stealth");
var rate_limiter_js_1 = require("../utils/rate-limiter.js");
// Register stealth plugin — patches navigator.webdriver, plugins length,
// languages, Chrome runtime, etc. to defeat headless detection.
puppeteer_extra_1.default.use((0, puppeteer_extra_plugin_stealth_1.default)());
var browserInstance = null;
function getBrowser() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!!browserInstance) return [3 /*break*/, 2];
                    return [4 /*yield*/, puppeteer_extra_1.default.launch({
                            headless: true,
                            args: [
                                '--no-sandbox',
                                '--disable-setuid-sandbox',
                                '--disable-dev-shm-usage',
                                '--disable-gpu',
                                '--single-process',
                                '--disable-extensions',
                                '--disable-blink-features=AutomationControlled', // defeats navigator.webdriver
                            ],
                        })];
                case 1:
                    browserInstance = _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/, browserInstance];
            }
        });
    });
}
function closeBrowser() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!browserInstance) return [3 /*break*/, 2];
                    return [4 /*yield*/, browserInstance.close()];
                case 1:
                    _a.sent();
                    browserInstance = null;
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    });
}
function fetchWithPuppeteer(url_1) {
    return __awaiter(this, arguments, void 0, function (url, timeout) {
        var browser, page, html, text, _a;
        if (timeout === void 0) { timeout = 30000; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, rate_limiter_js_1.scrapingRateLimiter.waitForSlot()];
                case 1:
                    _b.sent();
                    return [4 /*yield*/, getBrowser()];
                case 2:
                    browser = _b.sent();
                    page = null;
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 12, 13, 16]);
                    return [4 /*yield*/, browser.newPage()];
                case 4:
                    page = _b.sent();
                    return [4 /*yield*/, page.setViewport({ width: 1280, height: 800 })];
                case 5:
                    _b.sent();
                    // Patch navigator properties that betray headless Chrome even with stealth plugin
                    return [4 /*yield*/, page.evaluateOnNewDocument(function () {
                            Object.defineProperty(navigator, 'webdriver', { get: function () { return false; } });
                            Object.defineProperty(navigator, 'languages', { get: function () { return ['en-US', 'en']; } });
                            // Make plugins non-empty so it looks like a real browser
                            Object.defineProperty(navigator, 'plugins', { get: function () { return [1, 2, 3]; } });
                        })];
                case 6:
                    // Patch navigator properties that betray headless Chrome even with stealth plugin
                    _b.sent();
                    // Block unnecessary resources for faster loading
                    return [4 /*yield*/, page.setRequestInterception(true)];
                case 7:
                    // Block unnecessary resources for faster loading
                    _b.sent();
                    page.on('request', function (req) {
                        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                            req.abort();
                        }
                        else {
                            req.continue();
                        }
                    });
                    // Use domcontentloaded instead of networkidle2:
                    // networkidle2 waits for ≤2 in-flight requests for 500ms, which chat widgets
                    // and analytics beacons prevent — causing the full timeout to elapse every time.
                    return [4 /*yield*/, page.goto(url, {
                            waitUntil: 'domcontentloaded',
                            timeout: timeout,
                        })];
                case 8:
                    // Use domcontentloaded instead of networkidle2:
                    // networkidle2 waits for ≤2 in-flight requests for 500ms, which chat widgets
                    // and analytics beacons prevent — causing the full timeout to elapse every time.
                    _b.sent();
                    // Give lazy-loaded content a moment to render after initial DOM parse
                    return [4 /*yield*/, Promise.race([
                            page.waitForSelector('body', { timeout: 5000 }),
                            new Promise(function (resolve) { return setTimeout(resolve, 3000); }),
                        ])];
                case 9:
                    // Give lazy-loaded content a moment to render after initial DOM parse
                    _b.sent();
                    return [4 /*yield*/, page.content()];
                case 10:
                    html = _b.sent();
                    return [4 /*yield*/, page.evaluate(function () { var _a; return ((_a = document.body) === null || _a === void 0 ? void 0 : _a.innerText) || ''; })];
                case 11:
                    text = _b.sent();
                    return [2 /*return*/, { html: html, text: text, url: url }];
                case 12:
                    _a = _b.sent();
                    return [2 /*return*/, null];
                case 13:
                    if (!page) return [3 /*break*/, 15];
                    return [4 /*yield*/, page.close()];
                case 14:
                    _b.sent();
                    _b.label = 15;
                case 15: return [7 /*endfinally*/];
                case 16: return [2 /*return*/];
            }
        });
    });
}
