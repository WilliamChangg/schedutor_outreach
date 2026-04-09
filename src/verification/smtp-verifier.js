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
exports.verifyEmail = verifyEmail;
exports.verifyAndUpdateEmail = verifyAndUpdateEmail;
exports.verifyUnverifiedEmails = verifyUnverifiedEmails;
var dns_1 = require("dns");
var net = require("net");
var rate_limiter_js_1 = require("../utils/rate-limiter.js");
var index_js_1 = require("../db/index.js");
// Disposable email domains to reject
var DISPOSABLE_DOMAINS = new Set([
    'mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com',
    'throwaway.email', 'fakeinbox.com', 'trashmail.com', 'yopmail.com',
    'getnada.com', 'temp-mail.org', 'dispostable.com', 'maildrop.cc'
]);
// Common catch-all indicators
var CATCH_ALL_INDICATORS = [
    'accept all',
    'accepted',
    '250 ok',
    '250 2.1.5'
];
/**
 * Get MX records for a domain
 */
function getMxRecords(domain) {
    return __awaiter(this, void 0, void 0, function () {
        var records, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, dns_1.promises.resolveMx(domain)];
                case 1:
                    records = _a.sent();
                    // Sort by priority (lower is better)
                    return [2 /*return*/, records
                            .sort(function (a, b) { return a.priority - b.priority; })
                            .map(function (r) { return r.exchange; })];
                case 2:
                    error_1 = _a.sent();
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Check if domain is a known disposable email provider
 */
function isDisposableDomain(domain) {
    return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}
/**
 * Connect to SMTP server and verify email with RCPT TO
 */
function smtpVerify(email_1, mxHost_1) {
    return __awaiter(this, arguments, void 0, function (email, mxHost, timeout) {
        if (timeout === void 0) { timeout = 10000; }
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) {
                    var socket = new net.Socket();
                    var response = '';
                    var step = 0;
                    var domain = email.split('@')[1];
                    var cleanup = function () {
                        socket.removeAllListeners();
                        socket.destroy();
                    };
                    var timer = setTimeout(function () {
                        cleanup();
                        resolve({ accepted: false, response: 'timeout', error: 'Connection timeout' });
                    }, timeout);
                    socket.on('error', function (err) {
                        clearTimeout(timer);
                        cleanup();
                        resolve({ accepted: false, response: '', error: err.message });
                    });
                    socket.on('data', function (data) {
                        var line = data.toString();
                        response += line;
                        // Check for SMTP response codes
                        var code = parseInt(line.substring(0, 3), 10);
                        if (step === 0 && code === 220) {
                            // Server ready, send EHLO
                            step = 1;
                            socket.write("EHLO verify.schedutor.com\r\n");
                        }
                        else if (step === 1 && code === 250) {
                            // EHLO accepted, send MAIL FROM
                            step = 2;
                            socket.write("MAIL FROM:<verify@schedutor.com>\r\n");
                        }
                        else if (step === 2 && code === 250) {
                            // MAIL FROM accepted, send RCPT TO
                            step = 3;
                            socket.write("RCPT TO:<".concat(email, ">\r\n"));
                        }
                        else if (step === 3) {
                            // RCPT TO response - this determines if email is valid
                            clearTimeout(timer);
                            socket.write('QUIT\r\n');
                            cleanup();
                            if (code === 250 || code === 251) {
                                resolve({ accepted: true, response: line.trim() });
                            }
                            else if (code === 550 || code === 551 || code === 552 || code === 553) {
                                // User not found / rejected
                                resolve({ accepted: false, response: line.trim() });
                            }
                            else if (code === 450 || code === 451 || code === 452) {
                                // Temporary failure - treat as unknown
                                resolve({ accepted: false, response: line.trim(), error: 'Temporary failure' });
                            }
                            else {
                                resolve({ accepted: false, response: line.trim() });
                            }
                        }
                        else if (code >= 400) {
                            // Error response
                            clearTimeout(timer);
                            cleanup();
                            resolve({ accepted: false, response: line.trim(), error: "SMTP error: ".concat(code) });
                        }
                    });
                    socket.on('close', function () {
                        clearTimeout(timer);
                    });
                    // Connect to MX server on port 25
                    socket.connect(25, mxHost);
                })];
        });
    });
}
/**
 * Check if domain is a catch-all (accepts any email)
 */
function checkCatchAll(domain, mxHost) {
    return __awaiter(this, void 0, void 0, function () {
        var randomEmail, result, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    randomEmail = "nonexistent_".concat(Date.now(), "_").concat(Math.random().toString(36).substring(7), "@").concat(domain);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, smtpVerify(randomEmail, mxHost, 8000)];
                case 2:
                    result = _b.sent();
                    return [2 /*return*/, result.accepted];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Verify a single email address
 */
function verifyEmail(email) {
    return __awaiter(this, void 0, void 0, function () {
        var result, domain, mxRecords, primaryMx, smtpResult, isCatchAll, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    result = {
                        email: email,
                        status: 'unknown',
                        mxRecords: [],
                        isCatchAll: false,
                        isDisposable: false
                    };
                    // Basic format validation
                    if (!email || !email.includes('@')) {
                        result.status = 'invalid';
                        result.error = 'Invalid email format';
                        return [2 /*return*/, result];
                    }
                    domain = email.split('@')[1].toLowerCase();
                    // Check for disposable domains
                    if (isDisposableDomain(domain)) {
                        result.status = 'invalid';
                        result.isDisposable = true;
                        result.error = 'Disposable email domain';
                        return [2 /*return*/, result];
                    }
                    // Get MX records
                    return [4 /*yield*/, rate_limiter_js_1.smtpRateLimiter.waitForSlot()];
                case 1:
                    // Get MX records
                    _a.sent();
                    return [4 /*yield*/, getMxRecords(domain)];
                case 2:
                    mxRecords = _a.sent();
                    result.mxRecords = mxRecords;
                    if (mxRecords.length === 0) {
                        result.status = 'invalid';
                        result.error = 'No MX records found';
                        return [2 /*return*/, result];
                    }
                    primaryMx = mxRecords[0];
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 10, , 11]);
                    return [4 /*yield*/, rate_limiter_js_1.smtpRateLimiter.waitForSlot()];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, smtpVerify(email, primaryMx)];
                case 5:
                    smtpResult = _a.sent();
                    result.smtpResponse = smtpResult.response;
                    if (smtpResult.error && smtpResult.error.includes('timeout')) {
                        result.status = 'unknown';
                        result.error = 'SMTP timeout';
                        return [2 /*return*/, result];
                    }
                    if (!smtpResult.accepted) return [3 /*break*/, 8];
                    // Check if it's a catch-all domain
                    return [4 /*yield*/, rate_limiter_js_1.smtpRateLimiter.waitForSlot()];
                case 6:
                    // Check if it's a catch-all domain
                    _a.sent();
                    return [4 /*yield*/, checkCatchAll(domain, primaryMx)];
                case 7:
                    isCatchAll = _a.sent();
                    result.isCatchAll = isCatchAll;
                    if (isCatchAll) {
                        result.status = 'catch_all';
                    }
                    else {
                        result.status = 'valid';
                    }
                    return [3 /*break*/, 9];
                case 8:
                    if (smtpResult.error) {
                        result.status = 'unknown';
                        result.error = smtpResult.error;
                    }
                    else {
                        result.status = 'invalid';
                    }
                    _a.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    error_2 = _a.sent();
                    result.status = 'unknown';
                    result.error = error_2 instanceof Error ? error_2.message : 'Unknown error';
                    return [3 /*break*/, 11];
                case 11: return [2 /*return*/, result];
            }
        });
    });
}
/**
 * Verify an email and update the database
 */
function verifyAndUpdateEmail(emailId, email) {
    return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, verifyEmail(email)];
                case 1:
                    result = _a.sent();
                    (0, index_js_1.updateEmailVerificationStatus)(emailId, result.status);
                    return [2 /*return*/, result];
            }
        });
    });
}
/**
 * Batch verify all unverified emails
 */
function verifyUnverifiedEmails() {
    return __awaiter(this, arguments, void 0, function (limit, onProgress) {
        var emails, stats, i, emailRecord, result;
        if (limit === void 0) { limit = 100; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    emails = (0, index_js_1.getUnverifiedEmails)(limit);
                    stats = { total: emails.length, valid: 0, invalid: 0, catchAll: 0, unknown: 0 };
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < emails.length)) return [3 /*break*/, 4];
                    emailRecord = emails[i];
                    return [4 /*yield*/, verifyAndUpdateEmail(emailRecord.id, emailRecord.email)];
                case 2:
                    result = _a.sent();
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
                    _a.label = 3;
                case 3:
                    i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, stats];
            }
        });
    });
}
