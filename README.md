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

- Node.js 20+
- npm

## Development Setup

### 1. Install dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install dashboard dependencies
cd ../dashboard
npm install
```

### 2. Start the backend

The backend provides authentication and API proxy services.

```bash
cd backend
npm run dev
```

This starts the backend on `http://localhost:3001` with hot-reload.

### 3. Start the dashboard

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

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
