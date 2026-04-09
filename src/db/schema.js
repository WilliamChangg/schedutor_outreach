"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.initializeDatabase = initializeDatabase;
exports.closeDatabase = closeDatabase;
var better_sqlite3_1 = require("better-sqlite3");
var path_1 = require("path");
var url_1 = require("url");
var fs_1 = require("fs");
var __dirname = (0, path_1.dirname)((0, url_1.fileURLToPath)(import.meta.url));
var DATA_DIR = (0, path_1.join)(__dirname, '../../data');
var DB_PATH = (0, path_1.join)(DATA_DIR, 'schedutor.db');
// Ensure data directory exists
if (!(0, fs_1.existsSync)(DATA_DIR)) {
    (0, fs_1.mkdirSync)(DATA_DIR, { recursive: true });
}
exports.db = new better_sqlite3_1.default(DB_PATH);
// Enable foreign keys and WAL mode for better performance
exports.db.pragma('journal_mode = WAL');
exports.db.pragma('foreign_keys = ON');
// Run migrations for existing databases
function runMigrations() {
    // Check if enrichment_attempts column exists, if not add it
    var tableInfo = exports.db.prepare("PRAGMA table_info(lead_enrichment)").all();
    var columnNames = tableInfo.map(function (col) { return col.name; });
    if (!columnNames.includes('enrichment_attempts')) {
        exports.db.exec("\n      ALTER TABLE lead_enrichment ADD COLUMN enrichment_attempts INTEGER DEFAULT 0;\n      ALTER TABLE lead_enrichment ADD COLUMN last_enrichment_attempt_at TEXT;\n      ALTER TABLE lead_enrichment ADD COLUMN emails_found_count INTEGER DEFAULT 0;\n    ");
        console.log('Migration: Added enrichment tracking columns');
    }
}
function initializeDatabase() {
    // First create tables if they don't exist
    exports.db.exec("\n    -- Leads table: core lead data\n    CREATE TABLE IF NOT EXISTS leads (\n      id TEXT PRIMARY KEY,\n      business_name TEXT NOT NULL,\n      business_type TEXT CHECK(business_type IN ('agency', 'solo_tutor', 'franchise', 'online_platform')),\n      website TEXT,\n      phone TEXT,\n      address TEXT,\n      city TEXT,\n      state_province TEXT,\n      country TEXT CHECK(country IN ('US', 'CA')),\n      source TEXT CHECK(source IN ('google_maps', 'yelp', 'directory', 'manual')),\n      source_id TEXT,\n      google_rating REAL,\n      google_review_count INTEGER,\n      score INTEGER DEFAULT 0,\n      pipeline_stage TEXT DEFAULT 'new',\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL\n    );\n\n    -- Lead emails table: multiple emails per lead\n    CREATE TABLE IF NOT EXISTS lead_emails (\n      id TEXT PRIMARY KEY,\n      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,\n      email TEXT NOT NULL,\n      contact_name TEXT,\n      role TEXT CHECK(role IN ('owner', 'admin', 'info', 'unknown')),\n      verification_status TEXT DEFAULT 'unverified' CHECK(verification_status IN ('unverified', 'valid', 'invalid', 'catch_all', 'unknown')),\n      source TEXT CHECK(source IN ('scraped', 'pattern_guess', 'manual')),\n      is_primary INTEGER DEFAULT 0,\n      created_at TEXT NOT NULL\n    );\n\n    -- Sequences table: email sequence definitions\n    CREATE TABLE IF NOT EXISTS sequences (\n      id TEXT PRIMARY KEY,\n      name TEXT NOT NULL,\n      total_steps INTEGER NOT NULL,\n      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'archived')),\n      created_at TEXT NOT NULL,\n      updated_at TEXT NOT NULL\n    );\n\n    -- Sequence steps table: individual steps in a sequence\n    CREATE TABLE IF NOT EXISTS sequence_steps (\n      id TEXT PRIMARY KEY,\n      sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,\n      step_number INTEGER NOT NULL,\n      delay_hours INTEGER NOT NULL DEFAULT 0,\n      subject_template TEXT NOT NULL,\n      body_template TEXT NOT NULL,\n      created_at TEXT NOT NULL\n    );\n\n    -- Send log table: track all sent emails\n    CREATE TABLE IF NOT EXISTS send_log (\n      id TEXT PRIMARY KEY,\n      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,\n      email_id TEXT NOT NULL REFERENCES lead_emails(id) ON DELETE CASCADE,\n      sequence_id TEXT REFERENCES sequences(id) ON DELETE SET NULL,\n      step_number INTEGER,\n      ses_message_id TEXT,\n      status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'bounced', 'complained', 'opened', 'clicked')),\n      sent_at TEXT NOT NULL\n    );\n\n    -- Lead enrichment data table: additional scraped data\n    CREATE TABLE IF NOT EXISTS lead_enrichment (\n      id TEXT PRIMARY KEY,\n      lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,\n      has_multiple_tutors INTEGER,\n      existing_scheduling_tool TEXT,\n      linkedin_url TEXT,\n      facebook_url TEXT,\n      founded_year INTEGER,\n      team_size_estimate TEXT,\n      specialties TEXT,\n      raw_data TEXT,\n      enriched_at TEXT NOT NULL,\n      enrichment_attempts INTEGER DEFAULT 0,\n      last_enrichment_attempt_at TEXT,\n      emails_found_count INTEGER DEFAULT 0\n    );\n\n    -- Sequence enrollments table: track which leads are in which sequences\n    CREATE TABLE IF NOT EXISTS sequence_enrollments (\n      id TEXT PRIMARY KEY,\n      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,\n      sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,\n      email_id TEXT NOT NULL REFERENCES lead_emails(id) ON DELETE CASCADE,\n      current_step INTEGER DEFAULT 0,\n      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed')),\n      next_send_at TEXT,\n      enrolled_at TEXT NOT NULL,\n      completed_at TEXT,\n      UNIQUE(lead_id, sequence_id)\n    );\n\n    -- Discovery runs table: track discovery batches\n    CREATE TABLE IF NOT EXISTS discovery_runs (\n      id TEXT PRIMARY KEY,\n      source TEXT NOT NULL,\n      query TEXT NOT NULL,\n      location TEXT,\n      leads_found INTEGER DEFAULT 0,\n      leads_new INTEGER DEFAULT 0,\n      leads_duplicate INTEGER DEFAULT 0,\n      status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),\n      started_at TEXT NOT NULL,\n      completed_at TEXT,\n      error_message TEXT\n    );\n\n    -- Indexes for common queries\n    CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);\n    CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage);\n    CREATE INDEX IF NOT EXISTS idx_leads_city_state ON leads(city, state_province);\n    CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);\n    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);\n    CREATE INDEX IF NOT EXISTS idx_lead_emails_lead_id ON lead_emails(lead_id);\n    CREATE INDEX IF NOT EXISTS idx_lead_emails_verification ON lead_emails(verification_status);\n    CREATE INDEX IF NOT EXISTS idx_send_log_lead_id ON send_log(lead_id);\n    CREATE INDEX IF NOT EXISTS idx_send_log_status ON send_log(status);\n    CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_next_send ON sequence_enrollments(next_send_at);\n    CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_status ON sequence_enrollments(status);\n  ");
    console.log('Database initialized successfully');
    // Run migrations for existing databases
    runMigrations();
}
function closeDatabase() {
    exports.db.close();
}
