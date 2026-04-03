import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getLeadById, getLeadEmails, getEnrichmentByLeadId, updateLeadScore, getAllLeads } from '../db/index.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
let scoringConfig = null;
function loadScoringConfig() {
    if (scoringConfig) {
        return scoringConfig;
    }
    const configPath = join(__dirname, '../../config/scoring-rules.json');
    const configJson = readFileSync(configPath, 'utf-8');
    scoringConfig = JSON.parse(configJson);
    return scoringConfig;
}
function getFieldValue(context, field) {
    const parts = field.split('.');
    if (parts[0] === 'enrichment') {
        if (!context.enrichment)
            return null;
        const enrichmentField = parts[1];
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
    const value = getFieldValue(context, condition.field);
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
export function calculateScore(leadId) {
    const config = loadScoringConfig();
    const lead = getLeadById(leadId);
    if (!lead) {
        throw new Error(`Lead not found: ${leadId}`);
    }
    const emails = getLeadEmails(leadId);
    const enrichment = getEnrichmentByLeadId(leadId) ?? null;
    const context = {
        lead,
        emails,
        enrichment,
        hasVerifiedEmail: emails.some(e => e.verification_status === 'valid'),
        hasSocialPresence: !!(enrichment?.linkedin_url || enrichment?.facebook_url)
    };
    const appliedRules = [];
    let totalScore = 0;
    for (const rule of config.rules) {
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
    // Determine tier
    let tier = 'cold';
    let tierLabel = 'Cold Lead';
    for (const [tierName, tierConfig] of Object.entries(config.scoreTiers)) {
        if (totalScore >= tierConfig.min) {
            tier = tierName;
            tierLabel = tierConfig.label;
        }
    }
    return {
        totalScore,
        tier,
        tierLabel,
        appliedRules
    };
}
export function scoreAndSaveLead(leadId) {
    const breakdown = calculateScore(leadId);
    updateLeadScore(leadId, breakdown.totalScore);
    return breakdown;
}
export function scoreAllLeads(onProgress) {
    const leads = getAllLeads(10000);
    const tierCounts = {
        hot: 0,
        warm: 0,
        cool: 0,
        cold: 0
    };
    let totalScore = 0;
    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        const breakdown = scoreAndSaveLead(lead.id);
        totalScore += breakdown.totalScore;
        tierCounts[breakdown.tier]++;
        if (onProgress && (i + 1) % 100 === 0) {
            onProgress(`Scored ${i + 1}/${leads.length} leads`);
        }
    }
    return {
        scored: leads.length,
        avgScore: leads.length > 0 ? Math.round((totalScore / leads.length) * 10) / 10 : 0,
        byTier: tierCounts
    };
}
export function explainScore(leadId) {
    const breakdown = calculateScore(leadId);
    const lead = getLeadById(leadId);
    if (!lead) {
        return 'Lead not found';
    }
    let explanation = `Score for "${lead.business_name}": ${breakdown.totalScore}/100 (${breakdown.tierLabel})\n\n`;
    explanation += 'Applied Rules:\n';
    if (breakdown.appliedRules.length === 0) {
        explanation += '  - No scoring rules matched\n';
    }
    else {
        for (const rule of breakdown.appliedRules) {
            const sign = rule.points >= 0 ? '+' : '';
            explanation += `  - ${rule.ruleName}: ${sign}${rule.points} points\n`;
        }
    }
    return explanation;
}
