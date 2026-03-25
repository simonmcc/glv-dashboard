/**
 * OTLP trace proxy - receives spans from the browser and forwards them to
 * the appropriate backend (Cloud Trace on GCP, local Jaeger/collector otherwise).
 */

import { log } from './logger.js';

function isGCP(): boolean {
  return Boolean(process.env.K_SERVICE);
}
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

/**
 * Inject gcp.project_id into every resourceSpans resource so Cloud Trace
 * accepts the payload.  The attribute is required by telemetry.googleapis.com
 * but is not sent by the browser SDK.
 */
function injectGCPProjectId(body: unknown, projectId: string): unknown {
  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray((body as Record<string, unknown>).resourceSpans)
  ) {
    return body;
  }

  const gcpAttr = { key: 'gcp.project_id', value: { stringValue: projectId } };
  const resourceSpans = ((body as Record<string, unknown>).resourceSpans as unknown[]).map(
    (rs: unknown) => {
      if (typeof rs !== 'object' || rs === null) return rs;
      const rsObj = rs as Record<string, unknown>;
      const resource =
        typeof rsObj.resource === 'object' && rsObj.resource !== null
          ? (rsObj.resource as Record<string, unknown>)
          : {};
      const existing = Array.isArray(resource.attributes) ? resource.attributes : [];
      const filtered = existing.filter((a): a is { key: string } => {
        if (a === null || typeof a !== 'object') return false;
        const key = (a as any).key;
        return typeof key === 'string' && key !== 'gcp.project_id';
      });
      return {
        ...rsObj,
        resource: { ...resource, attributes: [...filtered, gcpAttr] },
      };
    }
  );

  return { ...(body as Record<string, unknown>), resourceSpans };
}

export async function forwardTraces(body: unknown): Promise<void> {
  if (isGCP()) {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const enriched = projectId ? injectGCPProjectId(body, projectId) : body;
    const payload = JSON.stringify(enriched);
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
    if (process.env.NODE_ENV !== 'production') {
      log('[Traces] Forwarded browser spans to Cloud Trace');
    }
  } else {
    const response = await fetch(LOCAL_OTLP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OTLP collector rejected spans: ${response.status} ${text}`);
    }
    if (process.env.NODE_ENV !== 'production') {
      log(`[Traces] Forwarded browser spans to ${LOCAL_OTLP_ENDPOINT}`);
    }
  }
}

// Vitest tests for injectGCPProjectId/forwardTraces behavior.
// Placed here due to repository constraints; gated so they only run in test env.
if (process.env.NODE_ENV === 'test') {
  // Use a top-level async IIFE so we can use dynamic import in ESM.
  (async () => {
    const { describe, it, expect, vi } = await import('vitest');

    describe('forwardTraces GCP payload rewriting', () => {
      it('injects a single gcp.project_id per resourceSpans and replaces existing values', async () => {
        // Force GCP branch and configure project ID.
        process.env.K_SERVICE = 'test-service';
        const projectId = 'test-project-id';
        process.env.GOOGLE_CLOUD_PROJECT = projectId;

        // Seed access token cache so getGCPAccessToken() does not hit real services.
        cachedGCPAccessToken = 'test-access-token';
        cachedGCPAccessTokenExpiryMs = Date.now() + 60_000;

        // Mock fetch to capture forwarded payload.
        const fetchMock = vi.fn(async () => ({
          ok: true,
          status: 200,
          text: async () => '',
        }));
        (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

        const originalBody = {
          resourceSpans: [
            {
              resource: {
                attributes: [
                  { key: 'foo', value: { stringValue: 'bar' } },
                  { key: 'gcp.project_id', value: { stringValue: 'old-project-id' } },
                ],
              },
            },
            {
              resource: {
                attributes: [
                  { key: 'baz', value: { stringValue: 'qux' } },
                ],
              },
            },
          ],
        };

        await forwardTraces(originalBody);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, fetchOptions] = fetchMock.mock.calls[0] as unknown as Parameters<typeof fetch>;
        const sentPayload = JSON.parse(
          (fetchOptions as { body: string }).body
        ) as { resourceSpans: Array<{ resource?: { attributes?: Array<{ key: string; value: { stringValue: string } }> } }> };

        expect(Array.isArray(sentPayload.resourceSpans)).toBe(true);
        expect(sentPayload.resourceSpans.length).toBe(2);

        sentPayload.resourceSpans.forEach((rs, index) => {
          const attrs = rs.resource?.attributes ?? [];
          const gcpAttrs = attrs.filter((a) => a.key === 'gcp.project_id');
          expect(gcpAttrs.length).toBe(1);
          expect(gcpAttrs[0].value.stringValue).toBe(projectId);

          if (index === 0) {
            // Original non-GCP attribute should be preserved.
            const fooAttr = attrs.find((a) => a.key === 'foo');
            expect(fooAttr).toBeTruthy();
            expect(fooAttr?.value.stringValue).toBe('bar');
          }

          if (index === 1) {
            const bazAttr = attrs.find((a) => a.key === 'baz');
            expect(bazAttr).toBeTruthy();
            expect(bazAttr?.value.stringValue).toBe('qux');
          }
        });
      });
    });
  })();
}
