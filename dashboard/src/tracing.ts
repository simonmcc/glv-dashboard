import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

export function initTracing() {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
  const collectorUrl =
    import.meta.env.VITE_OTEL_COLLECTOR_URL || `${backendUrl}/v1/traces`;

  const exporter = new OTLPTraceExporter({ url: collectorUrl });

  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'glv-dashboard',
      [ATTR_SERVICE_VERSION]: '1.0.0',
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });

  provider.register({
    contextManager: new ZoneContextManager(),
    propagator: new W3CTraceContextPropagator(),
  });

  // Propagate W3C trace context to the backend so browser and server spans share a trace
  const backendPattern = new RegExp(backendUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [backendPattern],
      }),
    ],
  });

  console.log('[Tracing] OpenTelemetry initialized - exporting to', collectorUrl);
}
