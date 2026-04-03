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
export declare function calculateScore(leadId: string): ScoreBreakdown;
export declare function scoreAndSaveLead(leadId: string): ScoreBreakdown;
export declare function scoreAllLeads(onProgress?: (message: string) => void): {
    scored: number;
    avgScore: number;
    byTier: Record<string, number>;
};
export declare function explainScore(leadId: string): string;
