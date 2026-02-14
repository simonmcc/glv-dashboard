import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

async function bootstrap() {
  // Initialize tracing BEFORE rendering to ensure all fetches are instrumented
  if (import.meta.env.VITE_OTEL_ENABLED === 'true') {
    const { initTracing } = await import('./tracing');
    initTracing();
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrap();
