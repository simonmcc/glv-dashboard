/**
 * Simple timestamped logger for backend services.
 */

const timestamp = () => new Date().toISOString().slice(11, 23);
const DEBUG = process.env.DEBUG === 'true';

export const log = (message: string, ...args: unknown[]) =>
  console.log(`${timestamp()} ${message}`, ...args);

export const logError = (message: string, ...args: unknown[]) =>
  console.error(`${timestamp()} ${message}`, ...args);

export const logDebug = (message: string, ...args: unknown[]) => {
  if (DEBUG) {
    console.log(`${timestamp()} [DEBUG] ${message}`, ...args);
  }
};
