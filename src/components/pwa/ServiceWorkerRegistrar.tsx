'use client';

import { useEffect } from 'react';

/**
 * Registers the PWA service worker (`/sw.js`) once, on the client, in
 * production only. Dev is skipped so the worker's caching never interferes with
 * `next dev` HMR. Renders nothing. Failures are swallowed — the app must work
 * identically whether or not the worker registers.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Non-fatal: the app is fully functional without the service worker.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
