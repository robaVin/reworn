'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import {
  detectPlatform,
  getInstallPrompt,
  isStandalone,
  subscribeInstallState,
  triggerInstall,
  wasInstalled,
} from './install-prompt';

/**
 * Subtle "Get the app" pop-up: a bottom-right toast on desktop, a bottom banner
 * on mobile. It appears only when there is a REAL action to offer — a captured
 * browser install prompt (Chrome/Edge/Android), or iOS (where it routes to the
 * /install Add-to-Home-Screen steps). Never shown when already installed, and
 * dismissing it suppresses the banner for 30 days (per-device, localStorage).
 * Nothing here is simulated: Install fires the actual browser prompt.
 */
const DISMISS_KEY = 'galerija:install-dismissed';
const SUPPRESS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SHOW_DELAY_MS = 4000; // let the page settle before offering

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < SUPPRESS_MS;
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Private mode / blocked storage: the banner just isn't suppressed. Fine.
  }
}

export function InstallBanner() {
  const t = useTranslations('Install');
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (isStandalone() || wasInstalled() || dismissedRecently()) return;

    const ios = detectPlatform() === 'ios';
    setIsIos(ios);

    const evaluate = () => {
      if (isStandalone() || wasInstalled()) {
        setVisible(false);
        return;
      }
      const prompt = getInstallPrompt() !== null;
      setCanPrompt(prompt);
      // Only surface when there's a genuine action: a captured prompt or iOS.
      if ((prompt || ios) && timerRef.current === undefined) {
        timerRef.current = setTimeout(() => {
          if (!dismissedRecently()) setVisible(true);
        }, SHOW_DELAY_MS);
      }
    };

    evaluate();
    const unsub = subscribeInstallState(evaluate);
    return () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [visible]);

  function dismiss() {
    rememberDismissed();
    setEntered(false);
    setTimeout(() => setVisible(false), 200);
  }

  async function onInstall() {
    if (canPrompt) {
      setBusy(true);
      try {
        await triggerInstall();
      } finally {
        setBusy(false);
        dismiss();
      }
      return;
    }
    // iOS / no captured prompt: send them to the Add-to-Home-Screen steps.
    rememberDismissed();
    setVisible(false);
    router.push('/install');
  }

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label={t('bannerTitle')}
      className={`fixed inset-x-0 bottom-0 z-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-200 motion-reduce:transition-none sm:inset-x-auto sm:bottom-4 sm:right-4 sm:p-0 ${
        entered ? 'translate-y-0' : 'translate-y-[130%]'
      }`}
    >
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-line bg-surface p-3.5 shadow-soft sm:w-[22rem]">
        <div className="flex items-start gap-3">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={44}
            height={44}
            className="flex-none rounded-[13px]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{t('bannerTitle')}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">
              {isIos ? t('bannerBodyIos') : t('bannerBody')}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('bannerDismiss')}
            className="-m-1 flex-none rounded-full p-1 text-muted transition-colors hover:text-ink"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4 fill-none stroke-current stroke-[1.7]"
              strokeLinecap="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={onInstall}
            disabled={busy}
            className="flex-1"
          >
            {t('installShort')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
            {t('notNow')}
          </Button>
        </div>
      </div>
    </div>
  );
}
