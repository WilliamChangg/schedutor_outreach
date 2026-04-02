# Schedutor Outbound Sales Engine

An automated lead discovery and outreach system for Schedutor, targeting tutoring businesses and solo tutors across the US and Canada.

## Overview

This skill helps you find, enrich, score, and manage tutoring business leads for outbound sales. It integrates with Google Maps Places API for discovery and scrapes websites for contact information.

## Setup

### Prerequisites

1. **Google Maps API Key**: Required for lead discovery
   ```bash
   export GOOGLE_MAPS_API_KEY="your-api-key"
   ```

2. **Install dependencies** (if not already done):
   ```bash
   cd ~/.openclaw/workspace/skills/schedutor-outbound
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

## Commands

### Discovery

**Find tutoring leads in a specific city:**
```
"Find tutoring agencies in Los Angeles"
"Discover tutors in Toronto, Canada"
"Search for tutoring centers in New York"
```

**Run discovery across multiple metros:**
```
"Run discovery in the top 5 US metros"
"Find leads in all Canadian cities"
```

### Enrichment

**Enrich leads with contact information:**
```
"Enrich all leads without emails"
"Scrape contact info for recent leads"
"Find emails for leads in California"
```

### Scoring

**Score leads to prioritize outreach:**
```
"Score all unscored leads"
"Show me the top 20 hot leads"
"Explain the score for [lead name]"
```

### Export

**Export leads for review:**
```
"Export all leads to CSV"
"Export hot leads to CSV"
"Export leads with verified emails"
```

### Stats & Reporting

**View pipeline statistics:**
```
"Show me lead stats"
"How many leads do we have?"
"What's our email find rate?"
```

## Data Model

### Lead Fields
- `business_name`: Company or tutor name
- `business_type`: agency | solo_tutor | franchise | online_platform
- `website`, `phone`, `address`: Contact info
- `city`, `state_province`, `country`: Location
- `google_rating`, `google_review_count`: Google Maps data
- `score`: Computed lead score (0-100)
- `pipeline_stage`: new | scored | contacted | replied | qualified | demo | won | lost

### Scoring Rules (100-point scale)
- Business type = agency: +20 points
- Has website: +10 points
- Multiple tutors detected: +15 points
- No existing scheduling tool: +15 points
- High Google rating (4.0+): +5 points
- 20+ Google reviews: +10 points
- Verified email found: +10 points
- Social media presence: +5 points
- Franchise location: -10 points

### Score Tiers
- **Hot** (70+): Priority outreach
- **Warm** (50-69): Good fit
- **Cool** (30-49): Worth trying
- **Cold** (0-29): Low priority

## Architecture

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
└── schedutor.db          # SQLite database
```

## Rate Limiting

- Google Maps API: 200ms between calls, max 50/minute
- Website scraping: 2s between requests, max 20/minute
- Respects robots.txt and implements polite delays

## Phase 1 Success Criteria

- [ ] 500+ unique tutoring leads discovered across 5 US metros
- [ ] Email addresses found for 40%+ of leads
- [ ] Scoring engine working with configurable rules
- [ ] CSV export for manual review

## Cost Estimates

- Google Maps API: Free tier ($200/month credit)
- Email discovery: $0 (self-hosted scraping)
- Database: $0 (SQLite, local storage)
