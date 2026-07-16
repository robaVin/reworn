# ReWorn — n8n Automation Design
### Phase 7

> n8n is the **orchestration + business-automation layer**: it keeps side-effects
> (emails, notifications, moderation triage, scheduled sweeps) **out of the request path**
> and gives non-developers visibility into business flows. The app emits **signed
> webhooks / events**; n8n does the fan-out with retries, logging, and error handling.

---

## Conventions (apply to every workflow)

- **Security:** every inbound webhook is authenticated with an **HMAC signature header**
  (shared secret) + IP allow-list; Stripe webhooks verified with Stripe's signature.
  Secrets stored in n8n credentials, never inline. All calls over HTTPS. n8n behind auth,
  not publicly writable.
- **Retries:** external calls use exponential backoff (e.g. 3–5 attempts). Idempotency
  keys on anything that charges/creates to avoid duplicates on retry.
- **Error handling:** each workflow has an **Error Trigger** → logs to `audit_logs`/ops
  channel → routes to a dead-letter store for manual replay.
- **Logging:** structured log node at start (input) and end (result) with a correlation
  id; PII minimised in logs.
- **Templating:** all user-facing copy via a central email/notification template service.

---

## 1. User Registration
- **Trigger:** app webhook `user.created`.
- **Nodes:** Validate signature → create/verify profile defaults → enqueue Email
  Verification → tag in analytics → respond 200.
- **APIs:** internal Users API, email provider.
- **Conditions:** skip if OAuth (email already verified by Google).
- **Retries/Errors:** retry email send; error → ops alert.
- **Security:** HMAC; no password/PII in logs.

## 2. Email Verification
- **Trigger:** `email.verify.requested` (from #1 or resend).
- **Nodes:** Generate signed, expiring token → send templated verification email → log.
- **Conditions:** rate-limit resends (max N/hour).
- **Errors:** bounce handling → mark email invalid → prompt correction.
- **Security:** single-use, short-TTL token; no enumeration.

## 3. Password Reset
- **Trigger:** `password.reset.requested`.
- **Nodes:** Always return generic success (anti-enumeration) → if user exists, send
  signed expiring reset link → audit log.
- **Conditions:** throttle per email+IP.
- **Errors:** retry send; alert on provider failure.
- **Security:** single-use token, 15-min TTL, invalidate on use/login.

## 4. Welcome Email
- **Trigger:** `email.verified`.
- **Nodes:** Send welcome + "how it works" (buyer or seller variant) → set onboarding flag.
- **Conditions:** branch by role (buyer vs seller CTA).
- **Errors:** retry; non-critical → swallow after retries + log.

## 5. Product Approval
> **Note:** client chose **no pre-approval**. This workflow is **post-hoc image
> moderation**, not gatekeeping.
- **Trigger:** `product.published` / `image.uploaded`.
- **Nodes:** Fetch images → **NSFW/counterfeit/AV scan** (vision API / ClamAV) →
  {clean → mark approved} / {suspicious → set `moderation_status=flagged` + create report
  + notify admin} → log.
- **APIs:** moderation/vision API, internal Products API.
- **Retries:** retry scan on transient failure; on hard fail → flag for manual review
  (fail safe, not fail open).
- **Security:** scanned images fetched via signed URLs; results audited.

## 6. Order Confirmation
> **MVP:** N/A (no on-platform orders). Provided as **v2 (transactional pivot)**.
- **Trigger (v2):** `order.created`.
- **Nodes:** Email buyer + seller, create order records, notify.
- Kept as a stub so the pivot needs no redesign.

## 7. Payment Success (seller subscription)
- **Trigger:** Stripe webhook `invoice.paid` / `checkout.session.completed`.
- **Nodes:** Verify Stripe signature → **idempotency check** → set subscription `active`,
  unlock seller role → record `payments`/`transactions` → send receipt email → in-app
  notification → audit.
- **Conditions:** ignore duplicate events (idempotency).
- **Errors:** reconcile mismatch → ops alert; never double-grant access.
- **Security:** Stripe signature mandatory; amounts validated server-side.

## 8. Payment Failure
- **Trigger:** Stripe `invoice.payment_failed`.
- **Nodes:** Set `past_due` → **dunning**: schedule retry reminders (email + in-app) over
  grace window → if unresolved → set `expired`, hide listings, notify seller → audit.
- **Retries:** Stripe Smart Retries + our reminder cadence.
- **Security:** signature verified; no card data handled.

## 9. Subscription Renewal
- **Trigger:** Stripe `invoice.paid` on renewal (or scheduled pre-renewal check).
- **Nodes:** Extend `current_period_end` → optional pre-renewal reminder (X days prior) →
  receipt → audit.
- **Conditions:** skip reminder if auto-renew + healthy card.

## 10. Subscription Expiration
- **Trigger:** Stripe `customer.subscription.deleted` **or** scheduled sweep (daily) for
  `current_period_end < now`.
- **Nodes:** Set `expired` → **hide seller listings** → block new listings → send
  win-back email → audit.
- **Errors:** ensure idempotent state transition.

## 11. Shipping Updates
> Seller handles shipping off-platform; no carrier integration in MVP.
- **Trigger:** seller marks item shipped in chat (`message.shipping_note`).
- **Nodes:** Notify buyer (in-app/email) with seller's note. **No tracking numbers/labels**
  (client said no).
- Kept minimal by design.

## 12. Low Inventory Alerts
> Second-hand items are usually qty 1. Reinterpreted as **quota / listing-health alerts**.
- **Trigger:** scheduled + `listing_usage.updated`.
- **Nodes:** If seller near/at weekly quota → notify ("2 listings left this week"); if a
  variant qty hits 0 → prompt "mark sold?" → log.

## 13. Seller Notifications (aggregator)
- **Trigger:** events `message.received`, `product.flagged`, `review.created`,
  `quota.reached`, `subscription.*`.
- **Nodes:** Resolve seller prefs → fan-out in-app/email/push → dedupe/batch (digest
  option) → mark delivered.
- **Errors:** per-channel retry; fall back to email.

## 14. Buyer Notifications (aggregator)
- **Trigger:** `message.reply`, `wishlist.price_drop` (optional), `seller.new_listing`
  (followed sellers, v2).
- **Nodes:** Prefs → fan-out → batch → deliver.
- **Conditions:** respect consent; unsubscribe honored.

## 15. Admin Alerts
- **Trigger:** `report.created`, fraud signals, payment reconciliation mismatch, error
  triggers.
- **Nodes:** Severity classify → route (email/Slack/console) → create/update support
  ticket → audit.
- **Conditions:** escalate high-severity (illegal content, chargeback fraud) immediately.

## 16. Refund Processing
> **MVP:** N/A for goods (no on-platform payment). Applies only to **subscription
> refunds** (rare, admin-initiated) and stubbed for v2 goods refunds.
- **Trigger:** admin `subscription.refund.requested` / Stripe `charge.refunded`.
- **Nodes:** Verify eligibility → Stripe refund API (idempotent) → update
  `payments`/`transactions` → notify seller → audit.
- **Security:** admin-only, MFA-gated action; signature-verified Stripe callback.

## 17. Review Requests
- **Trigger:** scheduled sweep — conversation inactive N days after active exchange
  (proxy for "deal likely done").
- **Nodes:** Check no review yet + conversation qualifies → send review invite to buyer →
  log.
- **Conditions:** one request per conversation; respect opt-out.
- **Security:** review link tied to that conversation (authenticity gate, ASM-4).

## 18. Abandoned Cart Recovery
> No checkout cart → reinterpreted as **abandoned wishlist / saved-items / stalled
> conversation** re-engagement.
- **Trigger:** scheduled — saved item untouched X days, or buyer viewed listing 3×
  without contacting.
- **Nodes:** Send gentle nudge ("still interested? message the seller") + price-drop info
  → log.
- **Conditions:** frequency cap; consent required.

## 19. Fraud Detection Alerts
- **Trigger:** events + scheduled heuristics — mass listing velocity, mass messaging,
  duplicate images across sellers, chargeback, new-account bursts, impossible-travel logins.
- **Nodes:** Score → threshold → {auto-throttle/suspend} + create admin report + notify →
  audit.
- **Retries/Errors:** must **fail safe** (flag, don't silently drop).
- **Security:** signals from server only; never trust client.

## 20. Customer Support Ticket Creation
- **Trigger:** `report.created`, contact-form submit, inbound support email, escalations
  from other workflows.
- **Nodes:** Normalize → dedupe against open tickets → create ticket + priority → assign to
  admin/support → acknowledge to user → audit.
- **Conditions:** auto-merge duplicates; SLA timers for high priority.

---

## n8n workflow catalogue (status at MVP)

| # | Workflow | MVP status | Notes |
|---|---|---|---|
| 1 | User Registration | ✅ | |
| 2 | Email Verification | ✅ | |
| 3 | Password Reset | ✅ | |
| 4 | Welcome Email | ✅ | |
| 5 | Product (image) Moderation | ✅ | post-hoc, not approval |
| 6 | Order Confirmation | ⏳ v2 | no on-platform orders |
| 7 | Payment Success (sub) | ✅ | |
| 8 | Payment Failure (dunning) | ✅ | |
| 9 | Subscription Renewal | ✅ | |
| 10 | Subscription Expiration | ✅ | |
| 11 | Shipping Updates | ✳️ minimal | note-only, no carrier |
| 12 | Quota/Listing Alerts | ✅ | reinterpreted |
| 13 | Seller Notifications | ✅ | |
| 14 | Buyer Notifications | ✅ | |
| 15 | Admin Alerts | ✅ | |
| 16 | Refund Processing | ✳️ subs only | goods refunds v2 |
| 17 | Review Requests | ✅ | |
| 18 | Re-engagement (abandoned) | ✅ | wishlist/convo, not cart |
| 19 | Fraud Detection Alerts | ✅ | high priority |
| 20 | Support Ticket Creation | ✅ | |
