'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Field, TextInput, Textarea, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { LISTING_CONDITIONS, LISTING_GENDERS } from '@/modules/catalog/schemas';
import {
  createListingAction,
  updateListingAction,
  transitionListingAction,
} from '@/modules/catalog/actions';

interface CategoryOption {
  id: string;
  name: string;
}

const CONDITION_LABELS: Record<(typeof LISTING_CONDITIONS)[number], string> = {
  new: 'New with tags',
  like_new: 'Like new',
  very_good: 'Very good',
  good: 'Good',
  fair: 'Fair',
};

const GENDER_LABELS: Record<(typeof LISTING_GENDERS)[number], string> = {
  women: 'Women',
  men: 'Men',
  kids: 'Kids',
  unisex: 'Unisex',
};

/** Parse a human price like "240" / "240.50" into integer minor units. */
function toMinorUnits(major: string): number | undefined {
  const trimmed = major.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100);
}

type FieldErrors = Record<string, string[]>;

const initialFields = {
  title: '',
  description: '',
  categoryId: '',
  brand: '',
  condition: '',
  size: '',
  color: '',
  material: '',
  gender: 'unisex',
  price: '',
  currency: 'MKD',
  location: '',
};

export function CreateListingForm({
  categories,
}: {
  categories: CategoryOption[];
}) {
  const [fields, setFields] = useState(initialFields);
  const [listingId, setListingId] = useState<string | null>(null);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<{
    tone: 'info' | 'success';
    text: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const busy = saving || publishing;

  const set = useCallback(
    (key: keyof typeof initialFields) =>
      (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => {
        setFields((f) => ({ ...f, [key]: e.target.value }));
        setDirty(true);
        setNotice(null);
      },
    [],
  );

  // Warn before leaving with unsaved edits (tab close / refresh / back).
  useEffect(() => {
    if (!dirty || status === 'published') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, status]);

  /** Assemble the draft payload (omit empty values; price → minor units). */
  const buildPayload = useCallback(() => {
    const p: Record<string, unknown> = {
      title: fields.title,
      currency: fields.currency,
    };
    if (fields.description.trim()) p.description = fields.description;
    if (fields.categoryId) p.categoryId = fields.categoryId;
    if (fields.brand.trim()) p.brand = fields.brand;
    if (fields.condition) p.condition = fields.condition;
    if (fields.size.trim()) p.size = fields.size;
    if (fields.color.trim()) p.color = fields.color;
    if (fields.material.trim()) p.material = fields.material;
    if (fields.gender) p.gender = fields.gender;
    if (fields.location.trim()) p.location = fields.location;
    const minor = toMinorUnits(fields.price);
    if (minor !== undefined) p.priceMinor = minor;
    return p;
  }, [fields]);

  /** Create or update the draft; returns the listing id or null on failure. */
  const persistDraft = useCallback(async (): Promise<string | null> => {
    setFormError(null);
    setFieldErrors({});
    if (!fields.title.trim()) {
      setFieldErrors({ title: ['A title is required to save a draft.'] });
      return null;
    }
    const payload = buildPayload();
    const res = listingId
      ? await updateListingAction(listingId, payload)
      : await createListingAction(payload);

    if (!res.ok) {
      if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      setFormError(
        res.error === 'validation'
          ? 'Please fix the highlighted fields.'
          : 'Could not save the draft. Please try again.',
      );
      return null;
    }
    setListingId(res.data.id);
    setDirty(false);
    return res.data.id;
  }, [buildPayload, fields.title, listingId]);

  async function onSaveDraft() {
    setSaving(true);
    try {
      const id = await persistDraft();
      if (id) setNotice({ tone: 'success', text: 'Draft saved.' });
    } finally {
      setSaving(false);
    }
  }

  async function onPublish() {
    setPublishing(true);
    try {
      const id = await persistDraft();
      if (!id) return;
      const res = await transitionListingAction(id, 'publish');
      if (!res.ok) {
        if (res.fieldErrors) setFieldErrors(res.fieldErrors);
        setFormError(
          res.error === 'listing_incomplete'
            ? 'A published listing needs all required fields. Complete the highlighted fields.'
            : res.error === 'subscription_required'
              ? 'Publishing requires an active seller subscription, which is not available yet. Your draft is saved.'
              : res.status === 403
                ? 'Your seller account is not currently allowed to publish.'
                : 'Could not publish. Please try again.',
        );
        return;
      }
      setStatus('published');
      setDirty(false);
      setNotice({ tone: 'success', text: 'Your listing is live.' });
    } finally {
      setPublishing(false);
    }
  }

  const err = useMemo(
    () => (key: string) => fieldErrors[key]?.[0] ?? null,
    [fieldErrors],
  );

  if (status === 'published') {
    return (
      <div className="rounded-card border border-line bg-surface p-8 text-center shadow-soft">
        <div
          aria-hidden
          className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-forest/10 text-2xl"
        >
          🌿
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-ink">
          Your listing is live
        </h2>
        <p className="mt-2 text-sm text-muted">
          Buyers can now find it and message you directly. Payment and delivery
          are arranged between you and the buyer.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button href="/seller/listings">View my listings</Button>
          <Button
            variant="outline"
            onClick={() => {
              setFields(initialFields);
              setListingId(null);
              setStatus('draft');
              setNotice(null);
            }}
          >
            Create another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="space-y-8"
      aria-describedby={formError ? 'form-error' : undefined}
    >
      {notice && (
        <Alert tone={notice.tone === 'success' ? 'success' : 'info'}>
          {notice.text}
        </Alert>
      )}
      {formError && (
        <div id="form-error">
          <Alert tone="danger" title="Please review">
            {formError}
          </Alert>
        </div>
      )}

      <fieldset className="space-y-5" disabled={busy}>
        <legend className="font-display text-lg font-semibold text-ink">
          Item details
        </legend>

        <Field id="title" label="Title" error={err('title')}>
          <TextInput
            id="title"
            value={fields.title}
            onChange={set('title')}
            required
            maxLength={140}
            aria-invalid={!!err('title')}
            placeholder="e.g. Wool overcoat"
          />
        </Field>

        <Field id="description" label="Description" error={err('description')}>
          <Textarea
            id="description"
            value={fields.description}
            onChange={set('description')}
            maxLength={4000}
            aria-invalid={!!err('description')}
            placeholder="Condition details, measurements, flaws, styling…"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="categoryId" label="Category" error={err('categoryId')}>
            <Select
              id="categoryId"
              value={fields.categoryId}
              onChange={set('categoryId')}
              aria-invalid={!!err('categoryId')}
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="condition" label="Condition" error={err('condition')}>
            <Select
              id="condition"
              value={fields.condition}
              onChange={set('condition')}
              aria-invalid={!!err('condition')}
            >
              <option value="">Choose a condition…</option>
              {LISTING_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="brand" label="Brand (optional)" error={err('brand')}>
            <TextInput
              id="brand"
              value={fields.brand}
              onChange={set('brand')}
              maxLength={80}
            />
          </Field>

          <Field id="size" label="Size" error={err('size')}>
            <TextInput
              id="size"
              value={fields.size}
              onChange={set('size')}
              maxLength={40}
              placeholder="e.g. M, 40, UK 8"
            />
          </Field>

          <Field id="gender" label="Department" error={err('gender')}>
            <Select id="gender" value={fields.gender} onChange={set('gender')}>
              {LISTING_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="location" label="Location" error={err('location')}>
            <TextInput
              id="location"
              value={fields.location}
              onChange={set('location')}
              maxLength={120}
              placeholder="e.g. Skopje"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5" disabled={busy}>
        <legend className="font-display text-lg font-semibold text-ink">
          Price
        </legend>
        <p className="text-xs text-muted">
          The price is informational — you agree payment and delivery directly
          with the buyer. ReWorn never takes a cut.
        </p>
        <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
          <Field id="price" label="Asking price" error={err('priceMinor')}>
            <TextInput
              id="price"
              value={fields.price}
              onChange={set('price')}
              inputMode="decimal"
              aria-invalid={!!err('priceMinor')}
              placeholder="0.00"
            />
          </Field>
          <Field id="currency" label="Currency">
            <Select
              id="currency"
              value={fields.currency}
              onChange={set('currency')}
            >
              <option value="MKD">MKD</option>
              <option value="EUR">EUR</option>
            </Select>
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button onClick={onPublish} disabled={busy}>
          {publishing ? 'Publishing…' : 'Publish listing'}
        </Button>
        <Button variant="outline" onClick={onSaveDraft} disabled={busy}>
          {saving ? 'Saving…' : 'Save draft'}
        </Button>
        <p className="text-xs text-muted" role="status">
          {listingId
            ? dirty
              ? 'Unsaved changes'
              : 'Draft saved'
            : 'Not saved yet'}
        </p>
      </div>

      <p className="text-xs text-muted">
        Photos are added in a later update. You can publish a listing without
        photos for now.
      </p>
    </form>
  );
}
