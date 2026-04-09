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
exports.generateComplianceFooter = generateComplianceFooter;
exports.sendEmail = sendEmail;
exports.testSESConnection = testSESConnection;
exports.isSESConfigured = isSESConfigured;
var client_ses_1 = require("@aws-sdk/client-ses");
var index_js_1 = require("../db/index.js");
// Load from environment
var AWS_REGION = process.env.AWS_REGION || 'us-east-1';
var AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
var AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
var SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || 'hello@mail.schedutor.com';
var SES_FROM_NAME = process.env.SES_FROM_NAME || 'Schedutor';
var COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || '123 Main St, Suite 100, San Francisco, CA 94102';
var UNSUBSCRIBE_URL = process.env.UNSUBSCRIBE_URL || 'https://schedutor.com/unsubscribe';
// Initialize SES client
var sesClient = null;
function getSESClient() {
    if (!sesClient) {
        if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
            throw new Error('AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env');
        }
        sesClient = new client_ses_1.SESClient({
            region: AWS_REGION,
            credentials: {
                accessKeyId: AWS_ACCESS_KEY_ID,
                secretAccessKey: AWS_SECRET_ACCESS_KEY
            }
        });
    }
    return sesClient;
}
/**
 * Generate CAN-SPAM compliant footer
 */
function generateComplianceFooter(unsubscribeToken) {
    var unsubscribeLink = unsubscribeToken
        ? "".concat(UNSUBSCRIBE_URL, "?token=").concat(unsubscribeToken)
        : UNSUBSCRIBE_URL;
    var html = "\n    <div style=\"margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;\">\n      <p>".concat(SES_FROM_NAME, "<br>").concat(COMPANY_ADDRESS, "</p>\n      <p>\n        <a href=\"").concat(unsubscribeLink, "\" style=\"color: #666;\">Unsubscribe</a> |\n        You're receiving this because your business was listed as a tutoring service.\n      </p>\n    </div>\n  ");
    var text = "\n---\n".concat(SES_FROM_NAME, "\n").concat(COMPANY_ADDRESS, "\n\nUnsubscribe: ").concat(unsubscribeLink, "\nYou're receiving this because your business was listed as a tutoring service.\n  ").trim();
    return { html: html, text: text };
}
/**
 * Send an email via Amazon SES
 */
function sendEmail(options) {
    return __awaiter(this, void 0, void 0, function () {
        var pauseCheck, client, footer, fullHtmlBody, fullTextBody, params, command, response, messageId, sendLog, error_1, errorMessage, sendLog;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    pauseCheck = (0, index_js_1.shouldPauseSending)();
                    if (pauseCheck.pause) {
                        return [2 /*return*/, {
                                success: false,
                                error: "Sending paused: ".concat(pauseCheck.reason)
                            }];
                    }
                    client = getSESClient();
                    footer = generateComplianceFooter();
                    fullHtmlBody = options.htmlBody + footer.html;
                    fullTextBody = (options.textBody || stripHtml(options.htmlBody)) + '\n\n' + footer.text;
                    params = {
                        Source: "".concat(SES_FROM_NAME, " <").concat(SES_FROM_EMAIL, ">"),
                        Destination: {
                            ToAddresses: [options.to]
                        },
                        Message: {
                            Subject: {
                                Data: options.subject,
                                Charset: 'UTF-8'
                            },
                            Body: {
                                Html: {
                                    Data: fullHtmlBody,
                                    Charset: 'UTF-8'
                                },
                                Text: {
                                    Data: fullTextBody,
                                    Charset: 'UTF-8'
                                }
                            }
                        },
                        ReplyToAddresses: options.replyTo ? [options.replyTo] : [SES_FROM_EMAIL]
                    };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    command = new client_ses_1.SendEmailCommand(params);
                    return [4 /*yield*/, client.send(command)];
                case 2:
                    response = _a.sent();
                    messageId = response.MessageId;
                    sendLog = (0, index_js_1.logSend)({
                        lead_id: options.leadId,
                        email_id: options.emailId,
                        sequence_id: options.sequenceId || null,
                        step_number: options.stepNumber || null,
                        ses_message_id: messageId || null,
                        status: 'sent',
                        sent_at: new Date().toISOString()
                    });
                    return [2 /*return*/, {
                            success: true,
                            messageId: messageId,
                            sendLogId: sendLog.id
                        }];
                case 3:
                    error_1 = _a.sent();
                    errorMessage = error_1 instanceof Error ? error_1.message : 'Unknown error';
                    sendLog = (0, index_js_1.logSend)({
                        lead_id: options.leadId,
                        email_id: options.emailId,
                        sequence_id: options.sequenceId || null,
                        step_number: options.stepNumber || null,
                        ses_message_id: null,
                        status: 'bounced', // Mark as bounced for failed sends
                        sent_at: new Date().toISOString()
                    });
                    return [2 /*return*/, {
                            success: false,
                            sendLogId: sendLog.id,
                            error: errorMessage
                        }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Strip HTML tags for plain text version
 */
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
/**
 * Test SES connection by sending a test email
 */
function testSESConnection(testEmail) {
    return __awaiter(this, void 0, void 0, function () {
        var client, params, command, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    client = getSESClient();
                    params = {
                        Source: "".concat(SES_FROM_NAME, " <").concat(SES_FROM_EMAIL, ">"),
                        Destination: {
                            ToAddresses: [testEmail]
                        },
                        Message: {
                            Subject: {
                                Data: 'Schedutor SES Test',
                                Charset: 'UTF-8'
                            },
                            Body: {
                                Text: {
                                    Data: 'This is a test email from Schedutor to verify SES configuration is working.',
                                    Charset: 'UTF-8'
                                }
                            }
                        }
                    };
                    command = new client_ses_1.SendEmailCommand(params);
                    return [4 /*yield*/, client.send(command)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 2:
                    error_2 = _a.sent();
                    return [2 /*return*/, {
                            success: false,
                            error: error_2 instanceof Error ? error_2.message : 'Unknown error'
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Check if SES is configured
 */
function isSESConfigured() {
    return !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY && SES_FROM_EMAIL);
}
