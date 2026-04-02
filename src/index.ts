import { initializeDatabase, closeDatabase } from './db/index.js';

// Initialize database on module load
initializeDatabase();

// Re-export all modules
export * from './db/index.js';
export * from './discovery/index.js';
export * from './enrichment/index.js';
export * from './scoring/index.js';
export * from './utils/config.js';

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});
