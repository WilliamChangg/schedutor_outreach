#!/usr/bin/env node
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
// Global error handlers to prevent crashes from socket errors
process.on('uncaughtException', function (err) {
    var _a;
    if (((_a = err.message) === null || _a === void 0 ? void 0 : _a.includes('other side closed')) || err.code === 'UND_ERR_SOCKET') {
        // Silently ignore - these are expected for blocked sites
    }
    else {
        console.error('Uncaught exception:', err);
        process.exit(1);
    }
});
process.on('unhandledRejection', function (reason) {
    var _a;
    var err = reason;
    if (((_a = err === null || err === void 0 ? void 0 : err.message) === null || _a === void 0 ? void 0 : _a.includes('other side closed')) || (err === null || err === void 0 ? void 0 : err.code) === 'UND_ERR_SOCKET') {
        // Silently ignore - these are expected for blocked sites
    }
    else {
        console.error('Unhandled rejection:', reason);
    }
});
process.on('exit', function () { });
process.on('SIGINT', function () { return __awaiter(void 0, void 0, void 0, function () {
    var closeBrowser;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./enrichment/index.js'); })];
            case 1:
                closeBrowser = (_a.sent()).closeBrowser;
                return [4 /*yield*/, closeBrowser()];
            case 2:
                _a.sent();
                process.exit(0);
                return [2 /*return*/];
        }
    });
}); });
process.on('SIGTERM', function () { return __awaiter(void 0, void 0, void 0, function () {
    var closeBrowser;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./enrichment/index.js'); })];
            case 1:
                closeBrowser = (_a.sent()).closeBrowser;
                return [4 /*yield*/, closeBrowser()];
            case 2:
                _a.sent();
                process.exit(0);
                return [2 /*return*/];
        }
    });
}); });
var fs_1 = require("fs");
var path_1 = require("path");
var url_1 = require("url");
var index_js_1 = require("./db/index.js");
var index_js_2 = require("./discovery/index.js");
var index_js_3 = require("./enrichment/index.js");
var index_js_4 = require("./scoring/index.js");
var csv_export_js_1 = require("./utils/csv-export.js");
var config_js_1 = require("./utils/config.js");
var index_js_5 = require("./verification/index.js");
var index_js_6 = require("./sequencer/index.js");
var resend_sender_js_1 = require("./sequencer/resend-sender.js");
var sending_config_js_1 = require("./sequencer/sending-config.js");
var server_js_1 = require("./web/server.js");
var index_js_7 = require("./outreach/index.js");
var index_js_8 = require("./db/index.js");
var resend_sender_js_2 = require("./sequencer/resend-sender.js");
var __dirname = (0, path_1.dirname)((0, url_1.fileURLToPath)(import.meta.url));
// Initialize database
(0, index_js_1.initializeDatabase)();
var command = process.argv[2];
var args = process.argv.slice(3);
// Parse flags
var hasFlag = function (flag) { return args.includes(flag); };
var getFlagValue = function (flag) {
    var idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
};
var deepMode = hasFlag('--deep');
var argsWithoutFlags = args.filter(function (a) { return !a.startsWith('--'); });
function formatDuration(ms) {
    if (ms < 1000)
        return "".concat(ms, "ms");
    var seconds = Math.round(ms / 1000);
    if (seconds < 60)
        return "".concat(seconds, "s");
    var minutes = Math.floor(seconds / 60);
    var remaining = seconds % 60;
    return "".concat(minutes, "m ").concat(remaining, "s");
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, connected, metroName_1, country, options, metros, result, metros, metro, metroKey, hasSublocations, result, limit, leadsToEnrich, totalEmails, errors, _i, leadsToEnrich_1, lead, result, err_1, leadId, result, emailOrLimit, result, limit, result, subCommand, sequences, _b, sequences_1, seq, templateFile, templatePath, template, sequence, sequenceId, sequence, steps, _c, steps_1, step, sequenceId, stepNum, leadId, preview, lead, sequenceId, limit, result, status_1, config, subCommand, _d, testEmail, result, toEmail, sequenceId, leadId, stepNumber, lead, result, sequence, results, successCount, _e, results_1, result, limit, dailyLimit, result, _f, _g, err, setting, value, config, effectiveLimit, _h, _j, entry, numVal, subCommand, _k, eligible, stats, dailyLimit, sentToday, leadId, lead, _l, subject, body, limit, result, _m, _o, err, testEmail, leadId, lead, _p, subject, body, sendResult, filter, result, port, stats, enrollStats, sendStats, notEnriched, status_2, _q, _r, _s, stage, count, _t, _u, _v, source, count, limit, leads, _w, leads_1, lead;
        var _x;
        return __generator(this, function (_y) {
            switch (_y.label) {
                case 0:
                    _a = command;
                    switch (_a) {
                        case 'test-connection': return [3 /*break*/, 1];
                        case 'discover': return [3 /*break*/, 3];
                        case 'enrich': return [3 /*break*/, 8];
                        case 'score': return [3 /*break*/, 15];
                        case 'verify': return [3 /*break*/, 16];
                        case 'sequence': return [3 /*break*/, 21];
                        case 'send': return [3 /*break*/, 22];
                        case 'outreach': return [3 /*break*/, 35];
                        case 'export': return [3 /*break*/, 44];
                        case 'dashboard': return [3 /*break*/, 45];
                        case 'stats': return [3 /*break*/, 46];
                        case 'list': return [3 /*break*/, 47];
                        case 'help': return [3 /*break*/, 48];
                    }
                    return [3 /*break*/, 48];
                case 1:
                    console.log('Testing Google Maps API connection...');
                    return [4 /*yield*/, (0, index_js_2.testGoogleMapsConnection)()];
                case 2:
                    connected = _y.sent();
                    process.exit(connected ? 0 : 1);
                    return [3 /*break*/, 49];
                case 3:
                    metroName_1 = argsWithoutFlags[0];
                    country = (((_x = argsWithoutFlags[1]) === null || _x === void 0 ? void 0 : _x.toUpperCase()) || 'US');
                    options = { deep: deepMode };
                    if (deepMode) {
                        console.log('Deep discovery mode: all queries + pagination + sublocations');
                    }
                    if (!!metroName_1) return [3 /*break*/, 5];
                    console.log('Running discovery on first 5 US metros...');
                    metros = config_js_1.METRO_AREAS.US.slice(0, 5);
                    return [4 /*yield*/, (0, index_js_2.discoverLeadsInMultipleMetros)(metros, 'US', options, console.log)];
                case 4:
                    result = _y.sent();
                    console.log('\n=== Discovery Complete ===');
                    console.log("Total found: ".concat(result.leadsFound));
                    console.log("New leads: ".concat(result.leadsNew));
                    console.log("Duplicates: ".concat(result.leadsDuplicate));
                    return [3 /*break*/, 7];
                case 5:
                    metros = country === 'CA' ? config_js_1.METRO_AREAS.CA : config_js_1.METRO_AREAS.US;
                    metro = metros.find(function (m) { return m.name.toLowerCase() === metroName_1.toLowerCase(); });
                    if (!metro) {
                        console.error("Metro not found: ".concat(metroName_1));
                        console.log('Available metros:', metros.map(function (m) { return m.name; }).join(', '));
                        process.exit(1);
                    }
                    metroKey = "".concat(metro.name, ", ").concat(metro.state);
                    hasSublocations = config_js_1.METRO_SUBLOCATIONS[metroKey];
                    if (deepMode && hasSublocations) {
                        console.log("Sublocations available: ".concat(hasSublocations.map(function (s) { return s.name; }).join(', ')));
                    }
                    console.log("Discovering leads in ".concat(metro.name, ", ").concat(metro.state, "..."));
                    return [4 /*yield*/, (0, index_js_2.discoverLeadsInMetro)(metro, country, options, console.log)];
                case 6:
                    result = _y.sent();
                    console.log('\n=== Discovery Complete ===');
                    console.log("Total found: ".concat(result.leadsFound));
                    console.log("New leads: ".concat(result.leadsNew));
                    console.log("Duplicates: ".concat(result.leadsDuplicate));
                    _y.label = 7;
                case 7: return [3 /*break*/, 49];
                case 8:
                    limit = parseInt(argsWithoutFlags[0]) || 10;
                    leadsToEnrich = (0, index_js_1.getLeadsWithoutEmails)().slice(0, limit);
                    console.log("Enriching ".concat(leadsToEnrich.length, " leads..."));
                    totalEmails = 0;
                    errors = 0;
                    _i = 0, leadsToEnrich_1 = leadsToEnrich;
                    _y.label = 9;
                case 9:
                    if (!(_i < leadsToEnrich_1.length)) return [3 /*break*/, 14];
                    lead = leadsToEnrich_1[_i];
                    console.log("Enriching: ".concat(lead.business_name));
                    _y.label = 10;
                case 10:
                    _y.trys.push([10, 12, , 13]);
                    return [4 /*yield*/, (0, index_js_3.enrichAndSaveLead)(lead.id)];
                case 11:
                    result = _y.sent();
                    totalEmails += result.emailsFound;
                    if (result.emailsFound > 0) {
                        console.log("  ".concat(result.emailsFound, " emails found: [").concat(result.emails.join(', '), "]"));
                    }
                    else {
                        console.log("  No emails found");
                    }
                    return [3 /*break*/, 13];
                case 12:
                    err_1 = _y.sent();
                    errors++;
                    console.error("  Error: ".concat(err_1.message));
                    return [3 /*break*/, 13];
                case 13:
                    _i++;
                    return [3 /*break*/, 9];
                case 14:
                    console.log("\nTotal emails found: ".concat(totalEmails));
                    if (errors > 0)
                        console.log("Errors: ".concat(errors));
                    return [3 /*break*/, 49];
                case 15:
                    {
                        leadId = args[0];
                        if (leadId) {
                            (0, index_js_4.scoreAndSaveLead)(leadId);
                            console.log((0, index_js_4.explainScore)(leadId));
                        }
                        else {
                            console.log('Scoring all leads...');
                            result = (0, index_js_4.scoreAllLeads)(console.log);
                            console.log('\n=== Scoring Complete ===');
                            console.log("Scored: ".concat(result.scored, " leads"));
                            console.log("Average score: ".concat(result.avgScore));
                            console.log('By tier:', result.byTier);
                        }
                        return [3 /*break*/, 49];
                    }
                    _y.label = 16;
                case 16:
                    emailOrLimit = argsWithoutFlags[0];
                    if (!(emailOrLimit && emailOrLimit.includes('@'))) return [3 /*break*/, 18];
                    console.log("Verifying email: ".concat(emailOrLimit));
                    return [4 /*yield*/, (0, index_js_5.verifyEmail)(emailOrLimit)];
                case 17:
                    result = _y.sent();
                    console.log('\n=== Verification Result ===');
                    console.log("Status: ".concat(result.status));
                    console.log("MX Records: ".concat(result.mxRecords.join(', ') || 'None'));
                    console.log("Is Catch-All: ".concat(result.isCatchAll));
                    console.log("Is Disposable: ".concat(result.isDisposable));
                    if (result.smtpResponse)
                        console.log("SMTP Response: ".concat(result.smtpResponse));
                    if (result.error)
                        console.log("Error: ".concat(result.error));
                    return [3 /*break*/, 20];
                case 18:
                    limit = parseInt(emailOrLimit) || 50;
                    console.log("Verifying up to ".concat(limit, " unverified emails..."));
                    return [4 /*yield*/, (0, index_js_5.verifyUnverifiedEmails)(limit, function (completed, total, r) {
                            console.log("[".concat(completed, "/").concat(total, "] ").concat(r.email, ": ").concat(r.status));
                        })];
                case 19:
                    result = _y.sent();
                    console.log('\n=== Verification Complete ===');
                    console.log("Total: ".concat(result.total));
                    console.log("Valid: ".concat(result.valid));
                    console.log("Invalid: ".concat(result.invalid));
                    console.log("Catch-All: ".concat(result.catchAll));
                    console.log("Unknown: ".concat(result.unknown));
                    _y.label = 20;
                case 20: return [3 /*break*/, 49];
                case 21:
                    {
                        subCommand = argsWithoutFlags[0];
                        switch (subCommand) {
                            case 'list': {
                                sequences = (0, index_js_1.getAllSequences)();
                                console.log('=== Email Sequences ===\n');
                                if (sequences.length === 0) {
                                    console.log('No sequences found. Use "sequence import" to create one.');
                                }
                                for (_b = 0, sequences_1 = sequences; _b < sequences_1.length; _b++) {
                                    seq = sequences_1[_b];
                                    console.log("[".concat(seq.status, "] ").concat(seq.name, " (").concat(seq.total_steps, " steps)"));
                                    console.log("    ID: ".concat(seq.id));
                                }
                                break;
                            }
                            case 'import': {
                                templateFile = argsWithoutFlags[1];
                                if (!templateFile) {
                                    console.log('Available templates:');
                                    console.log('  - agency-intro');
                                    console.log('  - solo-tutor-intro');
                                    console.log('\nUsage: npx tsx src/cli.ts sequence import agency-intro');
                                    break;
                                }
                                templatePath = (0, path_1.join)(__dirname, '..', 'config', 'sequences', "".concat(templateFile, ".json"));
                                try {
                                    template = JSON.parse((0, fs_1.readFileSync)(templatePath, 'utf-8'));
                                    sequence = (0, index_js_1.createSequence)(template.name, template.steps);
                                    console.log("Sequence created: ".concat(sequence.name, " (").concat(sequence.id, ")"));
                                }
                                catch (error) {
                                    console.error("Failed to import template: ".concat(error instanceof Error ? error.message : 'Unknown error'));
                                }
                                break;
                            }
                            case 'show': {
                                sequenceId = argsWithoutFlags[1];
                                if (!sequenceId) {
                                    console.error('Usage: npx tsx src/cli.ts sequence show <sequence_id>');
                                    break;
                                }
                                sequence = (0, index_js_1.getSequenceById)(sequenceId);
                                if (!sequence) {
                                    console.error("Sequence not found: ".concat(sequenceId));
                                    break;
                                }
                                steps = (0, index_js_1.getSequenceSteps)(sequenceId);
                                console.log("\n=== ".concat(sequence.name, " ==="));
                                console.log("Status: ".concat(sequence.status));
                                console.log("Total Steps: ".concat(sequence.total_steps, "\n"));
                                for (_c = 0, steps_1 = steps; _c < steps_1.length; _c++) {
                                    step = steps_1[_c];
                                    console.log("--- Step ".concat(step.step_number, " (delay: ").concat(step.delay_hours, "h) ---"));
                                    console.log("Subject: ".concat(step.subject_template));
                                    console.log("Body preview: ".concat(step.body_template.substring(0, 100), "..."));
                                    console.log();
                                }
                                break;
                            }
                            case 'preview': {
                                sequenceId = argsWithoutFlags[1];
                                stepNum = parseInt(argsWithoutFlags[2]) || 1;
                                leadId = argsWithoutFlags[3];
                                if (!sequenceId || !leadId) {
                                    console.error('Usage: npx tsx src/cli.ts sequence preview <sequence_id> <step_num> <lead_id>');
                                    break;
                                }
                                preview = (0, index_js_6.previewSequenceEmail)(sequenceId, stepNum, leadId);
                                if (!preview) {
                                    console.error('Failed to generate preview. Check sequence and lead IDs.');
                                    break;
                                }
                                lead = (0, index_js_1.getLeadById)(leadId);
                                console.log("\n=== Email Preview for ".concat((lead === null || lead === void 0 ? void 0 : lead.business_name) || leadId, " ==="));
                                console.log("Subject: ".concat(preview.subject, "\n"));
                                console.log('Body:');
                                console.log(preview.body.replace(/<[^>]*>/g, ''));
                                break;
                            }
                            case 'enroll': {
                                sequenceId = argsWithoutFlags[1];
                                limit = parseInt(argsWithoutFlags[2]) || 10;
                                if (!sequenceId) {
                                    console.error('Usage: npx tsx src/cli.ts sequence enroll <sequence_id> [limit]');
                                    break;
                                }
                                console.log("Enrolling up to ".concat(limit, " leads in sequence ").concat(sequenceId, "..."));
                                result = (0, index_js_6.enrollLeadsInSequence)(sequenceId, limit, function (enrolled, lead) {
                                    console.log("[".concat(enrolled, "] Enrolled: ").concat(lead.business_name));
                                });
                                console.log('\n=== Enrollment Complete ===');
                                console.log("Enrolled: ".concat(result.enrolled));
                                console.log("Skipped: ".concat(result.skipped));
                                if (result.errors.length > 0) {
                                    console.log('Errors:', result.errors.slice(0, 5).join('\n'));
                                }
                                break;
                            }
                            case 'status': {
                                status_1 = (0, index_js_6.getSequenceEngineStatus)();
                                config = (0, sending_config_js_1.getSendingConfig)();
                                console.log('\n=== Sequence Engine Status ===');
                                console.log("Resend Configured: ".concat(status_1.resendConfigured ? '✓ Yes' : '✗ No'));
                                console.log("Sending Paused: ".concat(status_1.sendingPaused ? "\u2717 Yes (".concat(status_1.pauseReason, ")") : '✓ No'));
                                console.log("Within Sending Window: ".concat(status_1.withinSendingWindow ? '✓ Yes' : "\u2717 No (".concat(config.sendingWindowStartHour, ":00\u2013").concat(config.sendingWindowEndHour, ":00 ").concat(config.timezone, ")")));
                                console.log('\nSending Config:');
                                console.log("  Daily Limit: ".concat(status_1.dailyLimit, "/day"));
                                console.log("  Sent Today: ".concat(status_1.sentToday));
                                console.log("  Remaining Today: ".concat(status_1.remainingToday));
                                console.log("  Delay Between Sends: ".concat(formatDuration(config.minDelayMs), "\u2013").concat(formatDuration(config.maxDelayMs)));
                                console.log("  Sending Window: ".concat(config.sendingWindowStartHour, ":00\u2013").concat(config.sendingWindowEndHour, ":00 ").concat(config.timezone));
                                if (config.warmup) {
                                    console.log("  Warmup Start: ".concat(config.warmup.startDate));
                                    console.log("  Warmup Schedule: ".concat(config.warmup.schedule.map(function (s) { return "Day ".concat(s.day, ": ").concat(s.limit, "/day"); }).join(', ')));
                                }
                                console.log('\nEnrollment Stats:');
                                console.log("  Active: ".concat(status_1.enrollmentStats.active));
                                console.log("  Completed: ".concat(status_1.enrollmentStats.completed));
                                console.log("  Replied: ".concat(status_1.enrollmentStats.replied));
                                console.log("  Bounced: ".concat(status_1.enrollmentStats.bounced));
                                console.log("  Unsubscribed: ".concat(status_1.enrollmentStats.unsubscribed));
                                console.log('\nSend Stats (7 days):');
                                console.log("  Sent: ".concat(status_1.sendStats.sent));
                                console.log("  Delivered: ".concat(status_1.sendStats.delivered));
                                console.log("  Bounced: ".concat(status_1.sendStats.bounced, " (").concat(status_1.sendStats.bounceRate, "%)"));
                                console.log("  Complained: ".concat(status_1.sendStats.complained, " (").concat(status_1.sendStats.complaintRate, "%)"));
                                console.log("  Opened: ".concat(status_1.sendStats.opened));
                                console.log("  Clicked: ".concat(status_1.sendStats.clicked));
                                break;
                            }
                            default:
                                console.log("\nSequence Commands:\n  sequence list                                    List all sequences\n  sequence import <template>                       Import a sequence template\n  sequence show <sequence_id>                      Show sequence details\n  sequence preview <seq_id> <step> <lead_id>       Preview email for a lead\n  sequence enroll <sequence_id> [limit]            Enroll leads in sequence\n  sequence status                                  Show engine status\n\nAvailable Templates:\n  - agency-intro\n  - solo-tutor-intro\n");
                        }
                        return [3 /*break*/, 49];
                    }
                    _y.label = 22;
                case 22:
                    subCommand = argsWithoutFlags[0];
                    _d = subCommand;
                    switch (_d) {
                        case 'test': return [3 /*break*/, 23];
                        case 'test-sequence': return [3 /*break*/, 25];
                        case 'queue': return [3 /*break*/, 30];
                        case 'config': return [3 /*break*/, 32];
                    }
                    return [3 /*break*/, 33];
                case 23:
                    testEmail = argsWithoutFlags[1];
                    if (!testEmail) {
                        console.error('Usage: npx tsx src/cli.ts send test <your_email>');
                        return [3 /*break*/, 34];
                    }
                    if (!(0, resend_sender_js_1.isResendConfigured)()) {
                        console.error('Resend not configured. Set RESEND_API_KEY in .env');
                        return [3 /*break*/, 34];
                    }
                    console.log("Sending test email to ".concat(testEmail, "..."));
                    return [4 /*yield*/, (0, resend_sender_js_1.testResendConnection)(testEmail)];
                case 24:
                    result = _y.sent();
                    if (result.success) {
                        console.log('✓ Test email sent successfully! Check your inbox.');
                    }
                    else {
                        console.error("\u2717 Failed: ".concat(result.error));
                    }
                    return [3 /*break*/, 34];
                case 25:
                    toEmail = argsWithoutFlags[1];
                    sequenceId = argsWithoutFlags[2];
                    leadId = argsWithoutFlags[3];
                    stepNumber = parseInt(argsWithoutFlags[4]) || undefined;
                    if (!toEmail || !sequenceId || !leadId) {
                        console.error("\nUsage:\n  npx tsx src/cli.ts send test-sequence <your_email> <sequence_id> <lead_id> [step]\n\nExamples:\n  # Send step 1 of a sequence using a specific lead's data:\n  npx tsx src/cli.ts send test-sequence william@gmail.com seq_abc lead_xyz 1\n\n  # Send all steps:\n  npx tsx src/cli.ts send test-sequence william@gmail.com seq_abc lead_xyz\n");
                        return [3 /*break*/, 34];
                    }
                    if (!(0, resend_sender_js_1.isResendConfigured)()) {
                        console.error('Resend not configured. Set RESEND_API_KEY in .env');
                        return [3 /*break*/, 34];
                    }
                    lead = (0, index_js_1.getLeadById)(leadId);
                    if (!lead) {
                        console.error("Lead not found: ".concat(leadId));
                        return [3 /*break*/, 34];
                    }
                    if (!stepNumber) return [3 /*break*/, 27];
                    // Send a single step
                    console.log("Sending step ".concat(stepNumber, " of sequence ").concat(sequenceId, " to ").concat(toEmail, "..."));
                    console.log("Using lead data from: ".concat(lead.business_name, "\n"));
                    return [4 /*yield*/, (0, index_js_6.sendTestSequenceEmail)({
                            to: toEmail,
                            leadId: leadId,
                            sequenceId: sequenceId,
                            stepNumber: stepNumber,
                        })];
                case 26:
                    result = _y.sent();
                    if (result.success) {
                        console.log("\u2713 Sent! Subject: ".concat(result.subject));
                        console.log("  Message ID: ".concat(result.messageId));
                    }
                    else {
                        console.error("\u2717 Failed: ".concat(result.error));
                    }
                    return [3 /*break*/, 29];
                case 27:
                    sequence = (0, index_js_1.getSequenceById)(sequenceId);
                    if (!sequence) {
                        console.error("Sequence not found: ".concat(sequenceId));
                        return [3 /*break*/, 34];
                    }
                    console.log("Sending all ".concat(sequence.total_steps, " steps of \"").concat(sequence.name, "\" to ").concat(toEmail, "..."));
                    console.log("Using lead data from: ".concat(lead.business_name, "\n"));
                    return [4 /*yield*/, (0, index_js_6.sendTestSequenceAllSteps)({
                            to: [toEmail],
                            leadId: leadId,
                            sequenceId: sequenceId,
                            delayBetweenMs: 3000,
                        })];
                case 28:
                    results = _y.sent();
                    successCount = 0;
                    for (_e = 0, results_1 = results; _e < results_1.length; _e++) {
                        result = results_1[_e];
                        if (result.success) {
                            successCount++;
                            console.log("  \u2713 ".concat(result.subject));
                        }
                        else {
                            console.log("  \u2717 Failed: ".concat(result.error));
                        }
                    }
                    console.log("\n".concat(successCount, "/").concat(results.length, " emails sent. Check your inbox!"));
                    _y.label = 29;
                case 29: return [3 /*break*/, 34];
                case 30:
                    limit = parseInt(argsWithoutFlags[1]) || 10;
                    if (!(0, resend_sender_js_1.isResendConfigured)()) {
                        console.error('Resend not configured. Set RESEND_API_KEY in .env');
                        return [3 /*break*/, 34];
                    }
                    dailyLimit = (0, sending_config_js_1.getEffectiveDailyLimit)();
                    console.log("Processing send queue (batch limit: ".concat(limit, ", daily limit: ").concat(dailyLimit, "/day)..."));
                    console.log();
                    return [4 /*yield*/, (0, index_js_6.processSendQueue)(limit, function (sent, total, lead, delayMs) {
                            console.log("[".concat(sent, "/").concat(total, "] Sent to: ").concat(lead.business_name));
                            if (sent < total) {
                                console.log("         Waiting ".concat(formatDuration(delayMs), " before next send..."));
                            }
                        })];
                case 31:
                    result = _y.sent();
                    console.log('\n=== Send Queue Processed ===');
                    console.log("Processed: ".concat(result.processed));
                    console.log("Sent: ".concat(result.sent));
                    console.log("Failed: ".concat(result.failed));
                    console.log("Skipped: ".concat(result.skipped));
                    if (result.dailyLimitReached) {
                        console.log("\u26A0 Daily limit reached");
                    }
                    if (result.errors.length > 0) {
                        console.log('\nErrors:');
                        for (_f = 0, _g = result.errors.slice(0, 10); _f < _g.length; _f++) {
                            err = _g[_f];
                            console.log("  - ".concat(err));
                        }
                    }
                    return [3 /*break*/, 34];
                case 32:
                    {
                        setting = argsWithoutFlags[1];
                        value = argsWithoutFlags[2];
                        if (!setting) {
                            config = (0, sending_config_js_1.getSendingConfig)();
                            effectiveLimit = (0, sending_config_js_1.getEffectiveDailyLimit)();
                            console.log('\n=== Sending Configuration ===');
                            console.log("Daily Limit (base): ".concat(config.dailyLimit, "/day"));
                            console.log("Daily Limit (effective): ".concat(effectiveLimit, "/day"));
                            console.log("Delay Range: ".concat(formatDuration(config.minDelayMs), "\u2013").concat(formatDuration(config.maxDelayMs)));
                            console.log("Sending Window: ".concat(config.sendingWindowStartHour, ":00\u2013").concat(config.sendingWindowEndHour, ":00 ").concat(config.timezone));
                            if (config.warmup) {
                                console.log("Warmup Start: ".concat(config.warmup.startDate));
                                console.log("Warmup Schedule:");
                                for (_h = 0, _j = config.warmup.schedule; _h < _j.length; _h++) {
                                    entry = _j[_h];
                                    console.log("  Day ".concat(entry.day, ": ").concat(entry.limit, "/day"));
                                }
                            }
                            else {
                                console.log('Warmup: disabled');
                            }
                            console.log("\nTo change: npx tsx src/cli.ts send config <setting> <value>");
                            console.log('Settings: daily-limit, min-delay, max-delay, window-start, window-end');
                            return [3 /*break*/, 34];
                        }
                        if (!value) {
                            console.error("Usage: npx tsx src/cli.ts send config ".concat(setting, " <value>"));
                            return [3 /*break*/, 34];
                        }
                        numVal = parseInt(value, 10);
                        if (isNaN(numVal)) {
                            console.error("Invalid value: ".concat(value, " (must be a number)"));
                            return [3 /*break*/, 34];
                        }
                        switch (setting) {
                            case 'daily-limit':
                                (0, sending_config_js_1.updateSendingConfig)({ dailyLimit: numVal });
                                console.log("\u2713 Daily limit set to ".concat(numVal, "/day"));
                                break;
                            case 'min-delay':
                                (0, sending_config_js_1.updateSendingConfig)({ minDelayMs: numVal * 1000 });
                                console.log("\u2713 Min delay set to ".concat(numVal, "s (").concat(formatDuration(numVal * 1000), ")"));
                                break;
                            case 'max-delay':
                                (0, sending_config_js_1.updateSendingConfig)({ maxDelayMs: numVal * 1000 });
                                console.log("\u2713 Max delay set to ".concat(numVal, "s (").concat(formatDuration(numVal * 1000), ")"));
                                break;
                            case 'window-start':
                                (0, sending_config_js_1.updateSendingConfig)({ sendingWindowStartHour: numVal });
                                console.log("\u2713 Sending window start set to ".concat(numVal, ":00"));
                                break;
                            case 'window-end':
                                (0, sending_config_js_1.updateSendingConfig)({ sendingWindowEndHour: numVal });
                                console.log("\u2713 Sending window end set to ".concat(numVal, ":00"));
                                break;
                            default:
                                console.error("Unknown setting: ".concat(setting));
                                console.log('Available: daily-limit, min-delay, max-delay, window-start, window-end');
                        }
                        return [3 /*break*/, 34];
                    }
                    _y.label = 33;
                case 33:
                    console.log("\nSend Commands:\n  send test <email>                                         Send a test email to verify Resend setup\n  send test-sequence <email> <seq_id> <lead_id> [step]     Send real sequence email(s) to yourself\n  send queue [limit]                                        Process the send queue (default: 10)\n  send config                                               Show sending configuration\n  send config <setting> <value>                             Update a setting at runtime\n\nConfig Settings:\n  daily-limit <n>        Max emails per day (default: 15)\n  min-delay <seconds>    Min delay between sends (default: 45)\n  max-delay <seconds>    Max delay between sends (default: 240)\n  window-start <hour>    Start of sending window 0-23 (default: 8)\n  window-end <hour>      End of sending window 0-23 (default: 18)\n\nExamples:\n  npx tsx src/cli.ts send test william@gmail.com\n  npx tsx src/cli.ts send test-sequence william@gmail.com seq_abc lead_xyz\n  npx tsx src/cli.ts send test-sequence william@gmail.com seq_abc lead_xyz 1\n  npx tsx src/cli.ts send config daily-limit 25\n  npx tsx src/cli.ts send queue 10\n");
                    _y.label = 34;
                case 34: return [3 /*break*/, 49];
                case 35:
                    subCommand = argsWithoutFlags[0];
                    _k = subCommand;
                    switch (_k) {
                        case 'status': return [3 /*break*/, 36];
                        case 'preview': return [3 /*break*/, 37];
                        case 'send': return [3 /*break*/, 38];
                        case 'test': return [3 /*break*/, 40];
                    }
                    return [3 /*break*/, 42];
                case 36:
                    {
                        eligible = (0, index_js_7.getOutreachEligibleCount)();
                        stats = (0, index_js_8.getOutreachStats)();
                        dailyLimit = (0, sending_config_js_1.getEffectiveDailyLimit)();
                        sentToday = (0, index_js_8.getTodaySendCount)();
                        console.log('\n=== Outreach Status ===');
                        console.log("Eligible leads: ".concat(eligible));
                        console.log("Total outreach sent: ".concat(stats.total));
                        console.log("Sent today (all types): ".concat(sentToday, "/").concat(dailyLimit));
                        console.log("Remaining budget: ".concat(Math.max(0, dailyLimit - sentToday)));
                        return [3 /*break*/, 43];
                    }
                    _y.label = 37;
                case 37:
                    {
                        leadId = argsWithoutFlags[1];
                        if (!leadId) {
                            console.error('Usage: npx tsx src/cli.ts outreach preview <lead_id>');
                            return [3 /*break*/, 43];
                        }
                        lead = (0, index_js_1.getLeadById)(leadId);
                        if (!lead) {
                            console.error("Lead not found: ".concat(leadId));
                            return [3 /*break*/, 43];
                        }
                        _l = (0, index_js_7.renderOutreachEmail)(lead), subject = _l.subject, body = _l.body;
                        console.log("\n=== Outreach Preview for ".concat(lead.business_name, " ==="));
                        console.log("Subject: ".concat(subject, "\n"));
                        console.log('Body:');
                        console.log(body);
                        return [3 /*break*/, 43];
                    }
                    _y.label = 38;
                case 38:
                    limit = parseInt(argsWithoutFlags[1]) || 10;
                    if (!(0, resend_sender_js_1.isResendConfigured)()) {
                        console.error('Resend not configured. Set RESEND_API_KEY in .env');
                        return [3 /*break*/, 43];
                    }
                    console.log("Sending outreach to up to ".concat(limit, " leads..."));
                    console.log();
                    return [4 /*yield*/, (0, index_js_7.processOutreachQueue)(limit, function (sent, total, lead, delayMs) {
                            console.log("[".concat(sent, "/").concat(total, "] Sent to: ").concat(lead.business_name));
                            if (delayMs > 0) {
                                console.log("         Waiting ".concat(formatDuration(delayMs), " before next send..."));
                            }
                        })];
                case 39:
                    result = _y.sent();
                    console.log('\n=== Outreach Complete ===');
                    console.log("Processed: ".concat(result.processed));
                    console.log("Sent: ".concat(result.sent));
                    console.log("Failed: ".concat(result.failed));
                    console.log("Skipped: ".concat(result.skipped));
                    if (result.dailyLimitReached) {
                        console.log('Daily limit reached');
                    }
                    if (result.errors.length > 0) {
                        console.log('\nErrors:');
                        for (_m = 0, _o = result.errors.slice(0, 10); _m < _o.length; _m++) {
                            err = _o[_m];
                            console.log("  - ".concat(err));
                        }
                    }
                    return [3 /*break*/, 43];
                case 40:
                    testEmail = argsWithoutFlags[1];
                    leadId = argsWithoutFlags[2];
                    if (!testEmail || !leadId) {
                        console.error('Usage: npx tsx src/cli.ts outreach test <your_email> <lead_id>');
                        return [3 /*break*/, 43];
                    }
                    lead = (0, index_js_1.getLeadById)(leadId);
                    if (!lead) {
                        console.error("Lead not found: ".concat(leadId));
                        return [3 /*break*/, 43];
                    }
                    if (!(0, resend_sender_js_1.isResendConfigured)()) {
                        console.error('Resend not configured. Set RESEND_API_KEY in .env');
                        return [3 /*break*/, 43];
                    }
                    _p = (0, index_js_7.renderOutreachEmail)(lead), subject = _p.subject, body = _p.body;
                    console.log("Sending test outreach to ".concat(testEmail, "..."));
                    console.log("Using lead data from: ".concat(lead.business_name, "\n"));
                    return [4 /*yield*/, (0, resend_sender_js_2.sendRawEmail)({
                            to: testEmail,
                            subject: "[TEST] ".concat(subject),
                            text: body,
                        })];
                case 41:
                    sendResult = _y.sent();
                    if (sendResult.success) {
                        console.log('Test email sent! Check your inbox.');
                    }
                    else {
                        console.error("Failed: ".concat(sendResult.error));
                    }
                    return [3 /*break*/, 43];
                case 42:
                    console.log("\nOutreach Commands:\n  outreach status                    Show outreach statistics\n  outreach preview <lead_id>         Preview email for a lead\n  outreach send [limit]              Send outreach emails (default: 10)\n  outreach test <email> <lead_id>    Send test email to yourself\n\nExamples:\n  npx tsx src/cli.ts outreach status\n  npx tsx src/cli.ts outreach preview lead_abc123\n  npx tsx src/cli.ts outreach send 25\n  npx tsx src/cli.ts outreach test william@gmail.com lead_abc123\n");
                    _y.label = 43;
                case 43: return [3 /*break*/, 49];
                case 44:
                    {
                        filter = args[0] || 'all';
                        result = (0, csv_export_js_1.exportLeadsToCSV)({ filter: filter });
                        console.log(result);
                        return [3 /*break*/, 49];
                    }
                    _y.label = 45;
                case 45:
                    {
                        port = parseInt(args[0]) || 3000;
                        (0, server_js_1.startServer)(port);
                        return [3 /*break*/, 49];
                    }
                    _y.label = 46;
                case 46:
                    {
                        stats = (0, index_js_1.getStats)();
                        enrollStats = (0, index_js_1.getEnrollmentStats)();
                        sendStats = (0, index_js_1.getSendStats)();
                        notEnriched = (0, index_js_1.getLeadsNotEnrichedCount)();
                        status_2 = (0, index_js_6.getSequenceEngineStatus)();
                        console.log('=== Lead Database Stats ===');
                        console.log("Total leads: ".concat(stats.totalLeads));
                        console.log("Not enriched: ".concat(notEnriched));
                        console.log("Leads with emails: ".concat(stats.leadsWithEmails));
                        console.log("Verified emails: ".concat(stats.verifiedEmails));
                        console.log("Average score: ".concat(stats.avgScore));
                        console.log('\nBy Pipeline Stage:');
                        for (_q = 0, _r = Object.entries(stats.byPipelineStage); _q < _r.length; _q++) {
                            _s = _r[_q], stage = _s[0], count = _s[1];
                            console.log("  ".concat(stage, ": ").concat(count));
                        }
                        console.log('\nBy Source:');
                        for (_t = 0, _u = Object.entries(stats.bySource); _t < _u.length; _t++) {
                            _v = _u[_t], source = _v[0], count = _v[1];
                            console.log("  ".concat(source, ": ").concat(count));
                        }
                        console.log('\n=== Sequence Stats ===');
                        console.log("Active enrollments: ".concat(enrollStats.active));
                        console.log("Completed sequences: ".concat(enrollStats.completed));
                        console.log("Replies: ".concat(enrollStats.replied));
                        console.log("Bounced: ".concat(enrollStats.bounced));
                        console.log('\n=== Send Stats (7 days) ===');
                        console.log("Sent: ".concat(sendStats.sent));
                        console.log("Bounce rate: ".concat(sendStats.bounceRate, "%"));
                        console.log("Complaint rate: ".concat(sendStats.complaintRate, "%"));
                        console.log('\n=== Sending Budget ===');
                        console.log("Daily limit: ".concat(status_2.dailyLimit, "/day"));
                        console.log("Sent today: ".concat(status_2.sentToday));
                        console.log("Remaining: ".concat(status_2.remainingToday));
                        console.log("Resend configured: ".concat(status_2.resendConfigured ? '✓' : '✗'));
                        console.log("Within sending window: ".concat(status_2.withinSendingWindow ? '✓' : '✗'));
                        return [3 /*break*/, 49];
                    }
                    _y.label = 47;
                case 47:
                    {
                        limit = parseInt(args[0]) || 20;
                        leads = (0, index_js_1.getAllLeads)(limit);
                        console.log("=== Top ".concat(leads.length, " Leads ===\n"));
                        for (_w = 0, leads_1 = leads; _w < leads_1.length; _w++) {
                            lead = leads_1[_w];
                            console.log("[".concat(lead.score, "] ").concat(lead.business_name));
                            console.log("    ".concat(lead.city, ", ").concat(lead.state_province, " | ").concat(lead.business_type, " | ").concat(lead.pipeline_stage));
                            if (lead.website)
                                console.log("    ".concat(lead.website));
                            console.log();
                        }
                        return [3 /*break*/, 49];
                    }
                    _y.label = 48;
                case 48:
                    console.log("\nSchedutor Outbound Sales Engine - CLI\n\nUsage: npx tsx src/cli.ts <command> [args] [flags]\n\nPhase 1 - Discovery & Scoring:\n  test-connection                Test Google Maps API connection\n  discover [city] [country]      Discover leads (default: first 5 US metros)\n  enrich [limit]                 Enrich leads with emails (default: 10)\n  score [leadId]                 Score all leads or explain specific lead score\n  export [filter]                Export to CSV (all|with-emails|valid|invalid|catch-all|unknown|unverified|hot|warm)\n  stats                          Show all statistics\n  list [limit]                   List recent leads\n  dashboard [port]               Start web dashboard (default: 3000)\n\nPhase 2 - Verification & Outreach:\n  verify [email|limit]           Verify single email or batch (default: 50)\n  outreach <subcommand>          Single-email outreach to verified leads\n  sequence <subcommand>          Manage email sequences (legacy)\n  send <subcommand>              Send emails\n\nOutreach Subcommands:\n  outreach status                Show outreach stats and eligible leads\n  outreach preview <lead_id>     Preview outreach email for a lead\n  outreach send [limit]          Send outreach emails (default: 10)\n  outreach test <email> <lead>   Test outreach to your inbox\n\nSequence Subcommands:\n  sequence list                  List all sequences\n  sequence import <template>     Import a sequence template\n  sequence show <id>             Show sequence details\n  sequence preview <id> <step> <lead_id>   Preview email\n  sequence enroll <id> [limit]   Enroll leads in sequence\n  sequence status                Show engine status\n\nSend Subcommands:\n  send test <email>              Send test email (verify Resend setup)\n  send test-sequence <email> <seq_id> <lead_id> [step]\n                                 Send real sequence email(s) to yourself\n  send queue [limit]             Process send queue\n  send config                    Show sending config\n  send config <setting> <value>  Update config at runtime\n\nFlags:\n  --deep                         Deep discovery: all 12 queries + pagination + suburbs\n\nExamples:\n  npx tsx src/cli.ts discover Toronto CA --deep\n  npx tsx src/cli.ts enrich 50\n  npx tsx src/cli.ts verify 100\n  npx tsx src/cli.ts sequence import agency-intro\n  npx tsx src/cli.ts sequence enroll <seq_id> 50\n  npx tsx src/cli.ts send test william@gmail.com\n  npx tsx src/cli.ts send test-sequence william@gmail.com <seq_id> <lead_id>\n  npx tsx src/cli.ts send config daily-limit 25\n  npx tsx src/cli.ts send queue 10\n");
                    _y.label = 49;
                case 49: return [2 /*return*/];
            }
        });
    });
}
main().catch(function (err) {
    console.error('Error:', err);
    process.exit(1);
});
