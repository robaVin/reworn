'use client';

import { useEffect } from 'react';
import { initInstallPromptCapture } from './install-prompt';

/**
 * Mounts in the root layout so the browser's `beforeinstallprompt` event is
 * captured app-wide the moment it fires — even if that happens on the homepage,
 * long before the user opens /install. Renders nothing.
 */
export function InstallPromptCapture() {
  useEffect(() => {
    initInstallPromptCapture();
  }, []);
  return null;
}
