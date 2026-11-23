/**
 * Install prompt capture.
 *
 * Chromium fires `beforeinstallprompt` once per page load, possibly while the
 * user is still on the sign-in screen. The banner only mounts with the
 * Dashboard, so the event is captured here at startup and held until the
 * banner subscribes.
 */

/** Chromium-only event; not in the TypeScript DOM lib. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let started = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function onBeforeInstall(e: Event) {
  // Suppress Chrome's mini-infobar; the dashboard shows its own banner
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  notify();
}

function onInstalled() {
  installed = true;
  deferred = null;
  notify();
}

/** Start listening. Call once at startup, before the first render. */
export function startInstallPromptCapture() {
  if (started) return;
  started = true;
  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onInstalled);
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDeferredPrompt() {
  return deferred;
}

export function wasInstalled() {
  return installed;
}

/** The event can only be used once; drop it after prompting. */
export function clearDeferredPrompt() {
  deferred = null;
  notify();
}

/** Test-only: detach listeners and forget captured state. */
export function resetInstallPromptCapture() {
  window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  window.removeEventListener("appinstalled", onInstalled);
  deferred = null;
  installed = false;
  started = false;
  listeners.clear();
}
