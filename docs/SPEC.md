# GLV Dashboard - Specification

## 1. Overview

### Problem Statement
Group Lead Volunteers (GLVs) in Scout groups are responsible for ensuring all section leaders and members have appropriate qualifications and training. The Scouts membership system (membership.scouts.org.uk) contains this data, but lacks a consolidated view for GLVs to quickly identify:
- Training/qualifications that are overdue
- Training/qualifications expiring soon
- Compliance status across multiple sections

### Goals
- Provide a single dashboard view of qualification status across all sections a GLV manages
- Highlight overdue and soon-to-expire qualifications
- No data persistence - live scraping using the user's own credentials
- Serverless hosting on AWS (low cost for low usage)
- Local development/debugging capability

### Non-Goals
- Storing user credentials
- Persisting scraped member data
- Modifying data in the Scouts membership system
- Managing qualifications (view-only)

---

## 2. Authentication Flow

### Scouts Membership Authentication
- **Primary URL**: https://membership.scouts.org.uk/
- **Identity Provider**: Azure AD B2C (https://prodscoutsb2c.b2clogin.com/)
- **Flow Type**: OAuth2/OIDC with redirects

### Implementation Approach
Use a headless browser (Playwright) to:
1. Navigate to membership.scouts.org.uk
2. Follow redirect to B2C login page
3. Submit user credentials (provided at runtime, not stored)
4. Handle OAuth redirects back to membership site
5. Maintain authenticated session for scraping

### Security Considerations
- Credentials are only used transiently during the Lambda invocation
- No credentials stored in AWS (passed from client per-request)
- HTTPS throughout
- Session cookies exist only for the duration of scraping

---

## 3. API Discovery

### Approach
The membership.scouts.org.uk site is a Single Page Application (SPA) driven by backend APIs. Rather than scraping HTML, we will:

1. **Authenticate** using Playwright to handle the B2C OAuth flow
2. **Intercept network traffic** during navigation to discover API endpoints
3. **Document the APIs** for direct use in our client

### Discovery Process
```
┌─────────────────────────────────────────────────────────────────┐
│  Playwright Script                                               │
│                                                                  │
│  1. Launch browser with request interception enabled            │
│  2. Navigate to membership.scouts.org.uk                        │
│  3. Complete B2C login flow                                     │
│  4. Navigate to Data Explorer (/#/dataexplorer)                 │
│     └─→ Log all XHR/Fetch requests                              │
│  5. Interact with UI (select team, view training)               │
│     └─→ Log all XHR/Fetch requests                              │
│  6. Navigate to Member Search (/#/membersearch)                 │
│     └─→ Log all XHR/Fetch requests                              │
│  7. Search for a member, view their learning record             │
│     └─→ Log all XHR/Fetch requests                              │
│  8. Output captured API documentation                           │
└─────────────────────────────────────────────────────────────────┘
```

### What We're Looking For
| Item | Example |
|------|---------|
| API Base URL | `https://membership.scouts.org.uk/api/` or similar |
| Auth mechanism | Bearer token, session cookie, API key header |
| Endpoints | `/api/teams`, `/api/members/{id}/learning`, etc. |
| Request format | Query params, JSON body |
| Response format | JSON structure with member/training data |

### Output
The discovery phase will produce `docs/API.md` containing:
- Complete list of relevant endpoints
- Authentication requirements
- Request/response examples (with PII redacted)
- Any rate limiting or pagination patterns observed

---

## 4. Data Model (Provisional)

### Members
| Field | Description |
|-------|-------------|
| id | Unique member identifier |
| name | Member's full name |
| role | Current role(s) in the group |
| section | Section(s) they belong to (Beavers, Cubs, Scouts, etc.) |

### Qualifications/Training
| Field | Description |
|-------|-------------|
| type | Qualification type (e.g., First Aid, Safeguarding, Safety) |
| status | Current status (Valid, Expiring, Expired, Not Started) |
| completedDate | When qualification was obtained |
| expiryDate | When qualification expires |
| required | Whether this is mandatory for the member's role |

### Sections
| Field | Description |
|-------|-------------|
| name | Section name (e.g., "1st Example Beavers") |
| type | Section type (Beavers, Cubs, Scouts, Explorers, Network) |
| members | List of members in this section |

---

## 5. Features (Provisional)

### Dashboard Views

#### 5.1 Summary View
- Total members across all sections
- Count of overdue qualifications (red)
- Count of expiring within 30 days (amber)
- Count of expiring within 90 days (yellow)
- Compliance percentage

#### 5.2 Section View
- Breakdown by section
- Each section shows its compliance status
- Expandable to show members

#### 5.3 Member View
- Individual member qualification status
- All qualifications with their expiry dates
- Visual indicators for status

#### 5.4 Alerts View
- List of all issues requiring attention
- Sorted by urgency (overdue first, then by expiry date)
- Filterable by section, qualification type

### Alert Thresholds
| Status | Condition | Indicator |
|--------|-----------|-----------|
| Overdue | Expired | Red |
| Critical | Expires within 30 days | Amber |
| Warning | Expires within 90 days | Yellow |
| Valid | More than 90 days remaining | Green |

### Client-Side Features
- Filtering by section, status, qualification type
- Sorting by name, expiry date, section
- Search by member name
- Export to CSV (client-side generation)

---

## 6. Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                          Browser                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  React SPA (S3 + CloudFront)                            │   │
│  │  - Login form                                            │   │
│  │  - Dashboard UI                                          │   │
│  │  - Client-side caching (sessionStorage)                  │   │
│  │  - Filtering/sorting (all client-side)                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS POST (credentials)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AWS API Gateway                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AWS Lambda (Container Image)                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Playwright authenticates with B2C                    │   │
│  │  2. Extracts auth token/session                          │   │
│  │  3. Calls Scouts APIs directly (discovered endpoints)    │   │
│  │  4. Transforms & returns structured JSON                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
          ▼                                       ▼
┌──────────────────────┐             ┌──────────────────────────┐
│ prodscoutsb2c        │             │ membership.scouts.org.uk │
│ .b2clogin.com        │             │ /api/* endpoints         │
│ (OAuth2 login)       │             │ (data fetching)          │
└──────────────────────┘             └──────────────────────────┘
```

### AWS Services

| Service | Purpose |
|---------|---------|
| **S3** | Host static frontend (React SPA) |
| **CloudFront** | CDN for frontend, HTTPS |
| **API Gateway** | REST API endpoint for scraper |
| **Lambda** | Scraper function (container image with Playwright) |
| **IAM** | Least-privilege roles for Lambda |
| **CloudWatch** | Logging and monitoring |

### Lambda Configuration
- **Runtime**: Container image (Node.js + Playwright + Chromium)
- **Memory**: 2048 MB (Playwright needs headroom)
- **Timeout**: 60-90 seconds (scraping multiple pages)
- **Architecture**: arm64 (cost-effective)

### Caching Strategy
1. **Browser-side**: After initial scrape, data cached in browser memory/sessionStorage
2. **Lambda warm instances**: Optional in-memory cache keyed by session, TTL ~5 minutes
3. **No persistent storage**: Data never written to disk/database

---

## 7. Local Development

### Setup
```
glv-dashboard/
├── frontend/           # React SPA
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── scraper/            # Lambda function
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── infrastructure/     # IaC (CDK or Terraform)
│   └── ...
├── docs/
│   └── SPEC.md
└── docker-compose.yml  # Local development
```

### Local Running
- **Frontend**: `npm run dev` (Vite dev server)
- **Scraper**: Docker container locally, or direct Node.js with Playwright
- **Integration**: docker-compose to run both together

### Testing
- **Unit tests**: Scraper parsing logic, dashboard components
- **Integration tests**: Mock responses from membership site
- **E2E tests**: Playwright tests against local frontend

---

## 8. Implementation Phases

### Phase 1: API Discovery
- [ ] Set up project structure (scraper with Playwright)
- [ ] Implement Playwright authentication with Scouts B2C
- [ ] Intercept network requests during navigation
- [ ] Navigate to Data Explorer, capture API calls
- [ ] Navigate to Member Search, capture API calls
- [ ] Document discovered endpoints (URLs, methods, headers, payloads)
- [ ] Document response structures (JSON schema)
- [ ] Identify authentication mechanism (Bearer token, cookies, etc.)

**Deliverable**: `docs/API.md` documenting all discovered endpoints

### Phase 2: Core API Client
- [ ] Implement authentication flow (Playwright → extract tokens)
- [ ] Build API client using discovered endpoints
- [ ] Fetch team/section data from Data Explorer API
- [ ] Fetch member learning records from Member Search API
- [ ] Structure data into defined model
- [ ] Error handling (auth failures, token expiry, rate limits)
- [ ] Local Docker setup

### Phase 3: Basic Dashboard
- [ ] React frontend scaffold
- [ ] Login form (credentials passed to API)
- [ ] Display scraped data in table format
- [ ] Basic status indicators (overdue/expiring/valid)

### Phase 4: Full Dashboard
- [ ] Summary view with statistics
- [ ] Section breakdown view
- [ ] Filtering and sorting
- [ ] Search functionality
- [ ] CSV export

### Phase 5: AWS Deployment
- [ ] Lambda container image build
- [ ] API Gateway configuration
- [ ] S3 + CloudFront for frontend
- [ ] Infrastructure as Code
- [ ] CI/CD pipeline

### Phase 6: Polish
- [ ] Loading states and progress indicators
- [ ] Error handling UI
- [ ] Mobile-responsive design
- [ ] Performance optimization

---

## 9. Open Questions

1. ~~**Pages to scrape**~~: Resolved - using APIs from Data Explorer and Member Search

2. **API structure**: What endpoints power the Data Explorer and Member Search? (Phase 1 deliverable)

3. **Qualification types**: What are all the qualification types we need to track? (First Aid, Safeguarding, DBS, etc.)

4. **Role requirements**: Do we need to encode which qualifications are required for which roles, or does the Scouts system already indicate this?

5. **Rate limiting**: Does the Scouts membership site have rate limiting we need to respect?

6. **Terms of Service**: Confirm API usage is acceptable.

---

## 10. Technical Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data access | API calls (not HTML scraping) | Scouts site is SPA with backend APIs - more reliable, faster |
| Headless browser | Playwright | Better Azure B2C support, modern API, good Lambda compatibility |
| Auth approach | Playwright for B2C, then direct API calls | Only use browser for OAuth flow, API for data |
| Frontend framework | React | Wide ecosystem, good for SPAs |
| Lambda packaging | Container image | Required for Playwright + Chromium bundle |
| IaC tool | TBD | CDK (if familiar) or Terraform |
| Language | TypeScript | Type safety, same language frontend/backend |
