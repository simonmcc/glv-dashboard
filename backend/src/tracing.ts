import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { TraceExporter as CloudTraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { log } from './logger.js';

// Cloud Run sets K_SERVICE automatically; use it to detect GCP environment
const IS_GCP = Boolean(process.env.K_SERVICE);
const OTEL_ENABLED =
  process.env.OTEL_ENABLED === 'true' || process.env.OTEL_ENABLED === '1' || IS_GCP;

if (OTEL_ENABLED) {
  const resourceAttrs: Record<string, string> = {
    [ATTR_SERVICE_NAME]: process.env.K_SERVICE || 'glv-backend',
    [ATTR_SERVICE_VERSION]: process.env.K_REVISION || '1.0.0',
  };
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    resourceAttrs['cloud.account.id'] = process.env.GOOGLE_CLOUD_PROJECT;
  }

  // On GCP (Cloud Run) use the Cloud Trace exporter which writes directly to
  // Cloud Trace via Application Default Credentials.  Locally, fall back to the
  // OTLP HTTP exporter (e.g. a local Jaeger instance).
  const exporter = IS_GCP
    ? new CloudTraceExporter()
    : new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
      });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes(resourceAttrs),
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
    ],
  });

  sdk.start();
  if (IS_GCP) {
    log('[Tracing] OpenTelemetry initialized - exporting to Google Cloud Trace');
  } else {
    log('[Tracing] OpenTelemetry initialized - exporting to',
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces');
  }

  const shutdown = async () => {
    await sdk.shutdown();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else {
  log('[Tracing] OpenTelemetry disabled (set OTEL_ENABLED=true to enable)');
}
