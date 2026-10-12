/**
 * Install Prompt Component
 *
 * Offers to install the dashboard as a home-screen app.
 * - Chromium (Android, desktop Chrome/Edge): captures `beforeinstallprompt`
 *   and shows an Install button that triggers the native dialog.
 * - iOS Safari: has no install event, so shows "Share → Add to Home Screen"
 *   instructions instead.
 * Hidden when already running as an installed app, or once dismissed.
 */

import { useEffect, useState } from "react";

export const INSTALL_DISMISSED_KEY = "glv-install-dismissed";

/** Chromium-only event; not in the TypeScript DOM lib. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS reports as Mac; distinguish by touch support
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  // Other iOS browsers can't add to home screen from their own menus as reliably
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && !isOtherBrowser;
}

function loadDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [installed, setInstalled] = useState(isStandalone);
  const [showIos] = useState(() => isIosSafari() && !isStandalone());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Suppress Chrome's mini-infobar; we show our own banner instead
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
    } catch {
      // Storage unavailable (private mode) — dismissal lasts this page view
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event can only be used once
    setDeferred(null);
    if (outcome === "dismissed") dismiss();
  };

  if (installed || dismissed || (!deferred && !showIos)) return null;

  return (
    <div
      role="region"
      aria-label="Install app"
      className="p-4 bg-purple-50 border border-purple-200 rounded-lg flex flex-wrap items-center gap-3"
    >
      <div className="flex-1 min-w-[12rem] text-sm text-purple-900">
        <div className="font-medium">Install GLV Dashboard</div>
        {deferred ? (
          <div className="text-purple-700">
            Add it to your home screen for quick, offline access.
          </div>
        ) : (
          <div className="text-purple-700">
            Tap the Share button, then <strong>Add to Home Screen</strong>.
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {deferred && (
          <button
            onClick={install}
            className="px-3 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Install
          </button>
        )}
        <button
          onClick={dismiss}
          className="px-3 py-2 text-sm text-purple-700 hover:text-purple-900"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

export default InstallPrompt;
