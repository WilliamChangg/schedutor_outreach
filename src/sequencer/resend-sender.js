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
exports.sendEmail = sendEmail;
exports.sendRawEmail = sendRawEmail;
exports.testResendConnection = testResendConnection;
exports.isResendConfigured = isResendConfigured;
var resend_1 = require("resend");
var index_js_1 = require("../db/index.js");
// ── Environment ─────────────────────────────────────────────────────────────
var RESEND_API_KEY = process.env.RESEND_API_KEY;
var FROM_EMAIL = process.env.FROM_EMAIL || 'william@schedutor.com';
var FROM_NAME = process.env.FROM_NAME || 'William';
// ── Client ──────────────────────────────────────────────────────────────────
var resendClient = null;
function getResendClient() {
    if (!resendClient) {
        if (!RESEND_API_KEY) {
            throw new Error('Resend API key not configured. Set RESEND_API_KEY in .env');
        }
        resendClient = new resend_1.Resend(RESEND_API_KEY);
    }
    return resendClient;
}
// ── Strip HTML to plain text ────────────────────────────────────────────────
function stripHtml(html) {
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
function sendEmail(options) {
    return __awaiter(this, void 0, void 0, function () {
        var pauseCheck, client, plainBody, _a, data, error, sendLog_1, messageId, sendLog, error_1, errorMessage, sendLog;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    pauseCheck = (0, index_js_1.shouldPauseSending)();
                    if (pauseCheck.pause) {
                        return [2 /*return*/, { success: false, error: "Sending paused: ".concat(pauseCheck.reason) }];
                    }
                    client = getResendClient();
                    plainBody = options.textBody || stripHtml(options.htmlBody);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, client.emails.send({
                            from: "".concat(FROM_NAME, " <").concat(FROM_EMAIL, ">"),
                            to: [options.to],
                            subject: options.subject,
                            text: plainBody,
                            replyTo: options.replyTo || FROM_EMAIL,
                        })];
                case 2:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error) {
                        sendLog_1 = (0, index_js_1.logSend)({
                            lead_id: options.leadId,
                            email_id: options.emailId,
                            sequence_id: options.sequenceId || null,
                            step_number: options.stepNumber || null,
                            ses_message_id: null,
                            status: 'bounced',
                            sent_at: new Date().toISOString(),
                        });
                        return [2 /*return*/, { success: false, sendLogId: sendLog_1.id, error: error.message }];
                    }
                    messageId = data === null || data === void 0 ? void 0 : data.id;
                    sendLog = (0, index_js_1.logSend)({
                        lead_id: options.leadId,
                        email_id: options.emailId,
                        sequence_id: options.sequenceId || null,
                        step_number: options.stepNumber || null,
                        ses_message_id: messageId || null,
                        status: 'sent',
                        sent_at: new Date().toISOString(),
                    });
                    return [2 /*return*/, { success: true, messageId: messageId !== null && messageId !== void 0 ? messageId : undefined, sendLogId: sendLog.id }];
                case 3:
                    error_1 = _b.sent();
                    errorMessage = error_1 instanceof Error ? error_1.message : 'Unknown error';
                    sendLog = (0, index_js_1.logSend)({
                        lead_id: options.leadId,
                        email_id: options.emailId,
                        sequence_id: options.sequenceId || null,
                        step_number: options.stepNumber || null,
                        ses_message_id: null,
                        status: 'bounced',
                        sent_at: new Date().toISOString(),
                    });
                    return [2 /*return*/, { success: false, sendLogId: sendLog.id, error: errorMessage }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ── Raw send (no logging, no pause check – used for test emails) ────────────
function sendRawEmail(options) {
    return __awaiter(this, void 0, void 0, function () {
        var client, _a, data, error, err_1;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    client = getResendClient();
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, client.emails.send({
                            from: "".concat(FROM_NAME, " <").concat(FROM_EMAIL, ">"),
                            to: [options.to],
                            subject: options.subject,
                            text: options.text,
                            replyTo: options.replyTo || FROM_EMAIL,
                        })];
                case 2:
                    _a = _c.sent(), data = _a.data, error = _a.error;
                    if (error)
                        return [2 /*return*/, { success: false, error: error.message }];
                    return [2 /*return*/, { success: true, messageId: (_b = data === null || data === void 0 ? void 0 : data.id) !== null && _b !== void 0 ? _b : undefined }];
                case 3:
                    err_1 = _c.sent();
                    return [2 /*return*/, { success: false, error: err_1 instanceof Error ? err_1.message : 'Unknown error' }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ── Test connection (sends real rendered email) ─────────────────────────────
function testResendConnection(testEmail) {
    return __awaiter(this, void 0, void 0, function () {
        var client, _a, getAllSequences, getSequenceSteps, getAllLeads, renderEmail, sequences, leads, steps, lead, rendered, plainBody, error, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 4, , 5]);
                    client = getResendClient();
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('../db/index.js'); })];
                case 1:
                    _a = _b.sent(), getAllSequences = _a.getAllSequences, getSequenceSteps = _a.getSequenceSteps, getAllLeads = _a.getAllLeads;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require('./template-engine.js'); })];
                case 2:
                    renderEmail = (_b.sent()).renderEmail;
                    sequences = getAllSequences();
                    leads = getAllLeads(10);
                    if (sequences.length === 0 || leads.length === 0) {
                        return [2 /*return*/, {
                                success: false,
                                error: 'No sequences or leads found. Import a sequence and discover some leads first.',
                            }];
                    }
                    steps = getSequenceSteps(sequences[0].id);
                    if (steps.length === 0) {
                        return [2 /*return*/, { success: false, error: 'Sequence has no steps.' }];
                    }
                    lead = leads[Math.floor(Math.random() * leads.length)];
                    rendered = renderEmail(steps[0].subject_template, steps[0].body_template, lead, { includePersonalizedOpening: true });
                    plainBody = stripHtml(rendered.body);
                    return [4 /*yield*/, client.emails.send({
                            from: "".concat(FROM_NAME, " <").concat(FROM_EMAIL, ">"),
                            to: [testEmail],
                            subject: "[TEST] ".concat(rendered.subject),
                            text: plainBody,
                            replyTo: FROM_EMAIL,
                        })];
                case 3:
                    error = (_b.sent()).error;
                    if (error)
                        return [2 /*return*/, { success: false, error: error.message }];
                    return [2 /*return*/, { success: true }];
                case 4:
                    error_2 = _b.sent();
                    return [2 /*return*/, {
                            success: false,
                            error: error_2 instanceof Error ? error_2.message : 'Unknown error',
                        }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ── Config check ────────────────────────────────────────────────────────────
function isResendConfigured() {
    return !!(RESEND_API_KEY && FROM_EMAIL);
}
