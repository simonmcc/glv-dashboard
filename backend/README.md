# GLV Dashboard Backend

Express proxy server that handles authentication and API proxying for the GLV Dashboard. Authenticates against the Scouts membership portal via Playwright browser automation.

## Quick Start

```bash
npm install
npm run dev         # Start server on http://localhost:3001
```

## Mock Mode

Run the backend with mock data instead of connecting to the real Scouts API:

```bash
MOCK_MODE=true npm run dev
```

By default, mock responses include a 1 second delay to simulate real API latency. Customize this with `MOCK_DELAY_MS`:

```bash
MOCK_MODE=true MOCK_DELAY_MS=500 npm run dev   # 500ms delay
MOCK_MODE=true MOCK_DELAY_MS=0 npm run dev     # No delay
```

Mock mode provides realistic sample data for all dashboard views:

| Table | Mock Data |
|-------|-----------|
| Learning Compliance | 8 members x 4 learning types with various statuses |
| Joining Journey | 4 members with outstanding onboarding actions |
| Disclosure Compliance | 8 members with DBS/AccessNI/PVG records |
| Appointments | 8 members with various roles |
| Suspensions | 1 suspended member |
| Team Reviews | 8 members with scheduled/overdue reviews |
| Permits | 5 members with Nights Away/Water/Climbing permits |
| Awards | 4 members with Wood Badge/Merit awards |

Mock data uses a seeded random number generator for consistent, reproducible results across restarts.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot-reload |
| `npm run dev:traced` | Dev server with OpenTelemetry tracing enabled |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server from `dist/` |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `MOCK_MODE` | `false` | Use mock data instead of real API |
| `MOCK_DELAY_MS` | `1000` | Simulated response delay in mock mode (ms) |
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry tracing |
| `HEADLESS` | `true` | Set to `false` for visible Playwright browser |

## API Endpoints

### `GET /health`
Health check endpoint.

**Response:**
```json
{ "status": "ok", "timestamp": "2025-01-15T10:30:00.000Z" }
```

### `POST /auth/login`
Authenticate with Scouts portal credentials via Playwright.

**Request:**
```json
{ "username": "user@example.com", "password": "password" }
```

**Response:**
```json
{ "success": true, "token": "Bearer ...", "contactId": "abc123" }
```

### `POST /api/proxy`
Forward requests to the Scouts API with authentication.

**Request:**
```json
{
  "endpoint": "/portal/OData/GetData",
  "method": "POST",
  "token": "Bearer ...",
  "body": { "table": "LearningComplianceDashboardView" }
}
```

**Response:** Proxied response from Scouts API.

### `POST /api/check-learning`
Fetch learning module details by membership numbers.

**Request:**
```json
{
  "token": "Bearer ...",
  "membershipNumbers": ["1234567", "7654321"]
}
```

**Response:**
```json
{
  "success": true,
  "members": [
    {
      "membershipNumber": "1234567",
      "modules": [
        { "title": "Safety", "currentLevel": "Achieved skill", "expiryDate": "01/15/2026 00:00:00" }
      ]
    }
  ]
}
```

## Tracing

Enable distributed tracing with Jaeger:

```bash
# Start Jaeger (from project root)
docker compose up -d

# Run backend with tracing
npm run dev:traced
```

View traces at http://localhost:16686

The backend instruments:
- Express HTTP requests (auto-instrumented)
- Playwright authentication flow (manual spans)
- Per-member API calls in check-learning (manual spans)

## Testing

```bash
npm test                           # Run all tests
npm run test:watch                 # Watch mode
npm run test:coverage              # Coverage report
npx vitest run src/server.test.ts  # Single test file
```

Tests use Vitest with supertest for HTTP assertions. Mocks are set up for `auth-service.ts` to avoid Playwright in tests.

## Deployment (Google Cloud Run)

The backend is designed to deploy to Cloud Run with Playwright/Chromium for browser automation.

### Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and authenticated
- A GCP project with Cloud Run and Cloud Build APIs enabled

### Deploy via Cloud Build

```bash
cd backend
gcloud builds submit --config cloudbuild.yaml
```

This will:

1. Build a Docker image with Playwright and Chromium
2. Push to Google Container Registry
3. Deploy to Cloud Run (europe-west1, 1Gi memory, 0-3 instances)

### Build and test locally

```bash
# Build the image
docker build -t glv-backend .

# Run locally
docker run -p 8080:8080 \
  -e CORS_ORIGIN=http://localhost:5173 \
  -e MOCK_MODE=true \
  glv-backend

# Test health endpoint
curl http://localhost:8080/health
```

### Production environment variables

Set these in Cloud Run console or via `gcloud run deploy`:

| Variable | Required | Description |
|----------|----------|-------------|
| `CORS_ORIGIN` | Yes | Frontend URL (e.g., `https://glv-dashboard.web.app`) |

User credentials are provided at login time via the dashboard, not stored in the backend.

### Resource configuration

The default Cloud Run config uses:

- **Memory:** 1Gi (Chromium requires ~500MB)
- **CPU:** 1 vCPU
- **Timeout:** 300s (auth can take 30-60s)
- **Concurrency:** 10 requests per instance
- **Instances:** 0-3 (scale to zero when idle)
