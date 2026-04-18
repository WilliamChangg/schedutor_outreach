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
exports.renderOutreachEmail = renderOutreachEmail;
exports.processOutreachQueue = processOutreachQueue;
exports.getOutreachEligibleCount = getOutreachEligibleCount;
var index_js_1 = require("../db/index.js");
var resend_sender_js_1 = require("../sequencer/resend-sender.js");
var sending_config_js_1 = require("../sequencer/sending-config.js");
var template_js_1 = require("./template.js");
/**
 * Render the fixed outreach template with lead data.
 */
function renderOutreachEmail(lead) {
    var teamName = lead.business_name;
    return {
        subject: template_js_1.OUTREACH_SUBJECT.replace('{{business_name}}', teamName),
        body: template_js_1.OUTREACH_BODY.replace(/\{\{business_name\}\}/g, teamName),
    };
}
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
/**
 * Process the outreach send queue.
 * Sends the single outreach email to eligible leads.
 */
function processOutreachQueue() {
    return __awaiter(this, arguments, void 0, function (limit, onProgress) {
        var result, pauseCheck, dailyLimit, sentToday, remainingToday, effectiveLimit, eligibleLeads, _i, eligibleLeads_1, leadData, lead, email, _a, subject, body, sendResult, delay;
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    result = {
                        processed: 0,
                        sent: 0,
                        failed: 0,
                        skipped: 0,
                        dailyLimitReached: false,
                        errors: [],
                    };
                    // Gate checks
                    if (!(0, resend_sender_js_1.isResendConfigured)()) {
                        result.errors.push('Resend not configured');
                        return [2 /*return*/, result];
                    }
                    if (!(0, sending_config_js_1.isWithinSendingWindow)()) {
                        result.errors.push('Outside sending window');
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
                        result.errors.push("Daily limit reached (".concat(dailyLimit, "/day)"));
                        return [2 /*return*/, result];
                    }
                    effectiveLimit = Math.min(limit, remainingToday);
                    eligibleLeads = (0, index_js_1.getLeadsEligibleForOutreach)(effectiveLimit);
                    _i = 0, eligibleLeads_1 = eligibleLeads;
                    _b.label = 1;
                case 1:
                    if (!(_i < eligibleLeads_1.length)) return [3 /*break*/, 6];
                    leadData = eligibleLeads_1[_i];
                    // Re-check limits each iteration
                    if (result.sent + sentToday >= dailyLimit) {
                        result.dailyLimitReached = true;
                        return [3 /*break*/, 6];
                    }
                    if (!(0, sending_config_js_1.isWithinSendingWindow)()) {
                        result.errors.push('Sending window closed');
                        return [3 /*break*/, 6];
                    }
                    result.processed++;
                    lead = (0, index_js_1.getLeadById)(leadData.id);
                    email = (0, index_js_1.getLeadEmailById)(leadData.email_id);
                    if (!lead || !email) {
                        result.skipped++;
                        return [3 /*break*/, 5];
                    }
                    // Double-check hasn't received outreach
                    if ((0, index_js_1.hasReceivedOutreach)(lead.id)) {
                        result.skipped++;
                        return [3 /*break*/, 5];
                    }
                    _a = renderOutreachEmail(lead), subject = _a.subject, body = _a.body;
                    return [4 /*yield*/, (0, resend_sender_js_1.sendEmail)({
                            to: email.email,
                            subject: subject,
                            htmlBody: body,
                            leadId: lead.id,
                            emailId: email.id,
                            sequenceId: undefined, // NULL marks as single outreach
                            stepNumber: undefined,
                        })];
                case 2:
                    sendResult = _b.sent();
                    if (sendResult.success) {
                        result.sent++;
                    }
                    else {
                        result.failed++;
                        result.errors.push("Failed: ".concat(email.email, " - ").concat(sendResult.error));
                    }
                    if (!(result.processed < eligibleLeads.length)) return [3 /*break*/, 4];
                    delay = (0, sending_config_js_1.getRandomDelay)();
                    if (onProgress) {
                        onProgress(result.sent, eligibleLeads.length, lead, delay);
                    }
                    return [4 /*yield*/, sleep(delay)];
                case 3:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 4:
                    if (onProgress) {
                        onProgress(result.sent, eligibleLeads.length, lead, 0);
                    }
                    _b.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, result];
            }
        });
    });
}
/**
 * Get count of leads eligible for outreach.
 */
function getOutreachEligibleCount() {
    return (0, index_js_1.getLeadsEligibleForOutreach)(10000).length;
}
