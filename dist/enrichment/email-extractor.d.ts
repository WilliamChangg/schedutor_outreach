import { type Lead, type LeadEmail } from '../db/index.js';
interface EnrichmentData {
    emails: Array<{
        email: string;
        context: string;
        role: LeadEmail['role'];
    }>;
    hasMultipleTutors: boolean;
    existingSchedulingTool: string | null;
    linkedinUrl: string | null;
    facebookUrl: string | null;
    specialties: string[];
}
export declare function enrichLead(lead: Lead): Promise<EnrichmentData>;
export declare function enrichAndSaveLead(leadId: string): Promise<{
    emailsFound: number;
    enrichmentSaved: boolean;
}>;
export declare function generateEmailPatterns(domain: string, firstName?: string, lastName?: string): string[];
export {};
