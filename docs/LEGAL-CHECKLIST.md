# Legal & Compliance Documentation — pre-publish checklist

Bank / CaSys onboarding documentation for the ReWorn seller subscription. Pages
live under the `(legal)` route group and are linked from the footer.

| Page | Route | Covers bank question |
|---|---|---|
| Terms of Service | `/terms` | (general T&C) |
| Privacy Policy | `/privacy` | cardholder personal-data protection |
| Cookie Policy | `/cookies` | (data protection) |
| Subscription, Refunds & Cancellation | `/refunds` | refund policy |
| Payments & Security | `/payments` | secure payment / card acceptance |
| Contact & Support | `/contact` | support phone + email |

All copy is driven by `src/config/company.ts`. Values in `[SQUARE BRACKETS]`
render literally so gaps are obvious — **fill every one before publishing.**

## Placeholders to fill in `src/config/company.ts`
- `legalName` — registered legal entity operating ReWorn / holding the CaSys contract
- `address` — registered seat/address in North Macedonia
- `companyRegNo` — company registration number (ЕМБС / EMBS)
- `taxNo` — tax / VAT number (ЕДБ / EDB)
- `siteUrl` — set `NEXT_PUBLIC_APP_URL` to the live domain (also fixes canonical/OG URLs)
- `supportEmail`, `supportPhone`, `supportHours`
- `privacyEmail` — data-protection contact
- `acquiringBank` — the acquiring bank behind the CaSys contract

## Placeholders inside page copy
- Privacy → **retention periods** (section 6)
- Refunds → **exact refund terms** (section 4 — a lawful default is provided; confirm the stance and the refund processing time `[N] business days`)
- Payments → **statement descriptor** (section 2)

## Confirmed (already set)
Country and governing law: North Macedonia · Payment gateway: CaSys · Currency:
MKD · Accepted cards: Visa, Mastercard, Maestro · Data-protection authority: AZLP.

## Before publishing
1. Fill all placeholders above; bump `COMPANY.lastUpdated`.
2. **Legal review** by a qualified adviser: North Macedonia consumer-protection
   law (refunds/withdrawal) and the Law on Personal Data Protection (privacy),
   plus CaSys’ card-acceptance wording and required logos.
3. Add the official **Visa / Mastercard / CaSys logos** where the acceptance
   agreement requires them.
4. When the subscription checkout goes live, require the buyer to accept the
   Terms and see the Refunds policy at the point of payment.

**Not legal advice.** These are templates grounded in how ReWorn operates.
