/**
 * Simple timestamped logger for backend services.
 */

const timestamp = () => new Date().toISOString().slice(11, 23);

export const log = (message: string, ...args: unknown[]) =>
  console.log(`${timestamp()} ${message}`, ...args);

export const logError = (message: string, ...args: unknown[]) =>
  console.error(`${timestamp()} ${message}`, ...args);
