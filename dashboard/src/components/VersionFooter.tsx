import { useState, useEffect } from 'react';

interface VersionFooterProps {
  updateAvailable?: boolean;
  onUpdate?: () => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true';

// Truncate legacy full-SHA versions; pass through YYYYMMDD-sha7 and 'dev' as-is
const shortVersion = (v: string) => (v.length > 16 ? v.substring(0, 7) : v);

export function VersionFooter({ updateAvailable, onUpdate }: VersionFooterProps) {
  const [backendVersion, setBackendVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (MOCK_MODE) return;
    fetch(`${BACKEND_URL}/version`)
      .then(r => r.json())
      .then((d: { version?: string }) => setBackendVersion(d.version ?? null))
      .catch(() => {});
  }, []);

  const checkForUpdates = async () => {
    if (!('serviceWorker' in navigator)) return;
    setChecking(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    } finally {
      setChecking(false);
    }
  };

  return (
    <p className="text-center text-xs text-gray-500">
      <a
        href={__APP_URL__}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-gray-700"
      >
        simonmcc/glv-dashboard@{__APP_VERSION__}
      </a>
      {backendVersion && (
        <span> · proxy@{shortVersion(backendVersion)}</span>
      )}
      {' · '}
      {updateAvailable && onUpdate ? (
        <button
          onClick={onUpdate}
          className="underline text-purple-600 hover:text-purple-800"
        >
          Update available — reload
        </button>
      ) : (
        <button
          onClick={checkForUpdates}
          disabled={checking}
          className="underline hover:text-gray-700 disabled:no-underline disabled:cursor-default"
        >
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
      )}
    </p>
  );
}
