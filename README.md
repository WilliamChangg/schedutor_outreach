# Schedutor Outbound Sales Engine

Automated lead discovery and outreach system for Schedutor, targeting tutoring businesses and solo tutors across the US and Canada.

## Quick Start

```bash
# Install dependencies
npm install

# Set your Google Maps API key
export GOOGLE_MAPS_API_KEY="your-api-key"

# Run discovery
npx tsx src/cli.ts discover

# Check stats
npx tsx src/cli.ts stats
```

## Phase 1 Features (Discovery + Scoring)

- **Lead Discovery**: Google Maps Places API integration for finding tutoring businesses
- **Email Extraction**: Website scraping to find contact emails
- **Lead Scoring**: Configurable 100-point scoring system
- **CSV Export**: Export leads for manual review

## CLI Commands

```bash
# Test API connection
npx tsx src/cli.ts test-connection

# Discover leads
npx tsx src/cli.ts discover "New York" US
npx tsx src/cli.ts discover Toronto CA
npx tsx src/cli.ts discover  # Run on first 5 US metros

# Enrich leads with emails
npx tsx src/cli.ts enrich 50

# Score leads
npx tsx src/cli.ts score

# Export to CSV
npx tsx src/cli.ts export hot
npx tsx src/cli.ts export all

# View stats
npx tsx src/cli.ts stats

# List leads
npx tsx src/cli.ts list 20
```

## Project Structure

```
src/
├── db/           # SQLite schema and queries
├── discovery/    # Google Maps API integration
├── enrichment/   # Website scraping, email extraction
├── scoring/      # Lead scoring engine
├── utils/        # Config, rate limiting, CSV export
config/
├── scoring-rules.json    # Configurable scoring weights
data/
└── schedutor.db          # SQLite database (auto-created)
```

## Scoring Rules

| Signal | Points | Rationale |
|--------|--------|-----------|
| Business type = agency | +20 | Higher LTV, complex scheduling needs |
| Has website | +10 | Established business |
| Multiple tutors detected | +15 | Need scheduling tools most |
| No existing scheduling tool | +15 | Green field opportunity |
| High Google rating (4.0+) | +5 | Quality-conscious business |
| 20+ Google reviews | +10 | Established client base |
| Verified email found | +10 | Can reach them |
| Social media presence | +5 | Tech-savvy |
| Franchise location | -10 | Corporate tools, harder sell |

## Coming in Phase 2

- Email verification (SMTP checking)
- Amazon SES integration for sending
- Email sequence engine
- Personalization with LLM

## Coming in Phase 3

- Reply detection via IMAP
- LLM reply classification
- Pipeline management
- Daily digests

## License

Confidential - Schedutor
