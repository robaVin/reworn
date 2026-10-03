'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import {
  detectPlatform,
  getInstallPrompt,
  isStandalone,
  subscribeInstallState,
  triggerInstall,
  wasInstalled,
  type Platform,
} from './install-prompt';

/**
 * The actionable part of /install. Shows the one honest thing for the current
 * browser: a real one-tap Install button where the browser offers it
 * (Chrome/Edge/Android), the actual Add-to-Home-Screen steps on iOS, or an
 * "already installed" note when running standalone. Nothing here is a dead
 * link or a placeholder — galerija is a PWA, so there is no app-store download.
 *
 * Client state is filled in only after mount, so the server-rendered output
 * (null) and the first client render agree — no hydration mismatch.
 */
export function InstallPanel() {
  const t = useTranslations('Install');
  const [mounted, setMounted] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>('other');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPlatform(detectPlatform());
    const sync = () => {
      setCanPrompt(getInstallPrompt() !== null);
      setInstalled(isStandalone() || wasInstalled());
    };
    sync();
    return subscribeInstallState(sync);
  }, []);

  async function onInstall() {
    setBusy(true);
    try {
      await triggerInstall();
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  if (installed) {
    return (
      <Alert tone="success" title={t('installedTitle')}>
        {t('installed')}
      </Alert>
    );
  }

  if (canPrompt) {
    return (
      <div className="space-y-3">
        <Button type="button" size="lg" onClick={onInstall} disabled={busy}>
          {t('installCta')}
        </Button>
        <p className="text-xs text-muted">{t('installHint')}</p>
      </div>
    );
  }

  if (platform === 'ios') {
    return (
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          {t('iosTitle')}
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink">
          <li>{t('iosStep1')}</li>
          <li>{t('iosStep2')}</li>
          <li>{t('iosStep3')}</li>
        </ol>
        <p className="mt-3 text-xs text-muted">{t('iosSafariNote')}</p>
      </div>
    );
  }

  if (platform === 'desktop') {
    return (
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          {t('desktopTitle')}
        </h2>
        <p className="mt-3 text-sm text-ink">{t('desktopBody')}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-ink">
        {t('genericTitle')}
      </h2>
      <p className="mt-3 text-sm text-ink">{t('genericBody')}</p>
    </div>
  );
}
