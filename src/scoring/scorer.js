"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateScore = calculateScore;
exports.scoreAndSaveLead = scoreAndSaveLead;
exports.scoreAllLeads = scoreAllLeads;
exports.explainScore = explainScore;
var fs_1 = require("fs");
var path_1 = require("path");
var url_1 = require("url");
var index_js_1 = require("../db/index.js");
var __dirname = (0, path_1.dirname)((0, url_1.fileURLToPath)(import.meta.url));
var scoringConfig = null;
function loadScoringConfig() {
    if (scoringConfig) {
        return scoringConfig;
    }
    var configPath = (0, path_1.join)(__dirname, '../../config/scoring-rules.json');
    var configJson = (0, fs_1.readFileSync)(configPath, 'utf-8');
    scoringConfig = JSON.parse(configJson);
    return scoringConfig;
}
function getFieldValue(context, field) {
    var parts = field.split('.');
    if (parts[0] === 'enrichment') {
        if (!context.enrichment)
            return null;
        var enrichmentField = parts[1];
        return context.enrichment[enrichmentField];
    }
    if (field === 'has_verified_email') {
        return context.hasVerifiedEmail;
    }
    if (field === 'has_social_presence') {
        return context.hasSocialPresence;
    }
    return context.lead[field];
}
function evaluateCondition(context, condition) {
    var value = getFieldValue(context, condition.field);
    switch (condition.operator) {
        case 'equals':
            return value === condition.value;
        case 'not_equals':
            return value !== condition.value;
        case 'gt':
            return typeof value === 'number' && value > condition.value;
        case 'gte':
            return typeof value === 'number' && value >= condition.value;
        case 'lt':
            return typeof value === 'number' && value < condition.value;
        case 'lte':
            return typeof value === 'number' && value <= condition.value;
        case 'is_null':
            return value === null || value === undefined;
        case 'not_null':
            return value !== null && value !== undefined;
        case 'contains':
            return typeof value === 'string' && value.toLowerCase().includes(condition.value.toLowerCase());
        default:
            return false;
    }
}
function calculateScore(leadId) {
    var _a;
    var config = loadScoringConfig();
    var lead = (0, index_js_1.getLeadById)(leadId);
    if (!lead) {
        throw new Error("Lead not found: ".concat(leadId));
    }
    var emails = (0, index_js_1.getLeadEmails)(leadId);
    var enrichment = (_a = (0, index_js_1.getEnrichmentByLeadId)(leadId)) !== null && _a !== void 0 ? _a : null;
    var context = {
        lead: lead,
        emails: emails,
        enrichment: enrichment,
        hasVerifiedEmail: emails.some(function (e) { return e.verification_status === 'valid'; }),
        hasSocialPresence: !!((enrichment === null || enrichment === void 0 ? void 0 : enrichment.linkedin_url) || (enrichment === null || enrichment === void 0 ? void 0 : enrichment.facebook_url))
    };
    var appliedRules = [];
    var totalScore = 0;
    for (var _i = 0, _b = config.rules; _i < _b.length; _i++) {
        var rule = _b[_i];
        if (evaluateCondition(context, rule.condition)) {
            appliedRules.push({
                ruleId: rule.id,
                ruleName: rule.name,
                points: rule.points
            });
            totalScore += rule.points;
        }
    }
    // Clamp score to 0-100
    totalScore = Math.max(0, Math.min(config.maxScore, totalScore));
    // Determine tier (check from highest to lowest)
    var tier = 'cold';
    var tierLabel = 'Cold Lead';
    if (totalScore >= 70) {
        tier = 'hot';
        tierLabel = 'Hot Lead';
    }
    else if (totalScore >= 50) {
        tier = 'warm';
        tierLabel = 'Warm Lead';
    }
    else if (totalScore >= 30) {
        tier = 'cool';
        tierLabel = 'Cool Lead';
    }
    return {
        totalScore: totalScore,
        tier: tier,
        tierLabel: tierLabel,
        appliedRules: appliedRules
    };
}
function scoreAndSaveLead(leadId) {
    var breakdown = calculateScore(leadId);
    (0, index_js_1.updateLeadScore)(leadId, breakdown.totalScore);
    return breakdown;
}
function scoreAllLeads(onProgress) {
    var leads = (0, index_js_1.getAllLeads)(10000);
    var tierCounts = {
        hot: 0,
        warm: 0,
        cool: 0,
        cold: 0
    };
    var totalScore = 0;
    for (var i = 0; i < leads.length; i++) {
        var lead = leads[i];
        var breakdown = scoreAndSaveLead(lead.id);
        totalScore += breakdown.totalScore;
        tierCounts[breakdown.tier]++;
        if (onProgress && (i + 1) % 100 === 0) {
            onProgress("Scored ".concat(i + 1, "/").concat(leads.length, " leads"));
        }
    }
    return {
        scored: leads.length,
        avgScore: leads.length > 0 ? Math.round((totalScore / leads.length) * 10) / 10 : 0,
        byTier: tierCounts
    };
}
function explainScore(leadId) {
    var breakdown = calculateScore(leadId);
    var lead = (0, index_js_1.getLeadById)(leadId);
    if (!lead) {
        return 'Lead not found';
    }
    var explanation = "Score for \"".concat(lead.business_name, "\": ").concat(breakdown.totalScore, "/100 (").concat(breakdown.tierLabel, ")\n\n");
    explanation += 'Applied Rules:\n';
    if (breakdown.appliedRules.length === 0) {
        explanation += '  - No scoring rules matched\n';
    }
    else {
        for (var _i = 0, _a = breakdown.appliedRules; _i < _a.length; _i++) {
            var rule = _a[_i];
            var sign = rule.points >= 0 ? '+' : '';
            explanation += "  - ".concat(rule.ruleName, ": ").concat(sign).concat(rule.points, " points\n");
        }
    }
    return explanation;
}
