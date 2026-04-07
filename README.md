# Schedutor Outbound Sales Engine

Automated lead discovery and outreach system for Schedutor, targeting tutoring businesses and solo tutors across the US and Canada.

Built as a single TypeScript application backed by SQLite. No external SaaS dependencies beyond Amazon SES for email delivery and Google Maps API for structured place data.

---

## Architecture

    Discovery → Enrichment → Verification → Scoring → Sequencing → Reply Handling → Pipeline

Each stage is a standalone module with its own interface. The pipeline is orchestrated conversationally via OpenClaw or invoked directly as TypeScript functions.

---

## System Design

### Data Layer
- **SQLite** (better-sqlite3) — synchronous API, zero-ops, file-copy backups  
- **ULID** primary keys for chronological sortability without coordination  
- 6 core tables: `leads`, `lead_emails`, `sequences`, `sequence_steps`, `send_log`, plus pipeline state on the lead record  
- All timestamps ISO 8601 UTC  

---

### Lead Discovery

Two data source strategies with deduplication:

#### Google Maps Places API
- Parameterized search across metro areas with configurable query terms  
- Place Details extraction: website, phone, address, reviews, rating  
- Aggressive response caching to stay within $200/month free tier (~5k calls)  

#### Directory Scraping
- Browser-based navigation of tutoring directories (Wyzant, Thumbtack, Care.com)  
- HTML parsing via Cheerio  
- 2–5s delay between requests, robots.txt compliance, user-agent rotation  

#### Deduplication
- Primary: normalized `(business_name, city, state)`  
- Secondary: phone number and root domain  

---

### Email Verification

Self-hosted SMTP-level verification. No third-party verification API.

    DNS MX lookup → confirm mail exchange records exist
    SMTP EHLO → establish connection to MX server
    RCPT TO probe → check if recipient address is accepted
    Catch-all detection → test random address to identify catch-all domains
    Disposable check → filter known disposable email providers

- Max 10 concurrent SMTP connections  
- 1s delay between checks  
- Results: `valid | invalid | catch_all | unknown`  
- Only `valid` addresses enter send sequences  

---

### Lead Scoring

Rule-based engine with configurable JSON weights. 100-point scale.

| Signal | Points | Rationale |
|-------|--------|----------|
| Business type = agency | +20 | Higher LTV, complex scheduling needs |
| Has website | +10 | Established business |
| Multiple tutors mentioned on site | +15 | Multi-tutor ops need scheduling tools |
| No scheduling tool detected | +15 | No switching cost |
| Google rating ≥ 4.0 | +5 | Quality-conscious business |
| Review count ≥ 20 | +10 | Established client base |
| Verified email found | +10 | Reachable |
| Metro population > 500k | +5 | More scheduling complexity |
| Social media presence | +5 | Tech-savvy, likely SaaS adopter |

Weights are hot-configurable via `config/scoring-rules.json`.

---

### Sequence Engine

Multi-step email sequences with delivery safeguards:

- **Templating**: Mustache-style `{{variables}}` populated from lead data  
- **LLM Personalization**: Per-send personalized opening lines generated from lead website/specialties/location  
- **Scheduling**: Sends only during 9am–5pm in the lead's local timezone  
- **Rate Limiting**: Starts at 20/day for domain warm-up, scales by 20/day/week  
- **Circuit Breaking**: Auto-pause at >5% bounce rate or >0.1% complaint rate  
- **Tracking**: SES delivery/bounce/complaint via SNS webhooks; open/click via SES configuration sets  

---

### Reply Classification

IMAP polling matches inbound replies to sent messages via `In-Reply-To` / `References` headers and `ses_message_id`.

LLM classifies each reply:
- `interested` → move to qualified stage  
- `not_interested` → mark lost, stop sequence  
- `question` → flag for manual response  
- `out_of_office` → reschedule next step  
- `unsubscribe` → terminal state, never contact again  

---

### Pipeline

    new → scored → contacted → replied → qualified → demo → won/lost
            ↘ unsubscribed

Stage transitions are automatic except `demo → won/lost` (manual).

---


## Tech Stack

| Component | Choice | Why |
|----------|--------|-----|
| Language | TypeScript | Type safety across the full pipeline |
| Database | SQLite (better-sqlite3) | Zero ops, synchronous API, handles 10k+ leads trivially |
| Email Sending | Amazon SES | $0.10/1k emails, managed deliverability |
| Email Verification | Self-hosted SMTP check | Zero cost, MX + RCPT TO validation |
| Lead Discovery | Google Maps Places API + Cheerio | Structured data + HTML parsing |
| Personalization | LLM API | Email personalization, reply classification |

---

## Deliverability Engineering

Cold email deliverability is the highest-risk component. Mitigations:

1. **Separate sending domain** (`mail.schedutor.com`) — isolates primary domain reputation  
2. **Warm-up schedule** — 20/day → +20/day/week → full volume at week 5  
3. **Pre-send verification** — every address SMTP-verified; bounces removed immediately  
4. **Content quality** — LLM-personalized emails, <150 words, no spam trigger words  
5. **Automatic circuit breakers** — pause on bounce >5% or complaint >0.1%  
6. **Compliance** — CAN-SPAM (US) and CASL (CA) compliant  

---

## Legal

- **CAN-SPAM (US)**: B2B cold email is legal. Requires accurate sender info, physical address, unsubscribe mechanism.  
- **CASL (Canada)**: B2B exception applies — emails sent only to conspicuously published business addresses with relevant business content.  

---

## Performance Targets

| Metric | Target |
|-------|--------|
| Leads discovered/month | >2,000 |
| Email find rate | >50% |
| Delivery rate | >95% |
| Open rate | >25% |
| Reply rate | >3% |
| Bounce rate | <3% |
| Complaint rate | <0.05% |
| Monthly operating cost | <$15 for 10k leads |

---

Each command is idempotent and safe to run on a cron schedule.
