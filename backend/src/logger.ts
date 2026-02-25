/**
 * Simple timestamped logger for backend services.
 *
 * When running on Google Cloud (detected via the K_SERVICE env var set by
 * Cloud Run), log entries are emitted as structured JSON so that Cloud Logging
 * can parse fields, apply severity filtering, and correlate logs with Cloud
 * Trace spans.
 */

import { trace, context } from '@opentelemetry/api';

// Cloud Run sets K_SERVICE automatically
const IS_GCP = Boolean(process.env.K_SERVICE);
const DEBUG = process.env.DEBUG === 'true';
const timestamp = () => new Date().toISOString().slice(11, 23);

/**
 * Build a structured Cloud Logging JSON entry.
 * Includes the active OTel trace/span IDs so Cloud Logging can link the log
 * line to the corresponding Cloud Trace span.
 */
function gcpEntry(severity: string, message: string, ...args: unknown[]): string {
  const span = trace.getSpan(context.active());
  const spanContext = span?.spanContext();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;

  const entry: Record<string, unknown> = {
    severity,
    message: args.length ? `${message} ${args.map(a => (a instanceof Error ? (a.stack || a.message) : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}` : message,
    time: new Date().toISOString(),
  };

  if (spanContext?.traceId) {
    entry['logging.googleapis.com/spanId'] = spanContext.spanId;
    entry['logging.googleapis.com/trace'] = projectId
      ? `projects/${projectId}/traces/${spanContext.traceId}`
      : spanContext.traceId;
  }

  return JSON.stringify(entry);
}

export const log = (message: string, ...args: unknown[]) => {
  if (IS_GCP) {
    console.log(gcpEntry('INFO', message, ...args));
  } else {
    console.log(`${timestamp()} ${message}`, ...args);
  }
};

export const logError = (message: string, ...args: unknown[]) => {
  if (IS_GCP) {
    console.error(gcpEntry('ERROR', message, ...args));
  } else {
    console.error(`${timestamp()} ${message}`, ...args);
  }
};

export const logDebug = (message: string, ...args: unknown[]) => {
  if (DEBUG) {
    if (IS_GCP) {
      console.log(gcpEntry('DEBUG', message, ...args));
    } else {
      console.log(`${timestamp()} [DEBUG] ${message}`, ...args);
    }
  }
};
