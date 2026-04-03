export interface Lead {
    id: string;
    business_name: string;
    business_type: 'agency' | 'solo_tutor' | 'franchise' | 'online_platform' | null;
    website: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state_province: string | null;
    country: 'US' | 'CA' | null;
    source: 'google_maps' | 'yelp' | 'directory' | 'manual';
    source_id: string | null;
    google_rating: number | null;
    google_review_count: number | null;
    score: number;
    pipeline_stage: string;
    created_at: string;
    updated_at: string;
}
export interface LeadEmail {
    id: string;
    lead_id: string;
    email: string;
    contact_name: string | null;
    role: 'owner' | 'admin' | 'info' | 'unknown' | null;
    verification_status: 'unverified' | 'valid' | 'invalid' | 'catch_all' | 'unknown';
    source: 'scraped' | 'pattern_guess' | 'manual';
    is_primary: number;
    created_at: string;
}
export interface LeadEnrichment {
    id: string;
    lead_id: string;
    has_multiple_tutors: number | null;
    existing_scheduling_tool: string | null;
    linkedin_url: string | null;
    facebook_url: string | null;
    founded_year: number | null;
    team_size_estimate: string | null;
    specialties: string | null;
    raw_data: string | null;
    enriched_at: string;
}
export interface DiscoveryRun {
    id: string;
    source: string;
    query: string;
    location: string | null;
    leads_found: number;
    leads_new: number;
    leads_duplicate: number;
    status: 'running' | 'completed' | 'failed';
    started_at: string;
    completed_at: string | null;
    error_message: string | null;
}
export declare function insertLead(lead: Omit<Lead, 'id' | 'score' | 'pipeline_stage' | 'created_at' | 'updated_at'>): Lead;
export declare function getLeadById(id: string): Lead | undefined;
export declare function getLeadBySourceId(source: string, sourceId: string): Lead | undefined;
export declare function findDuplicateLead(businessName: string, city: string | null, stateProvince: string | null): Lead | undefined;
export declare function updateLeadScore(id: string, score: number): void;
export declare function updateLeadPipelineStage(id: string, stage: string): void;
export declare function getLeadsByPipelineStage(stage: string, limit?: number): Lead[];
export declare function getTopScoredLeads(limit?: number): Lead[];
export declare function getAllLeads(limit?: number, offset?: number): Lead[];
export declare function getLeadsCount(): number;
export declare function getLeadsWithVerifiedEmails(): Lead[];
export declare function insertLeadEmail(email: Omit<LeadEmail, 'id' | 'created_at'>): LeadEmail;
export declare function getLeadEmailById(id: string): LeadEmail | undefined;
export declare function getLeadEmails(leadId: string): LeadEmail[];
export declare function emailExistsForLead(leadId: string, email: string): boolean;
export declare function updateEmailVerificationStatus(id: string, status: LeadEmail['verification_status']): void;
export declare function getLeadsWithoutEmails(): Lead[];
export declare function insertOrUpdateEnrichment(enrichment: Omit<LeadEnrichment, 'id' | 'enriched_at'>): LeadEnrichment;
export declare function getEnrichmentByLeadId(leadId: string): LeadEnrichment | undefined;
export declare function startDiscoveryRun(source: string, query: string, location: string | null): DiscoveryRun;
export declare function getDiscoveryRunById(id: string): DiscoveryRun | undefined;
export declare function completeDiscoveryRun(id: string, leadsFound: number, leadsNew: number, leadsDuplicate: number): void;
export declare function failDiscoveryRun(id: string, errorMessage: string): void;
export declare function getRecentDiscoveryRuns(limit?: number): DiscoveryRun[];
export declare function getStats(): {
    totalLeads: number;
    leadsWithEmails: number;
    verifiedEmails: number;
    byPipelineStage: Record<string, number>;
    bySource: Record<string, number>;
    avgScore: number;
};
