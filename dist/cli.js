#!/usr/bin/env node
import { initializeDatabase, getStats, getAllLeads, getLeadsWithoutEmails } from './db/index.js';
import { discoverLeadsInMetro, discoverLeadsInMultipleMetros, testGoogleMapsConnection } from './discovery/index.js';
import { enrichAndSaveLead } from './enrichment/index.js';
import { scoreAllLeads, scoreAndSaveLead, explainScore } from './scoring/index.js';
import { exportLeadsToCSV } from './utils/csv-export.js';
import { METRO_AREAS, METRO_SUBLOCATIONS } from './utils/config.js';
// Initialize database
initializeDatabase();
const command = process.argv[2];
const args = process.argv.slice(3);
// Parse flags
const hasFlag = (flag) => args.includes(flag);
const deepMode = hasFlag('--deep');
const argsWithoutFlags = args.filter(a => !a.startsWith('--'));
async function main() {
    switch (command) {
        case 'test-connection':
            console.log('Testing Google Maps API connection...');
            const connected = await testGoogleMapsConnection();
            process.exit(connected ? 0 : 1);
            break;
        case 'discover': {
            const metroName = argsWithoutFlags[0];
            const country = (argsWithoutFlags[1]?.toUpperCase() || 'US');
            const options = { deep: deepMode };
            if (deepMode) {
                console.log('Deep discovery mode: all queries + pagination + sublocations');
            }
            if (!metroName) {
                // Run on first 5 metros
                console.log('Running discovery on first 5 US metros...');
                const metros = METRO_AREAS.US.slice(0, 5);
                const result = await discoverLeadsInMultipleMetros(metros, 'US', options, console.log);
                console.log('\n=== Discovery Complete ===');
                console.log(`Total found: ${result.leadsFound}`);
                console.log(`New leads: ${result.leadsNew}`);
                console.log(`Duplicates: ${result.leadsDuplicate}`);
            }
            else {
                const metros = country === 'CA' ? METRO_AREAS.CA : METRO_AREAS.US;
                const metro = metros.find(m => m.name.toLowerCase() === metroName.toLowerCase());
                if (!metro) {
                    console.error(`Metro not found: ${metroName}`);
                    console.log('Available metros:', metros.map(m => m.name).join(', '));
                    process.exit(1);
                }
                const metroKey = `${metro.name}, ${metro.state}`;
                const hasSublocations = METRO_SUBLOCATIONS[metroKey];
                if (deepMode && hasSublocations) {
                    console.log(`Sublocations available: ${hasSublocations.map(s => s.name).join(', ')}`);
                }
                console.log(`Discovering leads in ${metro.name}, ${metro.state}...`);
                const result = await discoverLeadsInMetro(metro, country, options, console.log);
                console.log('\n=== Discovery Complete ===');
                console.log(`Total found: ${result.leadsFound}`);
                console.log(`New leads: ${result.leadsNew}`);
                console.log(`Duplicates: ${result.leadsDuplicate}`);
            }
            break;
        }
        case 'enrich': {
            const limit = parseInt(args[0]) || 10;
            const leadsToEnrich = getLeadsWithoutEmails().slice(0, limit);
            console.log(`Enriching ${leadsToEnrich.length} leads...`);
            let totalEmails = 0;
            for (const lead of leadsToEnrich) {
                console.log(`Enriching: ${lead.business_name}`);
                const result = await enrichAndSaveLead(lead.id);
                totalEmails += result.emailsFound;
                console.log(`  Found ${result.emailsFound} emails`);
            }
            console.log(`\nTotal emails found: ${totalEmails}`);
            break;
        }
        case 'score': {
            const leadId = args[0];
            if (leadId) {
                const breakdown = scoreAndSaveLead(leadId);
                console.log(explainScore(leadId));
            }
            else {
                console.log('Scoring all leads...');
                const result = scoreAllLeads(console.log);
                console.log('\n=== Scoring Complete ===');
                console.log(`Scored: ${result.scored} leads`);
                console.log(`Average score: ${result.avgScore}`);
                console.log('By tier:', result.byTier);
            }
            break;
        }
        case 'export': {
            const filter = args[0] || 'all';
            const result = exportLeadsToCSV({ filter });
            console.log(result);
            break;
        }
        case 'stats':
            const stats = getStats();
            console.log('=== Lead Database Stats ===');
            console.log(`Total leads: ${stats.totalLeads}`);
            console.log(`Leads with emails: ${stats.leadsWithEmails}`);
            console.log(`Verified emails: ${stats.verifiedEmails}`);
            console.log(`Average score: ${stats.avgScore}`);
            console.log('\nBy Pipeline Stage:');
            for (const [stage, count] of Object.entries(stats.byPipelineStage)) {
                console.log(`  ${stage}: ${count}`);
            }
            console.log('\nBy Source:');
            for (const [source, count] of Object.entries(stats.bySource)) {
                console.log(`  ${source}: ${count}`);
            }
            break;
        case 'list': {
            const limit = parseInt(args[0]) || 20;
            const leads = getAllLeads(limit);
            console.log(`=== Top ${leads.length} Leads ===\n`);
            for (const lead of leads) {
                console.log(`[${lead.score}] ${lead.business_name}`);
                console.log(`    ${lead.city}, ${lead.state_province} | ${lead.business_type} | ${lead.pipeline_stage}`);
                if (lead.website)
                    console.log(`    ${lead.website}`);
                console.log();
            }
            break;
        }
        case 'help':
        default:
            console.log(`
Schedutor Outbound Sales Engine - CLI

Usage: npx tsx src/cli.ts <command> [args] [flags]

Commands:
  test-connection              Test Google Maps API connection
  discover [city] [country]    Discover leads (default: first 5 US metros)
  enrich [limit]               Enrich leads with emails (default: 10)
  score [leadId]               Score all leads or explain specific lead score
  export [filter]              Export to CSV (all|scored|verified|hot|warm)
  stats                        Show database statistics
  list [limit]                 List recent leads
  help                         Show this help

Flags:
  --deep                       Deep discovery: all 12 queries + pagination + suburbs

Examples:
  npx tsx src/cli.ts discover Toronto CA            # Basic discovery (~30 leads)
  npx tsx src/cli.ts discover Toronto CA --deep     # Deep discovery (~300+ leads)
  npx tsx src/cli.ts discover "New York" US --deep  # Deep discovery with suburbs
  npx tsx src/cli.ts enrich 50
  npx tsx src/cli.ts score
  npx tsx src/cli.ts export hot
  npx tsx src/cli.ts stats
`);
    }
}
main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
