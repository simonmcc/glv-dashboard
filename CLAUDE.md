# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scout group compliance dashboard for viewing training records, disclosures, and membership data scraped from the Scouts membership portal (membership.scouts.org.uk). There is no public API — all data access requires web scraping with authenticated sessions via Playwright.

## Architecture

Three independent Node.js packages (no monorepo tooling — each has its own `node_modules`):

- **`backend/`** — Express 5 proxy server (TypeScript). Handles Playwright-based authentication against Azure AD B2C and proxies API calls to `tsa-memportal-prod-fun01.azurewebsites.net`. Key files: `src/server.ts` (routes), `src/auth-service.ts` (Playwright auth + API functions).
- **`dashboard/`** — React 19 SPA (Vite + TypeScript + Tailwind CSS 4). Calls backend proxy for all data. Key files: `src/api-client.ts` (all Scouts API interactions), `src/types.ts` (data types), `src/components/Dashboard.tsx` (main view orchestrator).
- **`scraper/`** — Standalone Playwright tool for API endpoint discovery. Run ad-hoc to capture network traffic and document new endpoints.

### Data Flow

```
Browser → Dashboard (React) → Backend proxy (/api/proxy) → Scouts Azure Functions API
                              Backend (/auth/login) → Playwright → Azure B2C OAuth → Bearer token
```

The frontend never calls Scouts APIs directly. All requests go through the backend proxy with a Bearer token obtained via Playwright browser automation.

### Key Convention: Space-Separated Field Names

API responses from Scouts use **space-separated field names** (e.g., `"First name"`, `"Membership number"`, `"Expiry date"`). Types in `dashboard/src/types.ts` reflect this exactly. Do not convert to camelCase.

## Commands

### Backend (`backend/`)
```bash
cd backend && npm install          # install deps
cd backend && npm run dev          # dev server with hot-reload (port 3001)
cd backend && npm run dev:traced   # dev server with OpenTelemetry tracing enabled
cd backend && npm test             # run tests (vitest)
cd backend && npm run test:watch   # tests in watch mode
cd backend && npm run test:coverage # tests with v8 coverage
cd backend && npm run build        # compile TypeScript to dist/
```

### Dashboard (`dashboard/`)
```bash
cd dashboard && npm install        # install deps
cd dashboard && npm run dev        # Vite dev server (port 5173)
cd dashboard && npm test           # run tests (vitest + jsdom)
cd dashboard && npm run test:watch # tests in watch mode
cd dashboard && npm run test:coverage # tests with v8 coverage
cd dashboard && npm run lint       # ESLint
cd dashboard && npm run build      # TypeScript check + Vite production build
```

### Scraper (`scraper/`)
```bash
cd scraper && npm install
cd scraper && HEADLESS=false npm run discover   # run API discovery with visible browser
```

### Running a single test
```bash
cd backend && npx vitest run src/server.test.ts
cd dashboard && npx vitest run src/utils.test.ts
```

## Testing

- Both `backend/` and `dashboard/` use **Vitest**.
- Backend tests use `supertest` against the Express app (node environment).
- Dashboard tests use `jsdom` environment with `@testing-library/react` and `@testing-library/jest-dom`. Setup file: `src/test/setup.ts`.
- Test files live alongside source files (`*.test.ts`).
- CI runs tests and coverage for both packages, plus lint and build for dashboard (`.github/workflows/test.yml`).

## Environment Variables

- `SCOUT_USERNAME` / `SCOUT_PASSWORD` — Scouts portal credentials (loaded via direnv + 1Password in `.envrc`)
- `VITE_BACKEND_URL` — Backend URL for dashboard (default: `http://localhost:3001`)
- `PORT` — Backend port (default: `3001`)
- `CORS_ORIGIN` — Backend CORS origin (default: `http://localhost:5173`)
- `HEADLESS` — Set to `false` for visible browser in scraper/auth
- `OTEL_ENABLED` — Set to `true` to enable backend OpenTelemetry tracing (or use `npm run dev:traced`)
- `VITE_OTEL_ENABLED` — Set to `true` to enable frontend browser tracing


## Tracing

OpenTelemetry distributed tracing is available for both backend and frontend, exporting to Jaeger via OTLP HTTP.

```bash
docker compose up -d                              # start Jaeger (UI at http://localhost:16686)
cd backend && npm run dev:traced                   # backend with tracing
cd dashboard && VITE_OTEL_ENABLED=true npm run dev # frontend with tracing
```

Tracing is opt-in and has zero overhead when disabled. Manual spans instrument the slow Playwright auth flow and per-member API loops in `backend/src/auth-service.ts`. Frontend fetch calls are auto-instrumented with W3C trace context propagation to the backend.

## Backend API Endpoints

- `POST /auth/login` — Authenticate via Playwright, returns Bearer token + contactId
- `POST /api/proxy` — Forward requests to Scouts API with token
- `POST /api/check-learning` — Check learning records by membership numbers

## Project Rules

- Create a feature branch for all changes
- Use `gh pr create` to open a pull request
- All changes must be reviewed and merged via GitHub PR

### Critical Rules

1. **NEVER commit or push directly to main** - ALL changes go through a PR, no exceptions. This includes code, documentation, config files, and any other modifications. Always create a feature branch first, commit there, and open a PR.

2. **Always use worktrees** - Never work directly in the main repo directory. Each ticket gets its own worktree.