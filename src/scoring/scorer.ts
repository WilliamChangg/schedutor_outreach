import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getLeadById,
  getLeadEmails,
  getEnrichmentByLeadId,
  updateLeadScore,
  getAllLeads,
  type Lead,
  type LeadEmail,
  type LeadEnrichment
} from '../db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ScoringRule {
  id: string;
  name: string;
  description: string;
  condition: {
    field: string;
    operator: 'equals' | 'not_equals' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_null' | 'not_null' | 'contains';
    value?: unknown;
  };
  points: number;
}

interface ScoringConfig {
  rules: ScoringRule[];
  maxScore: number;
  scoreTiers: Record<string, { min: number; label: string }>;
}

interface ScoringContext {
  lead: Lead;
  emails: LeadEmail[];
  enrichment: LeadEnrichment | null;
  hasVerifiedEmail: boolean;
  hasSocialPresence: boolean;
}

let scoringConfig: ScoringConfig | null = null;

function loadScoringConfig(): ScoringConfig {
  if (scoringConfig) {
    return scoringConfig;
  }

  const configPath = join(__dirname, '../../config/scoring-rules.json');
  const configJson = readFileSync(configPath, 'utf-8');
  scoringConfig = JSON.parse(configJson);
  return scoringConfig!;
}

function getFieldValue(context: ScoringContext, field: string): unknown {
  const parts = field.split('.');

  if (parts[0] === 'enrichment') {
    if (!context.enrichment) return null;
    const enrichmentField = parts[1] as keyof LeadEnrichment;
    return context.enrichment[enrichmentField];
  }

  if (field === 'has_verified_email') {
    return context.hasVerifiedEmail;
  }

  if (field === 'has_social_presence') {
    return context.hasSocialPresence;
  }

  return context.lead[field as keyof Lead];
}

function evaluateCondition(
  context: ScoringContext,
  condition: ScoringRule['condition']
): boolean {
  const value = getFieldValue(context, condition.field);

  switch (condition.operator) {
    case 'equals':
      return value === condition.value;

    case 'not_equals':
      return value !== condition.value;

    case 'gt':
      return typeof value === 'number' && value > (condition.value as number);

    case 'gte':
      return typeof value === 'number' && value >= (condition.value as number);

    case 'lt':
      return typeof value === 'number' && value < (condition.value as number);

    case 'lte':
      return typeof value === 'number' && value <= (condition.value as number);

    case 'is_null':
      return value === null || value === undefined;

    case 'not_null':
      return value !== null && value !== undefined;

    case 'contains':
      return typeof value === 'string' && value.toLowerCase().includes((condition.value as string).toLowerCase());

    default:
      return false;
  }
}

export interface ScoreBreakdown {
  totalScore: number;
  tier: string;
  tierLabel: string;
  appliedRules: Array<{
    ruleId: string;
    ruleName: string;
    points: number;
  }>;
}

export function calculateScore(leadId: string): ScoreBreakdown {
  const config = loadScoringConfig();
  const lead = getLeadById(leadId);

  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  const emails = getLeadEmails(leadId);
  const enrichment = getEnrichmentByLeadId(leadId) ?? null;

  const context: ScoringContext = {
    lead,
    emails,
    enrichment,
    hasVerifiedEmail: emails.some(e => e.verification_status === 'valid'),
    hasSocialPresence: !!(enrichment?.linkedin_url || enrichment?.facebook_url)
  };

  const appliedRules: ScoreBreakdown['appliedRules'] = [];
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

  // Determine tier (check from highest to lowest)
  let tier = 'cold';
  let tierLabel = 'Cold Lead';

  if (totalScore >= 70) {
    tier = 'hot';
    tierLabel = 'Hot Lead';
  } else if (totalScore >= 50) {
    tier = 'warm';
    tierLabel = 'Warm Lead';
  } else if (totalScore >= 30) {
    tier = 'cool';
    tierLabel = 'Cool Lead';
  }

  return {
    totalScore,
    tier,
    tierLabel,
    appliedRules
  };
}

export function scoreAndSaveLead(leadId: string): ScoreBreakdown {
  const breakdown = calculateScore(leadId);
  updateLeadScore(leadId, breakdown.totalScore);
  return breakdown;
}

export function scoreAllLeads(onProgress?: (message: string) => void): {
  scored: number;
  avgScore: number;
  byTier: Record<string, number>;
} {
  const leads = getAllLeads(10000);
  const tierCounts: Record<string, number> = {
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

export function explainScore(leadId: string): string {
  const breakdown = calculateScore(leadId);
  const lead = getLeadById(leadId);

  if (!lead) {
    return 'Lead not found';
  }

  let explanation = `Score for "${lead.business_name}": ${breakdown.totalScore}/100 (${breakdown.tierLabel})\n\n`;
  explanation += 'Applied Rules:\n';

  if (breakdown.appliedRules.length === 0) {
    explanation += '  - No scoring rules matched\n';
  } else {
    for (const rule of breakdown.appliedRules) {
      const sign = rule.points >= 0 ? '+' : '';
      explanation += `  - ${rule.ruleName}: ${sign}${rule.points} points\n`;
    }
  }

  return explanation;
}
