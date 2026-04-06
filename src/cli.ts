#!/usr/bin/env node

// Global error handlers to prevent crashes from socket errors
// Suppress repeated socket errors to reduce log noise
process.on('uncaughtException', (err) => {
  if (err.message?.includes('other side closed') || (err as any).code === 'UND_ERR_SOCKET') {
    // Silently ignore - these are expected for blocked sites
  } else {
    console.error('Uncaught exception:', err);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason) => {
  const err = reason as any;
  if (err?.message?.includes('other side closed') || err?.code === 'UND_ERR_SOCKET') {
    // Silently ignore - these are expected for blocked sites
  } else {
    console.error('Unhandled rejection:', reason);
  }
});

// Cleanup Puppeteer browser on exit
process.on('exit', () => {
  // Note: closeBrowser is async but we can't await in exit handler
  // The browser will be cleaned up by the OS anyway
});

process.on('SIGINT', async () => {
  const { closeBrowser } = await import('./enrichment/index.js');
  await closeBrowser();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  const { closeBrowser } = await import('./enrichment/index.js');
  await closeBrowser();
  process.exit(0);
});

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  initializeDatabase,
  getStats,
  getAllLeads,
  getLeadsWithoutEmails,
  createSequence,
  getAllSequences,
  getSequenceById,
  getSequenceSteps,
  getEnrollmentStats,
  getSendStats,
  getLeadById,
  getLeadsNotEnrichedCount
} from './db/index.js';
import { discoverLeadsInMetro, discoverLeadsInMultipleMetros, testGoogleMapsConnection } from './discovery/index.js';
import { enrichAndSaveLead } from './enrichment/index.js';
import { scoreAllLeads, scoreAndSaveLead, explainScore } from './scoring/index.js';
import { exportLeadsToCSV } from './utils/csv-export.js';
import { METRO_AREAS, METRO_SUBLOCATIONS } from './utils/config.js';
import { verifyUnverifiedEmails, verifyEmail } from './verification/index.js';
import {
  processSendQueue,
  enrollLeadsInSequence,
  getSequenceEngineStatus,
  previewSequenceEmail,
  testSESConnection,
  isSESConfigured
} from './sequencer/index.js';
import { startServer } from './web/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize database
initializeDatabase();

const command = process.argv[2];
const args = process.argv.slice(3);

// Parse flags
const hasFlag = (flag: string) => args.includes(flag);
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
      const country = (argsWithoutFlags[1]?.toUpperCase() || 'US') as 'US' | 'CA';
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
      } else {
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
      const limit = parseInt(argsWithoutFlags[0]) || 10;
      const leadsToEnrich = getLeadsWithoutEmails().slice(0, limit);

      console.log(`Enriching ${leadsToEnrich.length} leads...`);

      let totalEmails = 0;
      let errors = 0;
      for (const lead of leadsToEnrich) {
        console.log(`Enriching: ${lead.business_name}`);
        try {
          const result = await enrichAndSaveLead(lead.id);
          totalEmails += result.emailsFound;
          if (result.emailsFound > 0) {
            console.log(`  ${result.emailsFound} emails found: [${result.emails.join(', ')}]`);
          } else {
            console.log(`  No emails found`);
          }
        } catch (err) {
          errors++;
          console.error(`  Error: ${(err as Error).message}`);
        }
      }

      console.log(`\nTotal emails found: ${totalEmails}`);
      if (errors > 0) console.log(`Errors: ${errors}`);
      break;
    }

    case 'score': {
      const leadId = args[0];

      if (leadId) {
        scoreAndSaveLead(leadId);
        console.log(explainScore(leadId));
      } else {
        console.log('Scoring all leads...');
        const result = scoreAllLeads(console.log);
        console.log('\n=== Scoring Complete ===');
        console.log(`Scored: ${result.scored} leads`);
        console.log(`Average score: ${result.avgScore}`);
        console.log('By tier:', result.byTier);
      }
      break;
    }

    case 'verify': {
      const emailOrLimit = argsWithoutFlags[0];

      // Check if it's an email address
      if (emailOrLimit && emailOrLimit.includes('@')) {
        console.log(`Verifying email: ${emailOrLimit}`);
        const result = await verifyEmail(emailOrLimit);
        console.log('\n=== Verification Result ===');
        console.log(`Status: ${result.status}`);
        console.log(`MX Records: ${result.mxRecords.join(', ') || 'None'}`);
        console.log(`Is Catch-All: ${result.isCatchAll}`);
        console.log(`Is Disposable: ${result.isDisposable}`);
        if (result.smtpResponse) console.log(`SMTP Response: ${result.smtpResponse}`);
        if (result.error) console.log(`Error: ${result.error}`);
      } else {
        // Batch verify
        const limit = parseInt(emailOrLimit) || 50;
        console.log(`Verifying up to ${limit} unverified emails...`);

        const result = await verifyUnverifiedEmails(limit, (completed, total, r) => {
          console.log(`[${completed}/${total}] ${r.email}: ${r.status}`);
        });

        console.log('\n=== Verification Complete ===');
        console.log(`Total: ${result.total}`);
        console.log(`Valid: ${result.valid}`);
        console.log(`Invalid: ${result.invalid}`);
        console.log(`Catch-All: ${result.catchAll}`);
        console.log(`Unknown: ${result.unknown}`);
      }
      break;
    }

    case 'sequence': {
      const subCommand = argsWithoutFlags[0];

      switch (subCommand) {
        case 'list': {
          const sequences = getAllSequences();
          console.log('=== Email Sequences ===\n');
          if (sequences.length === 0) {
            console.log('No sequences found. Use "sequence import" to create one.');
          }
          for (const seq of sequences) {
            console.log(`[${seq.status}] ${seq.name} (${seq.total_steps} steps)`);
            console.log(`    ID: ${seq.id}`);
          }
          break;
        }

        case 'import': {
          const templateFile = argsWithoutFlags[1];
          if (!templateFile) {
            console.log('Available templates:');
            console.log('  - agency-intro');
            console.log('  - solo-tutor-intro');
            console.log('\nUsage: npx tsx src/cli.ts sequence import agency-intro');
            break;
          }

          const templatePath = join(__dirname, '..', 'config', 'sequences', `${templateFile}.json`);
          try {
            const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
            const sequence = createSequence(template.name, template.steps);
            console.log(`Sequence created: ${sequence.name} (${sequence.id})`);
          } catch (error) {
            console.error(`Failed to import template: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
          break;
        }

        case 'show': {
          const sequenceId = argsWithoutFlags[1];
          if (!sequenceId) {
            console.error('Usage: npx tsx src/cli.ts sequence show <sequence_id>');
            break;
          }

          const sequence = getSequenceById(sequenceId);
          if (!sequence) {
            console.error(`Sequence not found: ${sequenceId}`);
            break;
          }

          const steps = getSequenceSteps(sequenceId);
          console.log(`\n=== ${sequence.name} ===`);
          console.log(`Status: ${sequence.status}`);
          console.log(`Total Steps: ${sequence.total_steps}\n`);

          for (const step of steps) {
            console.log(`--- Step ${step.step_number} (delay: ${step.delay_hours}h) ---`);
            console.log(`Subject: ${step.subject_template}`);
            console.log(`Body preview: ${step.body_template.substring(0, 100)}...`);
            console.log();
          }
          break;
        }

        case 'preview': {
          const sequenceId = argsWithoutFlags[1];
          const stepNum = parseInt(argsWithoutFlags[2]) || 1;
          const leadId = argsWithoutFlags[3];

          if (!sequenceId || !leadId) {
            console.error('Usage: npx tsx src/cli.ts sequence preview <sequence_id> <step_num> <lead_id>');
            break;
          }

          const preview = previewSequenceEmail(sequenceId, stepNum, leadId);
          if (!preview) {
            console.error('Failed to generate preview. Check sequence and lead IDs.');
            break;
          }

          const lead = getLeadById(leadId);
          console.log(`\n=== Email Preview for ${lead?.business_name || leadId} ===`);
          console.log(`Subject: ${preview.subject}\n`);
          console.log('Body:');
          console.log(preview.body.replace(/<[^>]*>/g, '')); // Strip HTML for display
          break;
        }

        case 'enroll': {
          const sequenceId = argsWithoutFlags[1];
          const limit = parseInt(argsWithoutFlags[2]) || 10;

          if (!sequenceId) {
            console.error('Usage: npx tsx src/cli.ts sequence enroll <sequence_id> [limit]');
            break;
          }

          console.log(`Enrolling up to ${limit} leads in sequence ${sequenceId}...`);
          const result = enrollLeadsInSequence(sequenceId, limit, (enrolled, lead) => {
            console.log(`[${enrolled}] Enrolled: ${lead.business_name}`);
          });

          console.log('\n=== Enrollment Complete ===');
          console.log(`Enrolled: ${result.enrolled}`);
          console.log(`Skipped: ${result.skipped}`);
          if (result.errors.length > 0) {
            console.log('Errors:', result.errors.slice(0, 5).join('\n'));
          }
          break;
        }

        case 'status': {
          const status = getSequenceEngineStatus();
          console.log('\n=== Sequence Engine Status ===');
          console.log(`SES Configured: ${status.sesConfigured ? 'Yes' : 'No'}`);
          console.log(`Sending Paused: ${status.sendingPaused ? `Yes (${status.pauseReason})` : 'No'}`);

          console.log('\nEnrollment Stats:');
          console.log(`  Active: ${status.enrollmentStats.active}`);
          console.log(`  Completed: ${status.enrollmentStats.completed}`);
          console.log(`  Replied: ${status.enrollmentStats.replied}`);
          console.log(`  Bounced: ${status.enrollmentStats.bounced}`);
          console.log(`  Unsubscribed: ${status.enrollmentStats.unsubscribed}`);

          console.log('\nSend Stats (7 days):');
          console.log(`  Sent: ${status.sendStats.sent}`);
          console.log(`  Delivered: ${status.sendStats.delivered}`);
          console.log(`  Bounced: ${status.sendStats.bounced} (${status.sendStats.bounceRate}%)`);
          console.log(`  Complained: ${status.sendStats.complained} (${status.sendStats.complaintRate}%)`);
          console.log(`  Opened: ${status.sendStats.opened}`);
          console.log(`  Clicked: ${status.sendStats.clicked}`);
          break;
        }

        default:
          console.log(`
Sequence Commands:
  sequence list                          List all sequences
  sequence import <template>             Import a sequence template
  sequence show <sequence_id>            Show sequence details
  sequence preview <seq_id> <step> <lead_id>  Preview email for a lead
  sequence enroll <sequence_id> [limit]  Enroll leads in sequence
  sequence status                        Show sequence engine status

Available Templates:
  - agency-intro
  - solo-tutor-intro
`);
      }
      break;
    }

    case 'send': {
      const subCommand = argsWithoutFlags[0];

      switch (subCommand) {
        case 'test': {
          const testEmail = argsWithoutFlags[1];
          if (!testEmail) {
            console.error('Usage: npx tsx src/cli.ts send test <your_email>');
            break;
          }

          if (!isSESConfigured()) {
            console.error('SES not configured. Add AWS credentials to .env');
            break;
          }

          console.log(`Sending test email to ${testEmail}...`);
          const result = await testSESConnection(testEmail);
          if (result.success) {
            console.log('Test email sent successfully!');
          } else {
            console.error(`Failed: ${result.error}`);
          }
          break;
        }

        case 'queue': {
          const limit = parseInt(argsWithoutFlags[1]) || 10;
          console.log(`Processing send queue (limit: ${limit})...`);

          const result = await processSendQueue(limit, (sent, total, lead) => {
            console.log(`[${sent}/${total}] Sent to: ${lead.business_name}`);
          });

          console.log('\n=== Send Queue Processed ===');
          console.log(`Processed: ${result.processed}`);
          console.log(`Sent: ${result.sent}`);
          console.log(`Failed: ${result.failed}`);
          console.log(`Skipped: ${result.skipped}`);
          if (result.errors.length > 0) {
            console.log('Errors:', result.errors.slice(0, 5).join('\n'));
          }
          break;
        }

        default:
          console.log(`
Send Commands:
  send test <email>      Send a test email to verify SES setup
  send queue [limit]     Process the send queue (default: 10)
`);
      }
      break;
    }

    case 'export': {
      const filter = args[0] as 'all' | 'scored' | 'verified' | 'hot' | 'warm' | 'with-emails' | 'valid' | 'invalid' | 'catch-all' | 'unknown' | 'unverified' || 'all';
      const result = exportLeadsToCSV({ filter });
      console.log(result);
      break;
    }

    case 'dashboard': {
      const port = parseInt(args[0]) || 3000;
      startServer(port);
      break;
    }

    case 'stats': {
      const stats = getStats();
      const enrollStats = getEnrollmentStats();
      const sendStats = getSendStats();
      const notEnriched = getLeadsNotEnrichedCount();

      console.log('=== Lead Database Stats ===');
      console.log(`Total leads: ${stats.totalLeads}`);
      console.log(`Not enriched: ${notEnriched}`);
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

      console.log('\n=== Sequence Stats ===');
      console.log(`Active enrollments: ${enrollStats.active}`);
      console.log(`Completed sequences: ${enrollStats.completed}`);
      console.log(`Replies: ${enrollStats.replied}`);
      console.log(`Bounced: ${enrollStats.bounced}`);

      console.log('\n=== Send Stats (7 days) ===');
      console.log(`Sent: ${sendStats.sent}`);
      console.log(`Bounce rate: ${sendStats.bounceRate}%`);
      console.log(`Complaint rate: ${sendStats.complaintRate}%`);
      break;
    }

    case 'list': {
      const limit = parseInt(args[0]) || 20;
      const leads = getAllLeads(limit);
      console.log(`=== Top ${leads.length} Leads ===\n`);
      for (const lead of leads) {
        console.log(`[${lead.score}] ${lead.business_name}`);
        console.log(`    ${lead.city}, ${lead.state_province} | ${lead.business_type} | ${lead.pipeline_stage}`);
        if (lead.website) console.log(`    ${lead.website}`);
        console.log();
      }
      break;
    }

    case 'help':
    default:
      console.log(`
Schedutor Outbound Sales Engine - CLI

Usage: npx tsx src/cli.ts <command> [args] [flags]

Phase 1 - Discovery & Scoring:
  test-connection              Test Google Maps API connection
  discover [city] [country]    Discover leads (default: first 5 US metros)
  enrich [limit]               Enrich leads with emails (default: 10)
  score [leadId]               Score all leads or explain specific lead score
  export [filter]              Export to CSV (all|with-emails|valid|invalid|catch-all|unknown|unverified|hot|warm)
  stats                        Show all statistics
  list [limit]                 List recent leads
  dashboard [port]             Start web dashboard (default: 3000)

Phase 2 - Sequencing & Verification:
  verify [email|limit]         Verify single email or batch (default: 50)
  sequence <subcommand>        Manage email sequences
  send <subcommand>            Send emails

Sequence Subcommands:
  sequence list                List all sequences
  sequence import <template>   Import a sequence template
  sequence show <id>           Show sequence details
  sequence preview <id> <step> <lead_id>   Preview email
  sequence enroll <id> [limit] Enroll leads in sequence
  sequence status              Show engine status

Send Subcommands:
  send test <email>            Send test email (verify SES setup)
  send queue [limit]           Process send queue

Flags:
  --deep                       Deep discovery: all 12 queries + pagination + suburbs

Examples:
  npx tsx src/cli.ts discover Toronto CA --deep
  npx tsx src/cli.ts enrich 50
  npx tsx src/cli.ts verify 100
  npx tsx src/cli.ts sequence import agency-intro
  npx tsx src/cli.ts sequence enroll <seq_id> 50
  npx tsx src/cli.ts send queue 10
`);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
