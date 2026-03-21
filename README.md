# GLV Dashboard

A compliance dashboard for viewing training records, disclosures, and other membership data from the Scouts membership portal.

## Project Structure

```
glv-dashboard/
├── dashboard/     # React frontend (Vite + TypeScript + Tailwind)
├── backend/       # Express backend (TypeScript + Playwright)
└── scraper/       # API discovery tools
```

## Prerequisites

- [nvm](https://github.com/nvm-sh/nvm) (recommended) or Node.js 22+
- npm (included with Node.js)

## Development Setup

### 1. Set up Node.js

The required Node version is pinned in `.nvmrc`. With nvm:

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash

# Load nvm into the current shell (or open a new terminal and skip this step)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install and activate the correct Node version
nvm install   # reads .nvmrc
nvm use       # activates it in the current shell
```

### 2. Install dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install dashboard dependencies
cd ../dashboard
npm install
```

### 3. Start the backend

The backend provides authentication and API proxy services.

```bash
cd backend
npm run dev
```

This starts the backend on `http://localhost:3001` with hot-reload.

### 4. Start the dashboard

In a separate terminal:

```bash
cd dashboard
npm run dev
```

This starts the Vite dev server on `http://localhost:5173`.

### 4. Open the dashboard

Navigate to `http://localhost:5173` in your browser. You'll need valid Scouts membership portal credentials to log in.

## Available Scripts

### Backend (`/backend`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot-reload |
| `npm run build` | Build TypeScript to `dist/` |
| `npm start` | Run production build |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |

### Dashboard (`/dashboard`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |

## Testing

Both projects use Vitest for testing.

```bash
# Run all tests
cd dashboard && npm test
cd ../backend && npm test

# Run with coverage
npm run test:coverage
```

## Security

This project uses [CodeQL](https://codeql.github.com/) for automated security vulnerability scanning. CodeQL runs:
- On every push to `main`
- On every pull request
- Weekly on a schedule

See [docs/CODEQL.md](docs/CODEQL.md) for more details on the security scanning setup.

## Environment Variables

### Dashboard

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_BACKEND_URL` | `http://localhost:3001` | Backend API URL |
| `VITE_OTEL_ENABLED` | _(unset)_ | Set to `true` to enable frontend OpenTelemetry tracing |

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `OTEL_ENABLED` | _(unset)_ | Set to `true` to enable OpenTelemetry tracing |
| `GOOGLE_CLOUD_PROJECT` | _(unset)_ | GCP project ID — enables Cloud Trace export and log correlation |
| `DEBUG` | _(unset)_ | Set to `true` to emit debug-level log output |

## Production Deployment

Both services are live — no manual setup required.

- **Backend**: Cloud Run at `https://glv-backend-gxoc276j2a-ew.a.run.app`
  - Deployed via `cloudbuild.yaml` (manual) or `.github/workflows/deploy-backend.yml`
  - `CORS_ORIGIN` is set to `https://glv-dashboard.web.app` in the Cloud Run env vars
- **Dashboard**: Firebase Hosting at `https://glv-dashboard.web.app`
  - Merges to `main` auto-deploy via `.github/workflows/firebase-hosting-merge.yml`
  - PRs get a preview channel deploy via `.github/workflows/firebase-hosting-pull-request.yml`
  - `VITE_BACKEND_URL` is injected as the Cloud Run URL in the deploy workflow

### Metrics & Telemetry

The backend ships structured observability that routes automatically to Google Cloud when deployed.

- **Logs**: [Google Cloud Console: Observability/Logs](https://console.cloud.google.com/run/detail/europe-west1/glv-backend/observability/logs?project=glv-dashboard)
- **Traces**: [Google Cloud Console: Trace Explorer](https://console.cloud.google.com/traces/explorer;query=%7B%22plotType%22:%22HEATMAP%22,%22pointConnectionMethod%22:%22GAP_DETECTION%22,%22targetAxis%22:%22Y1%22,%22traceQuery%22:%7B%22resourceContainer%22:%22projects%2Fglv-dashboard%22,%22spanDataValue%22:%22SPAN_DURATION%22,%22spanFilters%22:%7B%22apphubServices%22:%5B%5D,%22apphubWorkloads%22:%5B%5D,%22applicationIds%22:%5B%5D,%22attributes%22:%5B%5D,%22displayNames%22:%5B%5D,%22isRootSpan%22:false,%22kinds%22:%5B%5D,%22maxDuration%22:%22%22,%22minDuration%22:%22%22,%22services%22:%5B%5D,%22status%22:%5B%5D%7D%7D%7D;duration=P1D?project=glv-dashboard)

#### Cloud Logging (backend, automatic)

Cloud Run captures all stdout/stderr. `backend/src/logger.ts` detects the `K_SERVICE` env var set by Cloud Run and switches to structured JSON output with the fields Cloud Logging expects:

| Field | Purpose |
|-------|---------|
| `severity` | Maps to Cloud Logging severity levels (`INFO`, `ERROR`, …) |
| `message` | Human-readable log line |
| `logging.googleapis.com/trace` | Links the log entry to a Cloud Trace span |
| `logging.googleapis.com/spanId` | Links the log entry to the specific span |

View logs: [Cloud Logging console](https://console.cloud.google.com/logs/query) → filter by `resource.type="cloud_run_revision" resource.labels.service_name="glv-backend"`.

Enable debug-level output by setting `DEBUG=true` in the Cloud Run environment.

#### Cloud Trace (backend, opt-in)

`backend/src/tracing.ts` detects `OTEL_ENABLED=true` and exports OpenTelemetry spans directly to **Google Cloud Trace** via `@google-cloud/opentelemetry-cloud-trace-exporter`. This is enabled automatically in production by `cloudbuild.yaml` alongside `GOOGLE_CLOUD_PROJECT`.

Manual spans cover the slow paths: Playwright browser launch, portal navigation, B2C OAuth, token capture, and per-member learning-record lookups (with concurrency metadata).

View traces: [Cloud Trace console](https://console.cloud.google.com/traces).

#### Log ↔ Trace correlation

When `GOOGLE_CLOUD_PROJECT` is set, backend log entries include the full Cloud Trace resource name. Cloud Logging displays a **"View trace"** link directly on each log line.

#### Cloud Monitoring

No custom metrics are exported. Cloud Run emits built-in metrics (request count, latency, instance count) automatically — view them in [Cloud Monitoring](https://console.cloud.google.com/monitoring).

#### Local tracing (Jaeger)

```bash
docker compose up -d                               # start Jaeger at http://localhost:16686
cd backend && npm run dev:traced                   # backend with tracing → Jaeger
cd dashboard && VITE_OTEL_ENABLED=true npm run dev # frontend with tracing → Jaeger
```
