import { db, initializeDatabase } from '../src/db/schema.js';
import { ulid } from 'ulid';

initializeDatabase();

const testLeads = [
  { name: 'Test 1', email: 'williamc5298@gmail.com' },
  { name: 'Test 2', email: 'badchessplayerr@gmail.com' },
  { name: 'Test 3', email: 'badchessplayerrr@gmail.com' },
  { name: 'Test 4', email: 'schedutor@gmail.com' },
  { name: 'Test 5', email: 'sharonchen@gmx.de' },
];

const now = new Date().toISOString();

for (const test of testLeads) {
  const leadId = ulid();
  const emailId = ulid();

  // Insert lead with score 100 so it appears at top
  db.prepare(`
    INSERT INTO leads (id, business_name, business_type, source, score, pipeline_stage, created_at, updated_at)
    VALUES (?, ?, 'agency', 'manual', 100, 'scored', ?, ?)
  `).run(leadId, test.name, now, now);

  // Insert verified email
  db.prepare(`
    INSERT INTO lead_emails (id, lead_id, email, verification_status, source, is_primary, created_at)
    VALUES (?, ?, ?, 'valid', 'manual', 1, ?)
  `).run(emailId, leadId, test.email, now);

  console.log(`Added: ${test.name} -> ${test.email} (lead_id: ${leadId})`);
}

console.log('\nDone! Run "npx tsx src/cli.ts outreach status" to verify.');
