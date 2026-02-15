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
