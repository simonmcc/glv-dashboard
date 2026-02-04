# GLV Dashboard - API Discovery Tool

Interactive tool for discovering and documenting the Scouts Membership Portal API by capturing network requests as you navigate.

## Prerequisites

- Node.js 20+
- npm
- Playwright browsers installed (`npx playwright install chromium`)

## Setup

```bash
cd scraper
npm install
```

## Usage

### With Environment Variables (Recommended)

Set your credentials as environment variables to skip the login prompt:

```bash
export SCOUT_USERNAME="your-email@example.com"
export SCOUT_PASSWORD="your-password"
```

Then run with a visible browser:

```bash
HEADLESS=false npm run discover
```

### Interactive Login

If credentials aren't set, you'll be prompted to enter them:

```bash
HEADLESS=false npm run discover
```

### Headless Mode

For automated runs without a visible browser:

```bash
npm run discover
```

## What It Does

1. **Authenticates** with the Scouts membership portal via Azure B2C
2. **Captures all API requests** made during navigation (filters out static assets, analytics, etc.)
3. **Logs requests/responses** to the console in real-time
4. **Generates documentation** in `docs/API.md` with discovered endpoints
5. **Keeps the browser open** for 2 minutes for manual exploration

## Manual Exploration

After automated navigation completes, the browser stays open for manual exploration. Try:

- Navigate to Data Explorer and select different views
- Search for members by name or membership number
- View member profiles and disclosure pages
- Check training/learning records

All API calls are captured and logged to the console.

## Output

The tool generates `docs/API.md` containing:

- List of all discovered endpoints
- Sample request headers and bodies
- Sample response data (truncated for large responses)

## Captured Endpoints

Key endpoints discovered include:

| Endpoint | Purpose |
|----------|---------|
| `/api/MemberListingAsync` | Search members by name/membership number |
| `/api/GenerateSASTokenAsync` | Get SAS token for Azure Table Storage |
| `/api/DataExplorer/GetResultsAsync` | Query dashboard views |
| `/api/GetContactDetailAsync` | Get current user's contact info |

## Tips

- Use `HEADLESS=false` to see what's happening and manually explore
- Watch the console for `📤` (request) and `📥` (response) logs
- JSON responses show byte count; check `docs/API.md` for full content
- The tool auto-handles cookie consent dialogs
