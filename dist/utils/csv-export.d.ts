export interface ExportOptions {
    filter?: 'all' | 'scored' | 'verified' | 'hot' | 'warm';
    limit?: number;
    outputPath?: string;
}
export declare function exportLeadsToCSV(options?: ExportOptions): string;
export declare function exportLeadsAsJSON(options?: ExportOptions): object[];
