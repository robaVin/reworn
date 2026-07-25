'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import {
  deleteListingImageAction,
  listListingImagesAction,
  reorderListingImagesAction,
} from '@/modules/catalog/image-actions';
import { MAX_LISTING_IMAGES } from '@/modules/catalog/image-config';

interface Image {
  id: string;
  position: number;
  url: string;
  width: number;
  height: number;
}

/** Map a service error code to a short, human message. */
function humanizeError(code: string): string {
  if (code.startsWith('image_rejected:rejected_format:')) {
    const fmt = code.split(':').pop();
    return `${fmt?.toUpperCase() ?? 'That'} images aren't supported. Use JPEG, PNG or WebP.`;
  }
  if (code.startsWith('image_rejected:mime_signature_mismatch'))
    return 'That file is not the image type it claims to be.';
  if (code.startsWith('image_rejected:too_large'))
    return 'That image is too large. Please upload one under 8 MB.';
  if (code.startsWith('image_rejected:too_small'))
    return 'That image is too small — each side must be at least 400px.';
  if (code.startsWith('image_rejected:dimensions_too_large'))
    return 'That image’s dimensions are too large.';
  if (code.startsWith('image_rejected:undecodable'))
    return 'That file could not be read as an image.';
  if (code.startsWith('image_rejected:unrecognized_format'))
    return 'That file is not a supported image.';
  if (code.startsWith('image_limit:'))
    return `You can add up to ${MAX_LISTING_IMAGES} photos.`;
  if (code.startsWith('listing_conflict:'))
    return 'This listing can’t be edited right now.';
  return 'Something went wrong. Please try again.';
}

export function ImageManager({
  listingId,
  ensureListingId,
}: {
  /** Known once a draft exists; may be null until the first interaction. */
  listingId: string | null;
  /** Bootstraps a draft on demand (e.g. when the user picks the first photo). */
  ensureListingId?: () => Promise<string | null>;
}) {
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(Boolean(listingId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(
    async (id: string | null = listingId) => {
      if (!id) {
        setLoading(false);
        return;
      }
      const res = await listListingImagesAction(id);
      if (res.ok) setImages(res.data);
      setLoading(false);
    },
    [listingId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSelectFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setError(null);
      setBusy(true);
      try {
        // Picking a photo IS a meaningful interaction: create the draft now if
        // one doesn't exist yet, so the user never has to "Save draft" first.
        const targetId =
          listingId ?? (ensureListingId ? await ensureListingId() : null);
        if (!targetId) {
          setError('Could not start your draft. Please try again.');
          return;
        }
        for (const file of Array.from(files)) {
          if (images.length >= MAX_LISTING_IMAGES) {
            setError(humanizeError(`image_limit:${MAX_LISTING_IMAGES}`));
            break;
          }
          setStatus(`Uploading ${file.name}…`);
          // Raw body upload: the file bytes ARE the request body and its type is
          // the Content-Type. No multipart, no filename sent (server ignores it).
          const res = await fetch(`/api/seller/listings/${targetId}/images`, {
            method: 'POST',
            headers: {
              'content-type': file.type || 'application/octet-stream',
            },
            body: file,
          });
          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            setError(humanizeError(payload?.error ?? 'server_error'));
            break;
          }
          await refresh(targetId);
        }
        setStatus('');
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [images.length, listingId, ensureListingId, refresh],
  );

  const move = useCallback(
    async (index: number, dir: -1 | 1) => {
      if (!listingId) return;
      const target = index + dir;
      if (target < 0 || target >= images.length) return;
      const next = [...images];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      setImages(next); // optimistic
      setBusy(true);
      setError(null);
      try {
        const res = await reorderListingImagesAction(
          listingId,
          next.map((i) => i.id),
        );
        if (!res.ok) {
          setError(humanizeError(res.error));
          await refresh(); // roll back to server truth
        } else {
          setStatus('Order updated.');
        }
      } finally {
        setBusy(false);
      }
    },
    [images, listingId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await deleteListingImageAction(id);
        if (!res.ok) setError(humanizeError(res.error));
        await refresh();
        setStatus('Photo removed.');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const atLimit = images.length >= MAX_LISTING_IMAGES;

  return (
    <section className="space-y-4" aria-labelledby="photos-heading">
      <div>
        <h2
          id="photos-heading"
          className="font-display text-lg font-semibold text-ink"
        >
          Photos
        </h2>
        <p className="mt-1 text-xs text-muted">
          Add up to {MAX_LISTING_IMAGES} photos (JPEG, PNG or WebP, max 8 MB
          each). The first photo is the cover buyers see first. Photos are
          optional — you can publish without them.
        </p>
      </div>

      {error && (
        <Alert tone="danger" title="Photo problem">
          {error}
        </Alert>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      {!loading && images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, index) => (
            <li
              key={img.id}
              className="relative overflow-hidden rounded-card border border-line bg-surface"
            >
              <div className="relative aspect-square bg-sand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={
                    index === 0 ? 'Cover photo' : `Listing photo ${index + 1}`
                  }
                  className="h-full w-full object-cover"
                  width={img.width}
                  height={img.height}
                />
                {index === 0 && (
                  <span className="absolute left-2 top-2 rounded-full bg-forest px-2 py-0.5 text-[11px] font-semibold text-cream">
                    Cover
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => move(index, -1)}
                    disabled={busy || index === 0}
                    aria-label={`Move photo ${index + 1} earlier`}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => move(index, 1)}
                    disabled={busy || index === images.length - 1}
                    aria-label={`Move photo ${index + 1} later`}
                  >
                    ↓
                  </Button>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => remove(img.id)}
                  disabled={busy}
                  aria-label={`Remove photo ${index + 1}`}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label
          htmlFor="image-upload"
          className="mb-1 block text-sm font-medium text-ink"
        >
          Add photos
        </label>
        <input
          ref={inputRef}
          id="image-upload"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy || atLimit}
          onChange={(e) => onSelectFiles(e.target.files)}
          className="block w-full text-sm text-muted file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-control file:border file:border-line file:bg-surface file:px-4 file:py-2 file:font-semibold file:text-ink hover:file:border-terracotta-strong disabled:opacity-60"
        />
        <p className="mt-1 text-xs text-muted" aria-live="polite">
          {atLimit
            ? `Photo limit reached (${MAX_LISTING_IMAGES}).`
            : `${images.length} of ${MAX_LISTING_IMAGES} added${busy ? ' — working…' : ''}`}
        </p>
      </div>
    </section>
  );
}
