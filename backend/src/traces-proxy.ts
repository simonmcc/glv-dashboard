/**
 * OTLP trace proxy - receives spans from the browser and forwards them to
 * the appropriate backend (Cloud Trace on GCP, local Jaeger/collector otherwise).
 */

import { log, logError } from './logger.js';

const IS_GCP = Boolean(process.env.K_SERVICE);
const GCP_OTLP_ENDPOINT = 'https://telemetry.googleapis.com/v1/traces';
const LOCAL_OTLP_ENDPOINT =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

let cachedGCPAccessToken: string | null = null;
let cachedGCPAccessTokenExpiryMs = 0;

async function getGCPAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedGCPAccessToken && now < cachedGCPAccessTokenExpiryMs) {
    return cachedGCPAccessToken;
  }

  const response = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } }
  );
  if (!response.ok) {
    throw new Error(`Metadata server returned ${response.status}`);
  }
  const data = await response.json() as { access_token: string; expires_in?: number };

  if (data.expires_in && Number.isFinite(data.expires_in)) {
    const safetySeconds = Math.max(data.expires_in - 60, 0);
    cachedGCPAccessTokenExpiryMs = now + safetySeconds * 1000;
    cachedGCPAccessToken = data.access_token;
  } else {
    cachedGCPAccessToken = null;
    cachedGCPAccessTokenExpiryMs = 0;
  }

  return data.access_token;
}

export async function forwardTraces(body: unknown): Promise<void> {
  const payload = JSON.stringify(body);

  if (IS_GCP) {
    const token = await getGCPAccessToken();
    const response = await fetch(GCP_OTLP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: payload,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Cloud Trace rejected spans: ${response.status} ${text}`);
    }
    log('[Traces] Forwarded browser spans to Cloud Trace');
  } else {
    const response = await fetch(LOCAL_OTLP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OTLP collector rejected spans: ${response.status} ${text}`);
    }
    log(`[Traces] Forwarded browser spans to ${LOCAL_OTLP_ENDPOINT}`);
  }
}
