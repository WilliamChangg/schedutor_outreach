#!/usr/bin/env node

// Global error handlers to prevent crashes from socket errors
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

process.on('exit', () => {});

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
  getLeadsNotEnrichedCount,
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
  sendTestSequenceEmail,
  sendTestSequenceAllSteps,
} from './sequencer/index.js';
import { testResendConnection, isResendConfigured } from './sequencer/resend-sender.js';
import { getSendingConfig, updateSendingConfig, getEffectiveDailyLimit } from './sequencer/sending-config.js';
import { startServer } from './web/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize database
initializeDatabase();

const command = process.argv[2];
const args = process.argv.slice(3);

// Parse flags
const hasFlag = (flag: string) => args.includes(flag);
const getFlagValue = (flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
};
const deepMode = hasFlag('--deep');
const argsWithoutFlags = args.filter((a) => !a.startsWith('--'));

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

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
        console.log('Running discovery on first 5 US metros...');
        const metros = METRO_AREAS.US.slice(0, 5);
        const result = await discoverLeadsInMultipleMetros(metros, 'US', options, console.log);
        console.log('\n=== Discovery Complete ===');
        console.log(`Total found: ${result.leadsFound}`);
        console.log(`New leads: ${result.leadsNew}`);
        console.log(`Duplicates: ${result.leadsDuplicate}`);
      } else {
        const metros = country === 'CA' ? METRO_AREAS.CA : METRO_AREAS.US;
        const metro = metros.find((m) => m.name.toLowerCase() === metroName.toLowerCase());

        if (!metro) {
          console.error(`Metro not found: ${metroName}`);
          console.log('Available metros:', metros.map((m) => m.name).join(', '));
          process.exit(1);
        }

        const metroKey = `${metro.name}, ${metro.state}`;
        const hasSublocations = METRO_SUBLOCATIONS[metroKey];
        if (deepMode && hasSublocations) {
          console.log(`Sublocations available: ${hasSublocations.map((s) => s.name).join(', ')}`);
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
          console.log(preview.body.replace(/<[^>]*>/g, ''));
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
          const config = getSendingConfig();

          console.log('\n=== Sequence Engine Status ===');
          console.log(`Resend Configured: ${status.resendConfigured ? '✓ Yes' : '✗ No'}`);
          console.log(`Sending Paused: ${status.sendingPaused ? `✗ Yes (${status.pauseReason})` : '✓ No'}`);
          console.log(`Within Sending Window: ${status.withinSendingWindow ? '✓ Yes' : `✗ No (${config.sendingWindowStartHour}:00–${config.sendingWindowEndHour}:00 ${config.timezone})`}`);

          console.log('\nSending Config:');
          console.log(`  Daily Limit: ${status.dailyLimit}/day`);
          console.log(`  Sent Today: ${status.sentToday}`);
          console.log(`  Remaining Today: ${status.remainingToday}`);
          console.log(`  Delay Between Sends: ${formatDuration(config.minDelayMs)}–${formatDuration(config.maxDelayMs)}`);
          console.log(`  Sending Window: ${config.sendingWindowStartHour}:00–${config.sendingWindowEndHour}:00 ${config.timezone}`);

          if (config.warmup) {
            console.log(`  Warmup Start: ${config.warmup.startDate}`);
            console.log(`  Warmup Schedule: ${config.warmup.schedule.map((s) => `Day ${s.day}: ${s.limit}/day`).join(', ')}`);
          }

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
  sequence list                                    List all sequences
  sequence import <template>                       Import a sequence template
  sequence show <sequence_id>                      Show sequence details
  sequence preview <seq_id> <step> <lead_id>       Preview email for a lead
  sequence enroll <sequence_id> [limit]            Enroll leads in sequence
  sequence status                                  Show engine status

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

          if (!isResendConfigured()) {
            console.error('Resend not configured. Set RESEND_API_KEY in .env');
            break;
          }

          console.log(`Sending test email to ${testEmail}...`);
          const result = await testResendConnection(testEmail);
          if (result.success) {
            console.log('✓ Test email sent successfully! Check your inbox.');
          } else {
            console.error(`✗ Failed: ${result.error}`);
          }
          break;
        }

        case 'test-sequence': {
          const toEmail = argsWithoutFlags[1];
          const sequenceId = argsWithoutFlags[2];
          const leadId = argsWithoutFlags[3];
          const stepNumber = parseInt(argsWithoutFlags[4]) || undefined;

          if (!toEmail || !sequenceId || !leadId) {
            console.error(`
Usage:
  npx tsx src/cli.ts send test-sequence <your_email> <sequence_id> <lead_id> [step]

Examples:
  # Send step 1 of a sequence using a specific lead's data:
  npx tsx src/cli.ts send test-sequence william@gmail.com seq_abc lead_xyz 1

  # Send all steps:
  npx tsx src/cli.ts send test-sequence william@gmail.com seq_abc lead_xyz
`);
            break;
          }

          if (!isResendConfigured()) {
            console.error('Resend not configured. Set RESEND_API_KEY in .env');
            break;
          }

          const lead = getLeadById(leadId);
          if (!lead) {
            console.error(`Lead not found: ${leadId}`);
            break;
          }

          if (stepNumber) {
            // Send a single step
            console.log(`Sending step ${stepNumber} of sequence ${sequenceId} to ${toEmail}...`);
            console.log(`Using lead data from: ${lead.business_name}\n`);

            const result = await sendTestSequenceEmail({
              to: toEmail,
              leadId,
              sequenceId,
              stepNumber,
            });

            if (result.success) {
              console.log(`✓ Sent! Subject: ${result.subject}`);
              console.log(`  Message ID: ${result.messageId}`);
            } else {
              console.error(`✗ Failed: ${result.error}`);
            }
          } else {
            // Send all steps
            const sequence = getSequenceById(sequenceId);
            if (!sequence) {
              console.error(`Sequence not found: ${sequenceId}`);
              break;
            }

            console.log(`Sending all ${sequence.total_steps} steps of "${sequence.name}" to ${toEmail}...`);
            console.log(`Using lead data from: ${lead.business_name}\n`);

            const results = await sendTestSequenceAllSteps({
              to: [toEmail],
              leadId,
              sequenceId,
              delayBetweenMs: 3000,
            });

            let successCount = 0;
            for (const result of results) {
              if (result.success) {
                successCount++;
                console.log(`  ✓ ${result.subject}`);
              } else {
                console.log(`  ✗ Failed: ${result.error}`);
              }
            }

            console.log(`\n${successCount}/${results.length} emails sent. Check your inbox!`);
          }
          break;
        }

        case 'queue': {
          const limit = parseInt(argsWithoutFlags[1]) || 10;

          if (!isResendConfigured()) {
            console.error('Resend not configured. Set RESEND_API_KEY in .env');
            break;
          }

          const dailyLimit = getEffectiveDailyLimit();
          console.log(`Processing send queue (batch limit: ${limit}, daily limit: ${dailyLimit}/day)...`);
          console.log();

          const result = await processSendQueue(limit, (sent, total, lead, delayMs) => {
            console.log(`[${sent}/${total}] Sent to: ${lead.business_name}`);
            if (sent < total) {
              console.log(`         Waiting ${formatDuration(delayMs)} before next send...`);
            }
          });

          console.log('\n=== Send Queue Processed ===');
          console.log(`Processed: ${result.processed}`);
          console.log(`Sent: ${result.sent}`);
          console.log(`Failed: ${result.failed}`);
          console.log(`Skipped: ${result.skipped}`);
          if (result.dailyLimitReached) {
            console.log(`⚠ Daily limit reached`);
          }
          if (result.errors.length > 0) {
            console.log('\nErrors:');
            for (const err of result.errors.slice(0, 10)) {
              console.log(`  - ${err}`);
            }
          }
          break;
        }

        case 'config': {
          const setting = argsWithoutFlags[1];
          const value = argsWithoutFlags[2];

          if (!setting) {
            const config = getSendingConfig();
            const effectiveLimit = getEffectiveDailyLimit();
            console.log('\n=== Sending Configuration ===');
            console.log(`Daily Limit (base): ${config.dailyLimit}/day`);
            console.log(`Daily Limit (effective): ${effectiveLimit}/day`);
            console.log(`Delay Range: ${formatDuration(config.minDelayMs)}–${formatDuration(config.maxDelayMs)}`);
            console.log(`Sending Window: ${config.sendingWindowStartHour}:00–${config.sendingWindowEndHour}:00 ${config.timezone}`);
            if (config.warmup) {
              console.log(`Warmup Start: ${config.warmup.startDate}`);
              console.log(`Warmup Schedule:`);
              for (const entry of config.warmup.schedule) {
                console.log(`  Day ${entry.day}: ${entry.limit}/day`);
              }
            } else {
              console.log('Warmup: disabled');
            }
            console.log(`\nTo change: npx tsx src/cli.ts send config <setting> <value>`);
            console.log('Settings: daily-limit, min-delay, max-delay, window-start, window-end');
            break;
          }

          if (!value) {
            console.error(`Usage: npx tsx src/cli.ts send config ${setting} <value>`);
            break;
          }

          const numVal = parseInt(value, 10);
          if (isNaN(numVal)) {
            console.error(`Invalid value: ${value} (must be a number)`);
            break;
          }

          switch (setting) {
            case 'daily-limit':
              updateSendingConfig({ dailyLimit: numVal });
              console.log(`✓ Daily limit set to ${numVal}/day`);
              break;
            case 'min-delay':
              updateSendingConfig({ minDelayMs: numVal * 1000 });
              console.log(`✓ Min delay set to ${numVal}s (${formatDuration(numVal * 1000)})`);
              break;
            case 'max-delay':
              updateSendingConfig({ maxDelayMs: numVal * 1000 });
              console.log(`✓ Max delay set to ${numVal}s (${formatDuration(numVal * 1000)})`);
              break;
            case 'window-start':
              updateSendingConfig({ sendingWindowStartHour: numVal });
              console.log(`✓ Sending window start set to ${numVal}:00`);
              break;
            case 'window-end':
              updateSendingConfig({ sendingWindowEndHour: numVal });
              console.log(`✓ Sending window end set to ${numVal}:00`);
              break;
            default:
              console.error(`Unknown setting: ${setting}`);
              console.log('Available: daily-limit, min-delay, max-delay, window-start, window-end');
          }
          break;
        }

        default:
          console.log(`
Send Commands:
  send test <email>                                         Send a test email to verify Resend setup
  send test-sequence <email> <seq_id> <lead_id> [step]     Send real sequence email(s) to yourself
  send queue [limit]                                        Process the send queue (default: 10)
  send config                                               Show sending configuration
  send config <setting> <value>                             Update a setting at runtime

Config Settings:
  daily-limit <n>        Max emails per day (default: 15)
  min-delay <seconds>    Min delay between sends (default: 45)
  max-delay <seconds>    Max delay between sends (default: 240)
  window-start <hour>    Start of sending window 0-23 (default: 8)
  window-end <hour>      End of sending window 0-23 (default: 18)

Examples:
  npx tsx src/cli.ts send test william@gmail.com
  npx tsx src/cli.ts send test-sequence william@gmail.com seq_abc lead_xyz
  npx tsx src/cli.ts send test-sequence william@gmail.com seq_abc lead_xyz 1
  npx tsx src/cli.ts send config daily-limit 25
  npx tsx src/cli.ts send queue 10
`);
      }
      break;
    }

    case 'export': {
      const filter =
        (args[0] as
          | 'all'
          | 'scored'
          | 'verified'
          | 'hot'
          | 'warm'
          | 'with-emails'
          | 'valid'
          | 'invalid'
          | 'catch-all'
          | 'unknown'
          | 'unverified') || 'all';
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
      const status = getSequenceEngineStatus();

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

      console.log('\n=== Sending Budget ===');
      console.log(`Daily limit: ${status.dailyLimit}/day`);
      console.log(`Sent today: ${status.sentToday}`);
      console.log(`Remaining: ${status.remainingToday}`);
      console.log(`Resend configured: ${status.resendConfigured ? '✓' : '✗'}`);
      console.log(`Within sending window: ${status.withinSendingWindow ? '✓' : '✗'}`);
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
  test-connection                Test Google Maps API connection
  discover [city] [country]      Discover leads (default: first 5 US metros)
  enrich [limit]                 Enrich leads with emails (default: 10)
  score [leadId]                 Score all leads or explain specific lead score
  export [filter]                Export to CSV (all|with-emails|valid|invalid|catch-all|unknown|unverified|hot|warm)
  stats                          Show all statistics
  list [limit]                   List recent leads
  dashboard [port]               Start web dashboard (default: 3000)

Phase 2 - Sequencing & Verification:
  verify [email|limit]           Verify single email or batch (default: 50)
  sequence <subcommand>          Manage email sequences
  send <subcommand>              Send emails

Sequence Subcommands:
  sequence list                  List all sequences
  sequence import <template>     Import a sequence template
  sequence show <id>             Show sequence details
  sequence preview <id> <step> <lead_id>   Preview email
  sequence enroll <id> [limit]   Enroll leads in sequence
  sequence status                Show engine status

Send Subcommands:
  send test <email>              Send test email (verify Resend setup)
  send test-sequence <email> <seq_id> <lead_id> [step]
                                 Send real sequence email(s) to yourself
  send queue [limit]             Process send queue
  send config                    Show sending config
  send config <setting> <value>  Update config at runtime

Flags:
  --deep                         Deep discovery: all 12 queries + pagination + suburbs

Examples:
  npx tsx src/cli.ts discover Toronto CA --deep
  npx tsx src/cli.ts enrich 50
  npx tsx src/cli.ts verify 100
  npx tsx src/cli.ts sequence import agency-intro
  npx tsx src/cli.ts sequence enroll <seq_id> 50
  npx tsx src/cli.ts send test william@gmail.com
  npx tsx src/cli.ts send test-sequence william@gmail.com <seq_id> <lead_id>
  npx tsx src/cli.ts send config daily-limit 25
  npx tsx src/cli.ts send queue 10
`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});