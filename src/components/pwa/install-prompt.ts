/**
 * Shared client-side store for the browser's deferred PWA install prompt.
 *
 * Chrome/Edge/Android fire `beforeinstallprompt` once, early, on an eligible
 * page — usually before the user reaches /install. We capture it app-wide
 * (mounted in the root layout) and keep it here so the install UI can use it
 * after a client-side navigation. iOS Safari never fires this event, so the
 * install page falls back to Add-to-Home-Screen instructions there.
 *
 * Nothing here is simulated: `triggerInstall` fires the real browser prompt,
 * and the standalone / installed checks read the actual display mode.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let initialised = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Attach the window listeners once. Safe to call repeatedly / on the server. */
export function initInstallPromptCapture(): void {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;

  window.addEventListener('beforeinstallprompt', (event: Event) => {
    // Keep the browser's mini-infobar from showing; we present our own CTA.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferred;
}

export function wasInstalled(): boolean {
  return installed;
}

/** True when the app is already running as an installed PWA. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (
    window.navigator as unknown as { standalone?: boolean }
  ).standalone;
  return Boolean(displayMode) || iosStandalone === true;
}

export function subscribeInstallState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Fire the real install prompt. Returns 'unavailable' when the browser never
 * offered one (e.g. iOS, or it has already been used — the event is single-use).
 */
export async function triggerInstall(): Promise<
  'accepted' | 'dismissed' | 'unavailable'
> {
  if (!deferred) return 'unavailable';
  const event = deferred;
  await event.prompt();
  const choice = await event.userChoice;
  deferred = null; // the browser only honours one prompt() per event
  emit();
  return choice.outcome;
}

export type Platform = 'ios' | 'android' | 'desktop' | 'other';

/** Best-effort platform detection, used only to pick which instructions to show. */
export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  const iPadOS =
    /Macintosh/.test(ua) &&
    typeof document !== 'undefined' &&
    'ontouchend' in document;
  if (/iphone|ipad|ipod/i.test(ua) || iPadOS) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/windows|macintosh|linux|cros/i.test(ua)) return 'desktop';
  return 'other';
}
