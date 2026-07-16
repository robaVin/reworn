# ReWorn — CTO Discovery Review & Requirements Analysis
### Phases 1 & 2 · Requirements Analysis + Business Model Review

> **Read this document first.** It reframes the entire engagement. The rest of the
> `docs/` set is written against the *corrected* understanding of the product, not the
> literal 10-phase enterprise template.

---

## 0. The single most important finding

The 10-phase brief asks for a **production-grade transactional eCommerce platform**
(checkout, orders, payments for goods, refunds, PCI-DSS, order lifecycle, inventory
reservation, etc.).

**The client's actual answers describe something completely different: a
subscription-gated fashion _classifieds / lead-generation_ marketplace** where:

- **No money for goods ever moves through the platform.** Checkout = *"No checkout."*
  Cart *"doesn't expire"*, promo/gift/tax/shipping = *no*. Order tracking, returns,
  refunds, exchanges, cancellations = **all "no."**
- **The only payment the platform processes is the _seller's subscription._** ("Sellers
  pay the subscription to be able to sell… buyers only need to create an account to get
  in contact with a seller.")
- **The transaction happens off-platform**, seller-to-buyer, arranged via **messaging**.
  **The seller handles shipping.**

In other words, the product is closer to **Facebook Marketplace / Vinted's "contact
seller" flow / a paid classifieds board** than to Shopify, Farfetch, or StockX.

**Why this matters (and why a junior team would burn the budget getting it wrong):**
roughly **60% of the requested template — Orders, Order Items, Payments-for-goods,
Refunds, checkout, PCI-DSS transactional scope, order lifecycle, escrow — is _not part
of this product_.** Building it anyway would waste the entire budget on machinery the
business doesn't use. The correct CTO move is to **cut it now**, architect a clean
classifieds + subscription + messaging core, and leave a documented seam for optional
transactional mode in v2.

This single reframing is worth more than any diagram below.

---

## 1. Budget & timeline reality check (blocking risk)

| Item | Client answer | CTO assessment |
|---|---|---|
| MVP deadline | **September** | ~2–3 months out. Tight but feasible **only** for the scoped-down classifieds MVP. |
| Budget | **€1,300 – €2,000** | This is a **micro-budget**. It does **not** buy a bespoke microservices platform, a custom auth stack, or a PCI transactional system. |

**Direct statement to the client:** the enterprise architecture implied by the 10-phase
brief is a **€80k–€200k, 6–12 month build**. At €1,300–€2,000 you can have a **secure,
real, launchable MVP** *if and only if* we:

1. Scope to the classifieds + subscription + messaging core (Section 0).
2. Build a **modular monolith**, not microservices.
3. Lean on **managed platforms** (Supabase/Stripe/n8n/Vercel) so we buy security and
   infrastructure instead of building it.

This is not a compromise — for this business model it is the *correct* architecture at
any budget. The managed-platform approach is covered in
[`06-tech-stack-and-roadmap.md`](06-tech-stack-and-roadmap.md).

> ⚠️ **Honesty note:** even scoped down, €1,300–€2,000 is low for the messaging +
> moderation + subscription-billing surface. Expect this to fund the MVP defined in the
> roadmap Phase 1–2 only. Reviews, recommendations, analytics dashboards, and AI are
> **v2+** and should be quoted separately.

---

## 2. Structured requirements extraction

### 2.1 Functional requirements (as actually stated)

| # | Requirement | Source answer | Notes |
|---|---|---|---|
| F1 | Users can register as **buyer** (free) or **seller** (paid subscription) | "sellers need to buy a subscription… buyers only need an account to contact a seller" | Core gating rule |
| F2 | Sellers list products (clothing, shoes, accessories, bags, jewelry — "everything") | Products section | |
| F3 | **Weekly listing quota** per seller, 7–30 items | "set a per week limit… 7-30" | Tie to subscription tier |
| F4 | Products have **size variants** (buyer picks size) | "able to pick the size" | Color captured but **not** filterable |
| F5 | **No listing approval** — products go live immediately | "No they will not" | Raises moderation risk (§4) |
| F6 | Buyers **contact sellers via in-app messaging** (with image attach — assumed) | Messaging section | Primary conversion event |
| F7 | Wishlist, recently viewed, similar products, recommendations | Product features | Recs = v2 |
| F8 | **Reviews & ratings** | "Yes / Yes" | ⚠️ integrity problem — see §3 conflicts |
| F9 | Filters: **category, size, price, condition, gender** | Search section | brand/color/material/discount = **no** |
| F10 | **Save cart / saved items** (persistent, no expiry) | "Save carts? Yes" | Functions as a second wishlist, **not** a checkout cart |
| F11 | **Seller dashboard**: sales analytics, revenue charts, inventory, order management | Seller dashboard | ⚠️ conflicts with "no checkout/orders" — see §3 |
| F12 | In-dashboard **notification button** (new messages, subscription/payment confirmations) | Notifications | Email + PWA push |
| F13 | **Admin panel**: users, sellers, categories, reports, analytics; products/orders = maybe | Admin section | Admin + Support = **one role** |
| F14 | Auth via **email, Google, phone number** | Auth section | 2FA unspecified → recommend TOTP for admin |
| F15 | **PWA** (installable, mobile-first) | "Progressive Web App? This one" | Ties to earlier `preview.html` work |
| F16 | Businesses/brands can also sell | "Yes" | Same seller entity, optional business flag |

### 2.2 Non-functional requirements

| Category | Requirement (derived) |
|---|---|
| Performance | Fast catalog browse on mobile networks; PWA offline shell; image-heavy → CDN + responsive images mandatory |
| Availability | Best-effort single-region to start (budget). 99.5% target, not 99.99% |
| Scalability | "thousands of users/transactions" — trivially handled by a single Postgres + managed hosting; **do not over-engineer** |
| Security | PII + messaging + subscription billing → GDPR + secure auth mandatory (§ security doc) |
| Localisation | "local then international" → design schema for multi-currency/locale later, ship single-locale first |
| Maintainability | One small team → monolith, boring tech, managed services |
| Accessibility | Public consumer marketplace → WCAG AA target for the storefront |

### 2.3 Business goals

- **Stated:** enable buying & selling of second-hand clothes; "gap in the market."
- **Revenue model:** **seller subscriptions only** (no commission stated — see §3 gap).
- **Growth:** local → international over 2–3 years.
- **Existing business** wanting a platform (not a greenfield brand).

### 2.4 User roles (confirmed)

| Role | Gate | Capabilities |
|---|---|---|
| **Buyer** | Free account | Browse, wishlist, save items, contact sellers, review/rate, receive notifications |
| **Seller** | **Paid subscription** | Everything a buyer can do + create listings (up to weekly quota), manage listings, view seller dashboard analytics, message buyers |
| **Admin/Support** (one role) | Internal | Manage users & sellers, categories, moderation, reports, analytics, handle support/disputes |

### 2.5 Integrations required

- **Stripe** (or local equivalent) — seller subscription billing (Stripe Billing).
- **Optional bank-transfer integration** with client's bank ("integration with their bank" — flagged as ambiguous, likely for subscription payout/collection; SEPA/manual reconciliation more realistic at this budget).
- **n8n** — automation/orchestration (explicitly requested, Phase 7).
- **Email provider** (Postmark/Resend/SES) — transactional email.
- **Push** — Web Push (PWA), no native app.
- **Object storage / CDN** — product & message images.

### 2.6 Payment requirements

- **In scope:** recurring **seller subscription** (tiered by weekly listing quota).
- **Out of scope (client said no):** buyer checkout, cart payment, taxes, shipping calc,
  promo codes, gift cards, refunds-for-goods, COD.
- **Undecided (gap):** platform **commission** on sales — client left blank. Since sales
  happen off-platform, commission is currently **uncollectable** anyway. See §3.

### 2.7 Messaging requirements

- Buyer↔seller 1:1 conversations tied to a listing.
- Image attachments (assumed yes).
- In-app notification indicator + email/push on new message.
- **No live chat / no real-time SLA required** → simple polling or lightweight realtime.
- ⚠️ Seller dashboard answer says "Messages: no" — **direct contradiction** with the
  core buyer-seller flow. See §3.

### 2.8 Inventory requirements

- Second-hand → most listings are **quantity = 1, unique item**. "Inventory" here means
  *listing availability / sold-flag*, not warehouse stock. Size variants exist but a
  used garment is usually a single physical unit.
- No stock reservation/decrement at checkout (there is no checkout).

### 2.9 Subscription requirements

- Tiered plans differentiated by **weekly listing quota (7–30)** and possibly analytics
  depth.
- Recurring billing, renewal, expiry, dunning (failed payment) handling.
- On expiry/lapse: seller loses ability to create new listings; existing listings
  hidden or frozen (**policy decision needed** — recommend: existing listings hidden,
  restored on renewal).

### 2.10 Security requirements

- Secure auth (email/Google/phone OTP), session management, RBAC (3 roles).
- PII protection + GDPR (EU "local" audience).
- Subscription payment security → **outsource card handling to Stripe (SAQ-A)**.
- Messaging abuse / scam prevention, content moderation, account-takeover prevention.
- Full detail in [`01-architecture-and-security.md`](01-architecture-and-security.md).

### 2.11 Scalability requirements

- "Thousands of users and transactions" is **small**. A single managed Postgres +
  stateless app + CDN handles this with room to spare. **Explicitly do not build
  microservices, sharding, or Kafka.** Over-engineering is the bigger risk than scale.

### 2.12 Administrative requirements

- Manage users/sellers (suspend, verify), categories (CRUD), **moderation queue**
  (needed *because* there's no pre-approval), reports & analytics, handle support
  tickets/disputes. Single admin/support role.

---

## 3. Ambiguities, conflicts, gaps, hidden assumptions

### 3.1 🔴 Direct conflicts (must resolve before build)

| Conflict | Answer A | Answer B | Impact |
|---|---|---|---|
| **C1 — Orders exist?** | Seller dashboard: "order management **yes**", "sales analytics **yes**", "revenue charts **yes**" | Checkout: "**no checkout**"; Order mgmt: tracking/returns/refunds/cancellation **all no**; Payments: subscription only | If no transaction touches the platform, there is **no order and no revenue data to manage or chart.** This is the biggest contradiction in the whole brief. |
| **C2 — Messaging in dashboard** | Messaging: "buyers contact sellers through msgs" (core flow) | Seller dashboard: "Messages: **no**" | The seller *must* see buyer messages somewhere. Contradiction. |
| **C3 — Reviews without transactions** | Reviews & ratings "**yes**" | No orders/transactions recorded on platform | With no proof-of-purchase, reviews are **unverifiable and trivially gamed** (fake reviews, seller self-reviews, retaliatory buyer reviews). |
| **C4 — Color** | Variants "able to pick the size", color mentioned | Color filter "**no**" | Do we store color at all? Recommend: store as free-text attribute, don't build a color facet. |

**Assumption I am making for C1/C2** (state it, proceed, flag for sign-off):
> The platform is **classifieds-only for MVP**. "Order management / sales analytics /
> revenue charts" in the seller dashboard will be interpreted as **listing analytics**:
> views, saves, wishlist adds, and **buyer-contact (lead) counts** per listing — *not*
> financial orders. "Messages: no" is overridden by the core requirement; sellers get a
> **messages inbox** in the dashboard. **These two assumptions need explicit client
> sign-off** because they change scope materially.

### 3.2 🟠 Gaps / missing requirements

- **G1 — Commission policy** left blank. With off-platform sales it's uncollectable;
  either (a) subscription-only forever, or (b) move to on-platform payments in v2 to
  enable commission. Needs a decision.
- **G2 — Subscription pricing & tiers** undefined (price points, what each tier unlocks).
- **G3 — Dispute/scam handling.** Buyers *will* get scammed on an off-platform,
  no-buyer-protection marketplace. Who is liable? What's the process? Currently undefined.
- **G4 — Listing lifecycle:** how is an item marked sold? Auto-expire? Relist? Undefined.
- **G5 — 2FA policy** unspecified. Recommend mandatory TOTP for admin, optional for users.
- **G6 — Content/IP:** counterfeit goods, prohibited items (underwear hygiene rules,
  weapons-adjacent accessories), image rights. No policy defined.
- **G7 — KYC for sellers:** taking recurring payment from sellers who may be businesses →
  identity/tax considerations, especially "international."
- **G8 — Data residency** for "local then international" (GDPR + non-EU expansion).
- **G9 — "Bank integration"** meaning is unclear (payout? subscription collection?).

### 3.3 🟡 Hidden assumptions in the brief

- **A1 — "There is no other website / gap in the market."** **False.** Vinted, Depop,
  eBay, Facebook Marketplace, Vestiaire Collective, Grailed, Wallapop all occupy this
  space, several with local strongholds. The differentiation is currently **undefined**
  → see Business Model Review §4.
- **A2 — "Everyone / everything / all ages / all genders / local→international."** This
  is **no positioning at all.** Marketplaces win by owning a niche first (Depop = Gen-Z
  vintage; Grailed = menswear/streetwear; Vestiaire = luxury). "Everything for everyone"
  is the classic cold-start killer.
- **A3 — Sellers will happily pay a subscription _before_ making any sales.** Unproven and
  risky — see §4 fraud/churn.
- **A4 — Reviews/ratings/recommendations/analytics/AI are cheap add-ons.** They are not,
  at this budget. They are v2+.

### 3.4 Technical risks

| Risk | Severity | Mitigation |
|---|---|---|
| Over-scoping to the enterprise template → budget burn | 🔴 High | Scope to classifieds core (this doc); cut Orders/Payments-for-goods/Refunds |
| No listing pre-approval + "everything" → illegal/counterfeit/unsafe content live instantly | 🔴 High | Post-hoc **moderation queue**, image scanning, report button, prohibited-items policy |
| Messaging = spam/scam/harassment vector | 🟠 Med | Rate limits, block/report, no contact-info leakage until connect, moderation |
| Single admin/support role vs moderation load | 🟠 Med | Automate triage via n8n; report-driven queues; keep niche small |
| Building custom auth/payments on a €2k budget | 🟠 Med | Use Supabase Auth + Stripe (buy, don't build) |
| PWA push + iOS quirks | 🟡 Low | Graceful email fallback |

### 3.5 Business risks — summary (full treatment in §4)

Disintermediation/leakage, cold-start, weak retention, trust & safety liability,
undifferentiated positioning, subscription-before-value friction.

---

## 4. Phase 2 — Business Model Review (critical challenge)

### 4.1 Is the model technically sound? — *Yes, but strategically fragile.*

A subscription-gated classifieds board is **trivial to build and cheap to run** (that's
why it fits the budget). The technical soundness is not the problem. The **business
soundness** is.

### 4.2 The core structural flaw: disintermediation / "leaky bucket"

The platform's only revenue is the seller subscription, but the platform delivers value
(the actual sale) **off-platform via messaging + seller-handled shipping.** Consequences:

- A seller can pay **one month**, harvest buyer contacts (phone/email exchanged in
  chat), move deals to WhatsApp/Instagram, and **cancel.** The platform captures none of
  the recurring transaction value.
- There is **no network lock-in**: buyers are free, so they have no switching cost, and
  sellers' value is "reach," which they'll re-create on free channels.
- This is precisely why successful resale marketplaces (Vinted, Depop, StockX) moved to
  **on-platform payments + commission + buyer protection** — it aligns platform revenue
  with the transaction and creates lock-in. **Classifieds models (Craigslist) survive
  only at massive scale/zero marginal cost, which a paid-subscription niche won't have.**

> **CTO recommendation (strong):** Treat subscription-only as the **MVP wedge**, but plan
> a **v2 pivot to optional on-platform payments + small commission + basic buyer
> protection.** It is the difference between a leaky lead-gen board and a defensible
> marketplace. Architect the DB and payment seam for it now (done in the ERD).

### 4.3 Cold-start / chicken-and-egg

Sellers won't pay a subscription without buyers; buyers won't come without inventory.
Charging sellers **upfront, before any proven sales**, makes the cold start *harder* than
free competitors.

> **Recommendation:** Launch with a **free seller trial / free tier** (e.g. first 30 days
> or first N listings free), convert to paid once sellers see buyer contacts. Consider
> **founding-seller** incentives. Reduces friction, seeds supply.

### 4.4 Scalability (operational, not technical)

Technically fine. Operationally, the bottleneck is **trust & safety / moderation**: no
pre-approval + "everything" + off-platform payment = a magnet for scams, counterfeits,
and prohibited items, all landing on a **single admin/support person.** This does not
scale with users.

> **Recommendation:** (1) Narrow the niche to shrink the moderation surface. (2)
> Automate triage with n8n (report clustering, keyword flags, image checks). (3) Add a
> lightweight seller-verification step for paid sellers (they're already giving payment
> details — use that as a soft KYC signal).

### 4.5 Legal / privacy concerns

- **GDPR fully applies** (EU users, PII, messages, phone numbers) *even without goods
  payments.* Need lawful basis, consent, DPA with sub-processors, retention policy,
  right-to-erasure (tricky with chat history), data-export.
- **Consumer-protection exposure:** even as an "intermediary," facilitating sales between
  users can create liability (distance-selling rules, marketplace duties under the EU
  Digital Services Act for content moderation and notice-and-action).
- **Counterfeit/IP liability** if branded fakes are listed with no moderation.

### 4.6 Fraud & abuse risks

| Vector | Description | Mitigation |
|---|---|---|
| **Seller subscription fraud** | Stolen cards to buy subscriptions, chargebacks | Stripe Radar, 3DS/SCA, block on chargeback |
| **Scam sellers** | Take payment off-platform, never ship | Off-platform = platform can't protect; **this is the model's Achilles heel** → v2 payments/escrow; meanwhile ratings + report + verification |
| **Disintermediation** | §4.2 | v2 on-platform payments |
| **Buyer abuse** | Spam/harass sellers, fake reviews, tyre-kickers | Rate limits, block/report, verified-contact reviews only |
| **Counterfeits / prohibited items** | No pre-approval | Moderation queue, prohibited-items policy, image scanning |
| **Account takeover** | Phone/email auth targeted | MFA, anomalous-login detection, session controls |

### 4.7 Moderation & support implications

With no pre-approval and a one-person admin/support, moderation must be **reactive +
automated**: report buttons everywhere, n8n-driven triage, clear policies, and the
ability to bulk-suspend. Budget for this operationally, not just technically.

### 4.8 Business-model verdict

**Buildable and affordable — but strategically fragile as specified.** My
recommendations, in priority order:

1. **Pick a niche** for launch (e.g. "local sustainable/vintage womenswear") instead of
   "everything for everyone." Positioning is survival.
2. **Free seller trial** to solve cold-start before charging.
3. **Plan v2 on-platform payments + commission + buyer protection** to fix
   disintermediation and create lock-in. Architect for it now.
4. **Invest in reactive moderation + prohibited-items policy** from day one (legal +
   trust).
5. **Resolve the C1/C2 contradictions** (orders/revenue/messages) before any code.

---

## 5. Assumptions register (for client sign-off)

| ID | Assumption | Why | Change-scope-if-wrong? |
|---|---|---|---|
| ASM-1 | Classifieds-only MVP; **no on-platform goods payments/orders/refunds** | Client's checkout/order/payment answers | 🔴 Major |
| ASM-2 | Seller dashboard "orders/sales/revenue" = **listing & lead analytics**, not financial orders | Resolves C1 | 🔴 Major |
| ASM-3 | Sellers **do** get a messages inbox (overrides "Messages: no") | Resolves C2 | 🟠 Med |
| ASM-4 | Reviews are **seller reputation** reviews, gated by a real buyer↔seller conversation to reduce fraud | Resolves C3 | 🟠 Med |
| ASM-5 | Color stored as attribute, **not** a filter facet | Resolves C4 | 🟢 Minor |
| ASM-6 | Subscription tiers differ by **weekly listing quota (7–30)** | F3 | 🟢 Minor |
| ASM-7 | Design = **"warm & simple"** → the *Earthy Sustainable* direction from the earlier concept work | Branding answer | 🟢 Minor |
| ASM-8 | "Bank integration" deferred; **Stripe Billing** for subscriptions in MVP | Feasibility/budget | 🟠 Med |
| ASM-9 | Single region, single locale at launch; schema ready for i18n/multi-currency later | "local then international" | 🟢 Minor |

---

## 6. What we are explicitly NOT building for MVP (and why)

- ❌ Checkout, cart-payment, order lifecycle, order items — *no on-platform transaction.*
- ❌ Refunds/returns/exchanges/cancellations for goods — *client said no + no payment.*
- ❌ PCI transactional scope / escrow — *Stripe handles subscription cards (SAQ-A).*
- ❌ Microservices, Kafka, sharding — *"thousands" of users is small; monolith wins.*
- ❌ Native mobile apps — *PWA per client.*
- ❌ Q&A, image zoom, 360° images, color/material/discount filters — *client said no.*
- ❌ Coupons, gift cards, taxes, shipping calculators — *client said no.*
- ⏳ Reviews, recommendations, AI, advanced analytics — *v2+ (budget).*

The full phased plan is in
[`06-tech-stack-and-roadmap.md`](06-tech-stack-and-roadmap.md).
