import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const DB_PATH = join(DATA_DIR, 'schedutor.db');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export const db: DatabaseType = new Database(DB_PATH);

// Enable foreign keys and WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run migrations for existing databases
function runMigrations(): void {
  // Check if enrichment_attempts column exists, if not add it
  const tableInfo = db.prepare("PRAGMA table_info(lead_enrichment)").all() as Array<{ name: string }>;
  const columnNames = tableInfo.map(col => col.name);

  if (!columnNames.includes('enrichment_attempts')) {
    db.exec(`
      ALTER TABLE lead_enrichment ADD COLUMN enrichment_attempts INTEGER DEFAULT 0;
      ALTER TABLE lead_enrichment ADD COLUMN last_enrichment_attempt_at TEXT;
      ALTER TABLE lead_enrichment ADD COLUMN emails_found_count INTEGER DEFAULT 0;
    `);
    console.log('Migration: Added enrichment tracking columns');
  }
}

export function initializeDatabase(): void {
  // First create tables if they don't exist
  db.exec(`
    -- Leads table: core lead data
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      business_type TEXT CHECK(business_type IN ('agency', 'solo_tutor', 'franchise', 'online_platform')),
      website TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      state_province TEXT,
      country TEXT CHECK(country IN ('US', 'CA')),
      source TEXT CHECK(source IN ('google_maps', 'yelp', 'directory', 'manual')),
      source_id TEXT,
      google_rating REAL,
      google_review_count INTEGER,
      score INTEGER DEFAULT 0,
      pipeline_stage TEXT DEFAULT 'new',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Lead emails table: multiple emails per lead
    CREATE TABLE IF NOT EXISTS lead_emails (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      contact_name TEXT,
      role TEXT CHECK(role IN ('owner', 'admin', 'info', 'unknown')),
      verification_status TEXT DEFAULT 'unverified' CHECK(verification_status IN ('unverified', 'valid', 'invalid', 'catch_all', 'unknown')),
      source TEXT CHECK(source IN ('scraped', 'pattern_guess', 'manual')),
      is_primary INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Sequences table: email sequence definitions
    CREATE TABLE IF NOT EXISTS sequences (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      total_steps INTEGER NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Sequence steps table: individual steps in a sequence
    CREATE TABLE IF NOT EXISTS sequence_steps (
      id TEXT PRIMARY KEY,
      sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
      step_number INTEGER NOT NULL,
      delay_hours INTEGER NOT NULL DEFAULT 0,
      subject_template TEXT NOT NULL,
      body_template TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- Send log table: track all sent emails
    CREATE TABLE IF NOT EXISTS send_log (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      email_id TEXT NOT NULL REFERENCES lead_emails(id) ON DELETE CASCADE,
      sequence_id TEXT REFERENCES sequences(id) ON DELETE SET NULL,
      step_number INTEGER,
      ses_message_id TEXT,
      status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'bounced', 'complained', 'opened', 'clicked')),
      sent_at TEXT NOT NULL
    );

    -- Lead enrichment data table: additional scraped data
    CREATE TABLE IF NOT EXISTS lead_enrichment (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
      has_multiple_tutors INTEGER,
      existing_scheduling_tool TEXT,
      linkedin_url TEXT,
      facebook_url TEXT,
      founded_year INTEGER,
      team_size_estimate TEXT,
      specialties TEXT,
      raw_data TEXT,
      enriched_at TEXT NOT NULL,
      enrichment_attempts INTEGER DEFAULT 0,
      last_enrichment_attempt_at TEXT,
      emails_found_count INTEGER DEFAULT 0
    );

    -- Sequence enrollments table: track which leads are in which sequences
    CREATE TABLE IF NOT EXISTS sequence_enrollments (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
      email_id TEXT NOT NULL REFERENCES lead_emails(id) ON DELETE CASCADE,
      current_step INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed')),
      next_send_at TEXT,
      enrolled_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(lead_id, sequence_id)
    );

    -- Discovery runs table: track discovery batches
    CREATE TABLE IF NOT EXISTS discovery_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      query TEXT NOT NULL,
      location TEXT,
      leads_found INTEGER DEFAULT 0,
      leads_new INTEGER DEFAULT 0,
      leads_duplicate INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error_message TEXT
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage);
    CREATE INDEX IF NOT EXISTS idx_leads_city_state ON leads(city, state_province);
    CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
    CREATE INDEX IF NOT EXISTS idx_lead_emails_lead_id ON lead_emails(lead_id);
    CREATE INDEX IF NOT EXISTS idx_lead_emails_verification ON lead_emails(verification_status);
    CREATE INDEX IF NOT EXISTS idx_send_log_lead_id ON send_log(lead_id);
    CREATE INDEX IF NOT EXISTS idx_send_log_status ON send_log(status);
    CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_next_send ON sequence_enrollments(next_send_at);
    CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_status ON sequence_enrollments(status);
  `);

  console.log('Database initialized successfully');

  // Run migrations for existing databases
  runMigrations();
}

export function closeDatabase(): void {
  db.close();
}
