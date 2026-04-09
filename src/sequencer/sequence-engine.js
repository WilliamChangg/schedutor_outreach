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
exports.processSendQueue = processSendQueue;
exports.sendTestSequenceEmail = sendTestSequenceEmail;
exports.sendTestSequenceAllSteps = sendTestSequenceAllSteps;
exports.enrollLeadsInSequence = enrollLeadsInSequence;
exports.getSequenceEngineStatus = getSequenceEngineStatus;
exports.previewSequenceEmail = previewSequenceEmail;
var index_js_1 = require("../db/index.js");
var resend_sender_js_1 = require("./resend-sender.js");
var template_engine_js_1 = require("./template-engine.js");
var sending_config_js_1 = require("./sending-config.js");
// ── Process send queue ──────────────────────────────────────────────────────
function processSendQueue() {
    return __awaiter(this, arguments, void 0, function (limit, onProgress) {
        var result, cfg, pauseCheck, dailyLimit, sentToday, remainingToday, effectiveLimit, dueEnrollments, _loop_1, _i, dueEnrollments_1, enrollment, state_1;
        var _a, _b;
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    result = {
                        processed: 0,
                        sent: 0,
                        failed: 0,
                        skipped: 0,
                        dailyLimitReached: false,
                        errors: [],
                    };
                    // ── Gate checks ──────────────────────────────────────────────────────────
                    if (!(0, resend_sender_js_1.isResendConfigured)()) {
                        result.errors.push('Resend not configured – set RESEND_API_KEY in .env');
                        return [2 /*return*/, result];
                    }
                    if (!(0, sending_config_js_1.isWithinSendingWindow)()) {
                        cfg = (0, sending_config_js_1.getSendingConfig)();
                        result.errors.push("Outside sending window (".concat(cfg.sendingWindowStartHour, ":00\u2013").concat(cfg.sendingWindowEndHour, ":00 ").concat(cfg.timezone, ")"));
                        return [2 /*return*/, result];
                    }
                    pauseCheck = (0, index_js_1.shouldPauseSending)();
                    if (pauseCheck.pause) {
                        result.errors.push("Sending paused: ".concat(pauseCheck.reason));
                        return [2 /*return*/, result];
                    }
                    dailyLimit = (0, sending_config_js_1.getEffectiveDailyLimit)();
                    sentToday = (0, index_js_1.getTodaySendCount)();
                    remainingToday = Math.max(0, dailyLimit - sentToday);
                    if (remainingToday === 0) {
                        result.dailyLimitReached = true;
                        result.errors.push("Daily limit reached (".concat(dailyLimit, "/day). Sent today: ").concat(sentToday));
                        return [2 /*return*/, result];
                    }
                    effectiveLimit = Math.min(limit, remainingToday);
                    dueEnrollments = (0, index_js_1.getEnrollmentsDueForSend)(effectiveLimit);
                    _loop_1 = function (enrollment) {
                        var lead, email, sequence, steps, nextStepNumber_1, step, _d, subject, body, sendResult, delay, error_1;
                        return __generator(this, function (_e) {
                            switch (_e.label) {
                                case 0:
                                    // Re-check daily budget each iteration (other processes could be sending)
                                    if (result.sent + sentToday >= dailyLimit) {
                                        result.dailyLimitReached = true;
                                        result.errors.push('Daily limit reached mid-batch');
                                        return [2 /*return*/, "break"];
                                    }
                                    // Stop if we leave the sending window
                                    if (!(0, sending_config_js_1.isWithinSendingWindow)()) {
                                        result.errors.push('Sending window closed mid-batch');
                                        return [2 /*return*/, "break"];
                                    }
                                    result.processed++;
                                    _e.label = 1;
                                case 1:
                                    _e.trys.push([1, 4, , 5]);
                                    lead = (0, index_js_1.getLeadById)(enrollment.lead_id);
                                    email = (0, index_js_1.getLeadEmailById)(enrollment.email_id);
                                    sequence = (0, index_js_1.getSequenceById)(enrollment.sequence_id);
                                    if (!lead || !email || !sequence) {
                                        result.skipped++;
                                        result.errors.push("Missing data for enrollment ".concat(enrollment.id));
                                        return [2 /*return*/, "continue"];
                                    }
                                    steps = (0, index_js_1.getSequenceSteps)(sequence.id);
                                    nextStepNumber_1 = enrollment.current_step + 1;
                                    step = steps.find(function (s) { return s.step_number === nextStepNumber_1; });
                                    if (!step) {
                                        (0, index_js_1.updateEnrollmentStatus)(enrollment.id, 'completed');
                                        result.skipped++;
                                        return [2 /*return*/, "continue"];
                                    }
                                    _d = (0, template_engine_js_1.renderEmail)(step.subject_template, step.body_template, lead, { includePersonalizedOpening: nextStepNumber_1 === 1 }), subject = _d.subject, body = _d.body;
                                    return [4 /*yield*/, (0, resend_sender_js_1.sendEmail)({
                                            to: email.email,
                                            subject: subject,
                                            htmlBody: body,
                                            leadId: lead.id,
                                            emailId: email.id,
                                            sequenceId: sequence.id,
                                            stepNumber: nextStepNumber_1,
                                        })];
                                case 2:
                                    sendResult = _e.sent();
                                    if (sendResult.success) {
                                        result.sent++;
                                        (0, index_js_1.advanceEnrollmentStep)(enrollment.id, nextStepNumber_1 + 1, sequence.total_steps);
                                    }
                                    else {
                                        result.failed++;
                                        result.errors.push("Failed to send to ".concat(email.email, ": ").concat(sendResult.error));
                                        if (((_a = sendResult.error) === null || _a === void 0 ? void 0 : _a.includes('bounce')) || ((_b = sendResult.error) === null || _b === void 0 ? void 0 : _b.includes('invalid'))) {
                                            (0, index_js_1.updateEnrollmentStatus)(enrollment.id, 'bounced');
                                        }
                                    }
                                    delay = (0, sending_config_js_1.getRandomDelay)();
                                    if (onProgress) {
                                        onProgress(result.sent, dueEnrollments.length, lead, delay);
                                    }
                                    return [4 /*yield*/, sleep(delay)];
                                case 3:
                                    _e.sent();
                                    return [3 /*break*/, 5];
                                case 4:
                                    error_1 = _e.sent();
                                    result.failed++;
                                    result.errors.push("Error processing enrollment ".concat(enrollment.id, ": ").concat(error_1 instanceof Error ? error_1.message : 'Unknown'));
                                    return [3 /*break*/, 5];
                                case 5: return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, dueEnrollments_1 = dueEnrollments;
                    _c.label = 1;
                case 1:
                    if (!(_i < dueEnrollments_1.length)) return [3 /*break*/, 4];
                    enrollment = dueEnrollments_1[_i];
                    return [5 /*yield**/, _loop_1(enrollment)];
                case 2:
                    state_1 = _c.sent();
                    if (state_1 === "break")
                        return [3 /*break*/, 4];
                    _c.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, result];
            }
        });
    });
}
// ── Test send ───────────────────────────────────────────────────────────────
/**
 * Send a real test email to an address you own, using an actual
 * sequence template rendered against a real lead.
 *
 * If no sequenceId / stepNumber is provided, the first active
 * sequence's first step is used.
 */
function sendTestSequenceEmail(options) {
    return __awaiter(this, void 0, void 0, function () {
        var to, leadId, sequenceId, _a, stepNumber, lead, seqId, sequence, steps, step, _b, subject, body, testSubject, plainBody, sendResult;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    to = options.to, leadId = options.leadId, sequenceId = options.sequenceId, _a = options.stepNumber, stepNumber = _a === void 0 ? 1 : _a;
                    if (!(0, resend_sender_js_1.isResendConfigured)()) {
                        return [2 /*return*/, { success: false, subject: '', error: 'Resend not configured' }];
                    }
                    lead = (0, index_js_1.getLeadById)(leadId);
                    if (!lead) {
                        return [2 /*return*/, { success: false, subject: '', error: "Lead not found: ".concat(leadId) }];
                    }
                    seqId = sequenceId;
                    if (!seqId) {
                        return [2 /*return*/, { success: false, subject: '', error: 'sequenceId is required' }];
                    }
                    sequence = (0, index_js_1.getSequenceById)(seqId);
                    if (!sequence) {
                        return [2 /*return*/, { success: false, subject: '', error: "Sequence not found: ".concat(seqId) }];
                    }
                    steps = (0, index_js_1.getSequenceSteps)(seqId);
                    step = steps.find(function (s) { return s.step_number === stepNumber; });
                    if (!step) {
                        return [2 /*return*/, {
                                success: false,
                                subject: '',
                                error: "Step ".concat(stepNumber, " not found in sequence ").concat(seqId),
                            }];
                    }
                    _b = (0, template_engine_js_1.renderEmail)(step.subject_template, step.body_template, lead, { includePersonalizedOpening: stepNumber === 1 }), subject = _b.subject, body = _b.body;
                    testSubject = "[TEST] ".concat(subject);
                    plainBody = body
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<\/p>/gi, '\n\n')
                        .replace(/<[^>]*>/g, '')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/\n{3,}/g, '\n\n')
                        .trim();
                    return [4 /*yield*/, (0, resend_sender_js_1.sendRawEmail)({
                            to: to,
                            subject: testSubject,
                            text: plainBody,
                        })];
                case 1:
                    sendResult = _c.sent();
                    return [2 /*return*/, {
                            success: sendResult.success,
                            messageId: sendResult.messageId,
                            subject: testSubject,
                            error: sendResult.error,
                        }];
            }
        });
    });
}
/**
 * Send test emails to multiple addresses (e.g. your own inboxes)
 * for every step in a sequence, so you can review the full flow.
 */
function sendTestSequenceAllSteps(options) {
    return __awaiter(this, void 0, void 0, function () {
        var to, leadId, sequenceId, _a, delayBetweenMs, results, sequence, steps, _i, steps_1, step, _b, to_1, recipient, r;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    to = options.to, leadId = options.leadId, sequenceId = options.sequenceId, _a = options.delayBetweenMs, delayBetweenMs = _a === void 0 ? 2000 : _a;
                    results = [];
                    sequence = (0, index_js_1.getSequenceById)(sequenceId);
                    if (!sequence) {
                        return [2 /*return*/, [{ success: false, subject: '', error: "Sequence not found: ".concat(sequenceId) }]];
                    }
                    steps = (0, index_js_1.getSequenceSteps)(sequenceId).sort(function (a, b) { return a.step_number - b.step_number; });
                    _i = 0, steps_1 = steps;
                    _c.label = 1;
                case 1:
                    if (!(_i < steps_1.length)) return [3 /*break*/, 7];
                    step = steps_1[_i];
                    _b = 0, to_1 = to;
                    _c.label = 2;
                case 2:
                    if (!(_b < to_1.length)) return [3 /*break*/, 6];
                    recipient = to_1[_b];
                    return [4 /*yield*/, sendTestSequenceEmail({
                            to: recipient,
                            leadId: leadId,
                            sequenceId: sequenceId,
                            stepNumber: step.step_number,
                        })];
                case 3:
                    r = _c.sent();
                    results.push(r);
                    return [4 /*yield*/, sleep(delayBetweenMs)];
                case 4:
                    _c.sent();
                    _c.label = 5;
                case 5:
                    _b++;
                    return [3 /*break*/, 2];
                case 6:
                    _i++;
                    return [3 /*break*/, 1];
                case 7: return [2 /*return*/, results];
            }
        });
    });
}
// ── Enrollment ──────────────────────────────────────────────────────────────
function enrollLeadsInSequence(sequenceId, limit, onProgress) {
    if (limit === void 0) { limit = 100; }
    var result = { enrolled: 0, skipped: 0, errors: [] };
    var sequence = (0, index_js_1.getSequenceById)(sequenceId);
    if (!sequence) {
        result.errors.push("Sequence not found: ".concat(sequenceId));
        return result;
    }
    if (sequence.status !== 'active') {
        result.errors.push("Sequence is not active: ".concat(sequence.status));
        return result;
    }
    var eligibleLeads = (0, index_js_1.getLeadsEligibleForEnrollment)(sequenceId, limit);
    for (var _i = 0, eligibleLeads_1 = eligibleLeads; _i < eligibleLeads_1.length; _i++) {
        var lead = eligibleLeads_1[_i];
        try {
            (0, index_js_1.enrollLeadInSequence)(lead.id, sequenceId, lead.email_id);
            result.enrolled++;
            if (onProgress)
                onProgress(result.enrolled, lead);
        }
        catch (error) {
            result.skipped++;
            result.errors.push("Failed to enroll ".concat(lead.business_name, ": ").concat(error instanceof Error ? error.message : 'Unknown'));
        }
    }
    return result;
}
// ── Status ──────────────────────────────────────────────────────────────────
function getSequenceEngineStatus() {
    var pauseCheck = (0, index_js_1.shouldPauseSending)();
    var sendingConfig = (0, sending_config_js_1.getSendingConfig)();
    var dailyLimit = (0, sending_config_js_1.getEffectiveDailyLimit)();
    var sentToday = (0, index_js_1.getTodaySendCount)();
    return {
        resendConfigured: (0, resend_sender_js_1.isResendConfigured)(),
        sendingPaused: pauseCheck.pause,
        pauseReason: pauseCheck.reason,
        withinSendingWindow: (0, sending_config_js_1.isWithinSendingWindow)(),
        dailyLimit: dailyLimit,
        sentToday: sentToday,
        remainingToday: Math.max(0, dailyLimit - sentToday),
        sendingConfig: sendingConfig,
        enrollmentStats: (0, index_js_1.getEnrollmentStats)(),
        sendStats: (0, index_js_1.getSendStats)(),
    };
}
// ── Preview ─────────────────────────────────────────────────────────────────
function previewSequenceEmail(sequenceId, stepNumber, leadId) {
    var sequence = (0, index_js_1.getSequenceById)(sequenceId);
    var lead = (0, index_js_1.getLeadById)(leadId);
    if (!sequence || !lead)
        return null;
    var steps = (0, index_js_1.getSequenceSteps)(sequenceId);
    var step = steps.find(function (s) { return s.step_number === stepNumber; });
    if (!step)
        return null;
    return (0, template_engine_js_1.renderEmail)(step.subject_template, step.body_template, lead, {
        includePersonalizedOpening: stepNumber === 1,
    });
}
// ── Util ────────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
