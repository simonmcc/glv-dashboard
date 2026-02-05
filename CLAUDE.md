# GLV Dashboard - Project Guidelines

## Git Workflow
- Never push directly to main - always create a PR branch
- Use explicit push syntax: `git push origin branch-name:branch-name`

## Data Types and Mock Mode
When adding a new data type or dashboard view:
1. Add the TypeScript types to `dashboard/src/types.ts`
2. Add the API client method to `dashboard/src/api-client.ts`
3. Add a mock data generator function to `backend/src/mock-data.ts`
4. Add the mock case to `getMockProxyResponse()` in `backend/src/mock-data.ts`
5. If the endpoint is not using the proxy, add mock mode handling directly in `backend/src/server.ts`

## Project Structure
- `backend/` - Express server with API proxy and authentication
- `dashboard/` - React + Vite frontend
- `scraper/` - Playwright-based scraping utilities

## Development
```bash
# Backend (with mock mode)
cd backend && MOCK_MODE=true npm run dev

# Frontend
cd dashboard && npm run dev
```

## Testing
- Frontend tests: `cd dashboard && npm test`
- Backend tests: `cd backend && npm test`
- Tests run in GitHub Actions on every PR
