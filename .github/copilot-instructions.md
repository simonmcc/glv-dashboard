# GLV Dashboard - AI Agent Instructions

## Project Overview

This is a Scout group compliance dashboard with a **3-tier architecture designed for scraping, not traditional APIs**:

- **`scraper/`** - Playwright-based API discovery tool that captures network traffic from the Scouts membership portal
- **`backend/`** - Express proxy server that handles authentication and forwards API calls (uses Playwright for auth)
- **`dashboard/`** - React/TypeScript frontend using Vite and Tailwind CSS

**Key Insight**: The Scouts membership portal has no public API - all data access requires web scraping with authenticated sessions.

## Critical Patterns

### Authentication Flow
Authentication is **stateless and credential-based** - no persistent sessions:
```typescript
// Each request requires fresh Playwright authentication
const result = await authenticate(username, password);
// Returns Bearer token for subsequent API calls
```

### API Communication Pattern
All frontend API calls route through the backend proxy to avoid CORS:
```typescript
// Frontend never calls Scouts APIs directly
const response = await fetch(`${BACKEND_URL}/api/proxy`, {
  body: JSON.stringify({ endpoint, body, token })
});
```

### Data Model Convention
API responses use **space-separated field names** (e.g., `"First name"`, `"Membership number"`), not camelCase. This is consistent across all Scouts API endpoints.

## Development Workflows

### Starting Development
```bash
# Backend (required first)
cd backend && npm run dev  # Port 3001

# Frontend
cd dashboard && npm run dev  # Port 5173

# API Discovery (when needed)
cd scraper && HEADLESS=false npm run discover
```

### Key Environment Variables
- `SCOUT_USERNAME` / `SCOUT_PASSWORD` - Credentials for scraper
- `VITE_BACKEND_URL` - Frontend backend connection (defaults to localhost:3001)
- `CORS_ORIGIN` - Backend CORS configuration

### Testing Strategy
- **Manual testing via browser console**: `window.apiClient` and `window.testTable(tableName)` exposed in Dashboard component
- **Backend testing**: `npm run test` in backend/ (uses real credentials)
- **No unit tests** - integration testing preferred due to scraping nature

## Architecture Decisions

### Why Playwright for Authentication?
The Scouts portal uses Azure B2C OAuth with complex redirects that can't be easily replicated with simple HTTP requests. Playwright handles the full browser-based authentication flow.

### Why Backend Proxy?
- **CORS avoidance** - Scouts APIs don't support browser CORS
- **Token management** - Centralizes Playwright authentication
- **Rate limiting** - Single point for request throttling

### File Organization Patterns
- **Component files** have detailed JSDoc headers explaining purpose
- **API client** (`dashboard/src/api-client.ts`) centralizes all Scouts API interactions
- **Types** (`dashboard/src/types.ts`) reflect exact API response structure with spaces
- **Service separation** - auth logic isolated in `backend/src/auth-service.ts`

## Common Tasks

### Adding New Data Sources
1. Use scraper to discover new endpoints: `HEADLESS=false npm run discover`
2. Add types to `dashboard/src/types.ts` with exact field names from API
3. Extend `ScoutsApiClient` in `dashboard/src/api-client.ts`
4. Update backend proxy if new authentication patterns needed

### Debugging Authentication Issues
- Check `backend/src/auth-service.ts` for Playwright selectors
- Enable visible browser: `HEADLESS=false` in environment
- Monitor network requests in browser dev tools during scraper runs

### Working with Scouts API Data
- Always use exact field names from API responses (with spaces)
- Handle nullable dates and optional fields consistently
- Reference `docs/API.md` for discovered endpoint patterns

Remember: This is a **scraping-first architecture** - conventional REST API patterns don't apply here.