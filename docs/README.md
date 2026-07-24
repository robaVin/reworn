# ReWorn — Documentation

**The repository is the source of truth.** These canonical documents describe
the system as it is actually implemented and verified (tests + build), not as it
was originally planned. Where an older planning document conflicts with the
code, the code wins.

ReWorn is a **second-hand fashion classifieds marketplace**. Buyers browse and
contact sellers; sellers pay a subscription to publish listings and hold a
weekly listing quota. **ReWorn never processes garment purchases** — there is no
cart, checkout, order, payout, escrow, or platform shipping. The only platform
payment is the seller's subscription.

## Canonical documents

| Doc | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Actual stack, module layout, request/auth flow, client separation |
| [SECURITY.md](SECURITY.md) | Trust boundaries, RBAC/RLS, CSRF/CSP/rate-limiting, redaction, current findings |
| [DATABASE.md](DATABASE.md) | Entities, migrations, constraints, RLS policies (as migrated) |
| [PAYMENTS.md](PAYMENTS.md) | Provider-independent design and the bank-gateway isolation/blocked status |
| [ROADMAP.md](ROADMAP.md) | Approved increment order and current position |

## Historical / superseded material

- [`discovery/`](discovery/) — the original pre-implementation discovery and
  planning set. **Superseded** — see [`discovery/SUPERSEDED.md`](discovery/SUPERSEDED.md).
  Retained for rationale/history only. It predates the build and, notably, still
  references **Stripe** (the platform is now designed around a **Macedonian bank
  gateway, likely CaSys/CPay**) and contains transactional concepts that are **not**
  part of the classifieds MVP.
- [`../design/preview.html`](../design/preview.html) — the multi-theme design
  prototype. The production app uses the **Sustainable** direction only; the
  theme selector is not part of the app.

## Verification

Every claim here is checkable with the standard gate:

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm audit --audit-level=high
```

CI (`.github/workflows/ci.yml`) runs exactly this on Node 20.
