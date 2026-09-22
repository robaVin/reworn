'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Field, TextInput, Textarea, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ImageManager } from '@/components/seller/ImageManager';
import {
  LISTING_CONDITIONS,
  LISTING_GENDERS,
  DELIVERY_METHODS,
} from '@/modules/catalog/schemas';
import {
  createListingAction,
  updateListingAction,
  transitionListingAction,
} from '@/modules/catalog/actions';
import {
  DraftController,
  type SaveState,
} from '@/components/seller/draft-controller';

interface CategoryOption {
  id: string;
  name: string;
}

/** Placeholder title so a draft can be bootstrapped before the user types one. */
const DEFAULT_DRAFT_TITLE = 'Untitled listing';

/** Debounce window for autosaving text edits (ms). */
const AUTOSAVE_DELAY = 900;

/** Parse a human price like "240" / "240.50" into integer minor units. */
function toMinorUnits(major: string): number | undefined {
  const trimmed = major.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100);
}

/** A random session id used to make draft bootstrap idempotent server-side. */
function makeBootstrapKey(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type FieldErrors = Record<string, string[]>;

type Fields = {
  title: string;
  description: string;
  categoryId: string;
  brand: string;
  condition: string;
  size: string;
  color: string;
  material: string;
  gender: string;
  price: string;
  currency: string;
  location: string;
  deliveryMethod: string;
  deliveryNote: string;
};

const emptyFields: Fields = {
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
  deliveryMethod: 'unspecified',
  deliveryNote: '',
};

export interface CreateListingFormProps {
  categories: CategoryOption[];
  /** Present in EDIT mode: an existing editable listing to continue. */
  initial?: {
    id: string;
    /** Editable statuses reach this form; `paused` re-goes-live via republish. */
    status: 'draft' | 'paused' | 'published';
    fields: Partial<Fields>;
  };
}

export function CreateListingForm({
  categories,
  initial,
}: CreateListingFormProps) {
  const router = useRouter();
  const t = useTranslations('Sell');

  const [fields, setFields] = useState<Fields>({
    ...emptyFields,
    ...initial?.fields,
  });
  const [status, setStatus] = useState<'draft' | 'paused' | 'published'>(
    initial?.status ?? 'draft',
  );
  const [publishing, setPublishing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [publishFieldErrors, setPublishFieldErrors] = useState<FieldErrors>({});
  const [, forceRender] = useState(0);

  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Assemble a payload; on create the title falls back to a placeholder. */
  const buildPayload = useCallback((forCreate: boolean) => {
    const f = fieldsRef.current;
    const p: Record<string, unknown> = {
      currency: f.currency,
      gender: f.gender,
    };
    const t = f.title.trim();
    if (t) p.title = t;
    else if (forCreate) p.title = DEFAULT_DRAFT_TITLE;
    if (f.description.trim()) p.description = f.description;
    if (f.categoryId) p.categoryId = f.categoryId;
    if (f.brand.trim()) p.brand = f.brand;
    if (f.condition) p.condition = f.condition;
    if (f.size.trim()) p.size = f.size;
    if (f.color.trim()) p.color = f.color;
    if (f.material.trim()) p.material = f.material;
    if (f.location.trim()) p.location = f.location;
    if (f.deliveryMethod) p.deliveryMethod = f.deliveryMethod;
    if (f.deliveryNote.trim()) p.deliveryNote = f.deliveryNote;
    const minor = toMinorUnits(f.price);
    if (minor !== undefined) p.priceMinor = minor;
    return p;
  }, []);

  // One controller per form session — owns all the save/bootstrap concurrency.
  const controllerRef = useRef<DraftController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new DraftController(
      {
        createDraft: (payload, key) =>
          createListingAction(payload, key).then((r) =>
            r.ok
              ? { ok: true as const, id: r.data.id }
              : { ok: false as const, fieldErrors: r.fieldErrors },
          ),
        updateDraft: (id, payload) =>
          updateListingAction(id, payload).then((r) =>
            r.ok
              ? { ok: true as const }
              : { ok: false as const, fieldErrors: r.fieldErrors },
          ),
        buildPayload,
        bootstrapKey: makeBootstrapKey(),
        onChange: () => forceRender((n) => n + 1),
      },
      initial?.id ?? null,
    );
  }
  const controller = controllerRef.current;

  const scheduleSave = useCallback(() => {
    controller.markUnsaved();
    forceRender((n) => n + 1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void controller.save();
    }, AUTOSAVE_DELAY);
  }, [controller]);

  /** Flush any pending debounced save and wait for the queue to settle. */
  const flush = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await controller.save();
  }, [controller]);

  const set = useCallback(
    (key: keyof Fields) =>
      (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => {
        setFields((f) => ({ ...f, [key]: e.target.value }));
        setFormError(null);
        setPublishFieldErrors({});
        scheduleSave(); // first field edit bootstraps + autosaves
      },
    [scheduleSave],
  );

  // Warn before leaving with changes that are unsaved, in-flight, or failed.
  useEffect(() => {
    const risky =
      controller.state === 'unsaved' ||
      controller.state === 'saving' ||
      controller.state === 'error';
    if (!risky || status === 'published') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [controller.state, status]);

  // Clear a pending timer on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  async function onPublish() {
    setPublishing(true);
    setFormError(null);
    try {
      // Flush pending autosave and WAIT so publish can't race it.
      await flush();
      const id = controller.listingId;
      if (!id) {
        setFormError(t('error.couldNotSave'));
        return;
      }
      if (controller.state === 'error') {
        setFormError(t('error.latestChangesFailed'));
        return;
      }
      // A paused listing returns to the marketplace via `republish` (the state
      // machine rejects `publish` from paused); a draft goes live via `publish`.
      // Both re-run the same server-side entitlement + completeness gate.
      const res = await transitionListingAction(
        id,
        status === 'paused' ? 'republish' : 'publish',
      );
      if (!res.ok) {
        if (res.fieldErrors) setPublishFieldErrors(res.fieldErrors);
        setFormError(
          res.error === 'listing_incomplete'
            ? t('error.incomplete')
            : res.error === 'subscription_required'
              ? t('error.subscriptionRequired')
              : res.status === 403
                ? t('error.notAllowed')
                : t('error.couldNotPublish'),
        );
        return;
      }
      setStatus('published');
    } finally {
      setPublishing(false);
    }
  }

  async function onSaveAndExit() {
    await flush();
    if (controller.state === 'error' || !controller.listingId) {
      setFormError(t('error.couldNotSaveDraft'));
      return;
    }
    router.push('/seller/listings');
  }

  const err = useMemo(() => {
    const merged = { ...controller.fieldErrors, ...publishFieldErrors };
    return (key: string) => merged[key]?.[0] ?? null;
    // controller.fieldErrors is read fresh on every render (forceRender bumps).
  }, [controller.fieldErrors, publishFieldErrors]);

  const busy = publishing;

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
          {t('published.title')}
        </h2>
        <p className="mt-2 text-sm text-muted">{t('published.body')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button href="/seller/listings">{t('published.viewListings')}</Button>
          <Button href="/seller/listings/new" variant="outline">
            {t('published.createAnother')}
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
      {formError && (
        <div id="form-error">
          <Alert tone="danger" title={t('alert.pleaseReview')}>
            {formError}
          </Alert>
        </div>
      )}

      <fieldset className="space-y-5" disabled={busy}>
        <legend className="font-display text-lg font-semibold text-ink">
          {t('legend.itemDetails')}
        </legend>

        <Field id="title" label={t('field.title')} error={err('title')}>
          <TextInput
            id="title"
            value={fields.title}
            onChange={set('title')}
            required
            maxLength={140}
            aria-invalid={!!err('title')}
            placeholder={t('field.titlePlaceholder')}
          />
        </Field>

        <Field
          id="description"
          label={t('field.description')}
          error={err('description')}
        >
          <Textarea
            id="description"
            value={fields.description}
            onChange={set('description')}
            maxLength={4000}
            aria-invalid={!!err('description')}
            placeholder={t('field.descriptionPlaceholder')}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="categoryId"
            label={t('field.category')}
            error={err('categoryId')}
          >
            <Select
              id="categoryId"
              value={fields.categoryId}
              onChange={set('categoryId')}
              aria-invalid={!!err('categoryId')}
            >
              <option value="">{t('field.categoryPlaceholder')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="condition"
            label={t('field.condition')}
            error={err('condition')}
          >
            <Select
              id="condition"
              value={fields.condition}
              onChange={set('condition')}
              aria-invalid={!!err('condition')}
            >
              <option value="">{t('field.conditionPlaceholder')}</option>
              {LISTING_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {t(`condition.${c}`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="brand" label={t('field.brand')} error={err('brand')}>
            <TextInput
              id="brand"
              value={fields.brand}
              onChange={set('brand')}
              maxLength={80}
            />
          </Field>

          <Field id="size" label={t('field.size')} error={err('size')}>
            <TextInput
              id="size"
              value={fields.size}
              onChange={set('size')}
              maxLength={40}
              placeholder={t('field.sizePlaceholder')}
            />
          </Field>

          <Field
            id="gender"
            label={t('field.department')}
            error={err('gender')}
          >
            <Select id="gender" value={fields.gender} onChange={set('gender')}>
              {LISTING_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {t(`gender.${g}`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="location"
            label={t('field.location')}
            error={err('location')}
          >
            <TextInput
              id="location"
              value={fields.location}
              onChange={set('location')}
              maxLength={120}
              placeholder={t('field.locationPlaceholder')}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5" disabled={busy}>
        <legend className="font-display text-lg font-semibold text-ink">
          {t('legend.price')}
        </legend>
        <p className="text-xs text-muted">{t('priceHelper')}</p>
        <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
          <Field
            id="price"
            label={t('field.askingPrice')}
            error={err('priceMinor')}
          >
            <TextInput
              id="price"
              value={fields.price}
              onChange={set('price')}
              inputMode="decimal"
              aria-invalid={!!err('priceMinor')}
              placeholder="0.00"
            />
          </Field>
          <Field id="currency" label={t('field.currency')}>
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

      <fieldset className="space-y-5" disabled={busy}>
        <legend className="font-display text-lg font-semibold text-ink">
          {t('legend.delivery')}
        </legend>
        <p className="text-xs text-muted">{t('deliveryHelper')}</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="deliveryMethod" label={t('field.deliveryHandover')}>
            <Select
              id="deliveryMethod"
              value={fields.deliveryMethod}
              onChange={set('deliveryMethod')}
            >
              {DELIVERY_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`deliveryMethod.${m}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="deliveryNote"
            label={t('field.deliveryNote')}
            error={err('deliveryNote')}
          >
            <TextInput
              id="deliveryNote"
              value={fields.deliveryNote}
              onChange={set('deliveryNote')}
              maxLength={200}
              aria-invalid={!!err('deliveryNote')}
              placeholder={t('field.deliveryNotePlaceholder')}
            />
          </Field>
        </div>
      </fieldset>

      {/* Photos are available immediately; picking one auto-creates the draft. */}
      <div className="border-t border-line pt-6">
        <ImageManager
          listingId={controller.listingId}
          ensureListingId={() => controller.ensureDraft()}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button onClick={onPublish} disabled={busy}>
          {publishing
            ? t('button.publishing')
            : status === 'paused'
              ? t('button.republish')
              : t('button.publish')}
        </Button>
        <Button variant="outline" onClick={onSaveAndExit} disabled={busy}>
          {t('button.saveAndExit')}
        </Button>
        <SaveIndicator
          state={controller.state}
          onRetry={() => void controller.save()}
        />
      </div>
    </form>
  );
}

/** Restrained autosave status — no intrusive banners. */
function SaveIndicator({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry: () => void;
}) {
  const t = useTranslations('Sell');
  if (state === 'error') {
    return (
      <span
        className="flex items-center gap-2 text-xs text-danger"
        role="status"
      >
        {t('save.failed')}
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold underline underline-offset-2"
        >
          {t('save.retry')}
        </button>
      </span>
    );
  }
  const label =
    state === 'saving'
      ? t('save.saving')
      : state === 'saved'
        ? t('save.saved')
        : state === 'unsaved'
          ? t('save.unsaved')
          : t('save.notSaved');
  return (
    <span className="text-xs text-muted" role="status" aria-live="polite">
      {label}
    </span>
  );
}
