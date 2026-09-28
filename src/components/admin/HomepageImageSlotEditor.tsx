'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HomepageSlot } from '@prisma/client';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { updateHomepageAltAction } from '@/modules/homepage-media/actions';

/**
 * One homepage slot's editor (admin only). Replaces the picture via the hardened
 * raw-body admin route (which re-verifies the admin role, validates bytes, Sharp
 * re-encodes, and applies the safe-replacement ordering server-side) and/or
 * updates the alt text via a server action. The client never decides
 * authorization; a failure leaves the current image untouched and is surfaced
 * truthfully. Admin UI is English-only, matching the rest of /admin.
 */
const ACCEPT = 'image/jpeg,image/png,image/webp';

function friendlyError(code: string): string {
  if (code.includes('too_large')) return 'That file is too large (max 8 MB).';
  if (code.includes('rejected_format') || code.includes('unrecognized'))
    return 'Unsupported image. Use JPEG, PNG or WebP.';
  if (code.includes('mime_signature_mismatch'))
    return "The file's contents don't match its type.";
  if (code.includes('too_small')) return 'That image is too small.';
  if (code.includes('dimensions_too_large')) return 'That image is too large.';
  if (code.includes('undecodable')) return "That image couldn't be read.";
  if (code === 'rate_limited') return 'Too many changes — try again shortly.';
  return 'Something went wrong. Please try again.';
}

export function HomepageImageSlotEditor({
  slot,
  label,
  previewUrl,
  hasOverride,
  initialAlt,
  updatedAt,
}: {
  slot: HomepageSlot;
  label: string;
  previewUrl: string;
  hasOverride: boolean;
  initialAlt: string;
  updatedAt: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>(previewUrl);
  const [alt, setAlt] = useState<string>(initialAlt);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const altTrimmed = alt.trim();
  const altChanged = altTrimmed !== initialAlt.trim();
  const canSave =
    !pending && altTrimmed.length > 0 && (file !== null || altChanged);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : previewUrl);
  }

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      if (file) {
        // Replace the image (+ alt) via the raw-body admin route.
        const res = await fetch(
          `/api/admin/homepage-media/${slot}?alt=${encodeURIComponent(altTrimmed)}`,
          {
            method: 'POST',
            body: file,
            headers: {
              'content-type': file.type || 'application/octet-stream',
            },
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(friendlyError(body.error ?? 'server_error'));
          return;
        }
      } else if (altChanged && hasOverride) {
        const r = await updateHomepageAltAction(slot, altTrimmed);
        if (!r.ok) {
          setError(friendlyError(r.error ?? 'server_error'));
          return;
        }
      }
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      router.refresh();
    } catch {
      setError(friendlyError('server_error'));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink">{label}</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            hasOverride ? 'bg-forest/10 text-forest' : 'bg-sand text-muted'
          }`}
        >
          {hasOverride ? 'Custom image' : 'Using default'}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-card border border-line bg-sand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview}
          alt=""
          className="aspect-[3/2] w-full object-cover"
        />
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">
            Replace image
          </label>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            onChange={onPick}
            disabled={pending}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-control file:border file:border-line file:bg-cream file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:border-terracotta-strong"
          />
        </div>

        <Field id={`alt-${slot}`} label="Alt text (required)">
          <TextInput
            id={`alt-${slot}`}
            value={alt}
            onChange={(e) => {
              setAlt(e.target.value);
              setError(null);
            }}
            maxLength={300}
            required
            placeholder="Describe the photograph for screen readers"
          />
        </Field>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onSave} disabled={!canSave}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          {updatedAt && (
            <span className="text-xs text-muted">
              Updated {new Date(updatedAt).toLocaleString('en-GB')}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
