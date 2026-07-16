# ReWorn — User Flows & Journey Maps
### Phase 6

> Reflects the **classifieds model**: buyers contact sellers and transact off-platform;
> the only on-platform payment is the **seller subscription**. "Purchase/checkout/refund"
> flows are therefore **conversation-driven**, not cart-driven.

---

## 1. Roles recap

| Role | Gate | Core jobs-to-be-done |
|---|---|---|
| Buyer | Free account | Discover items, save/wishlist, **contact seller**, review |
| Seller | Paid subscription | Subscribe, list within quota, manage listings, message buyers, view analytics |
| Admin/Support (one role) | Internal | Moderate content, manage users/sellers/categories, handle reports & support, view reports/analytics |

---

## 2. Buyer flow

### 2.1 Registration & onboarding
```mermaid
flowchart TD
    A[Land on marketplace] --> B{Browse or sign up?}
    B -->|Browse| C[View listings - public]
    C --> D{Wants to contact / save?}
    D -->|Yes| E[Prompt sign up/login]
    B -->|Sign up| E
    E --> F[Choose method: email / Google / phone OTP]
    F --> G[Verify email or phone]
    G --> H[Set display name + optional avatar]
    H --> I[Optional: consent to notifications]
    I --> J[Buyer home - personalised feed]
```

### 2.2 Discover → contact (the primary conversion)
```mermaid
flowchart TD
    A[Search / filter: category,size,price,condition,gender] --> B[Results grid]
    B --> C[Open product page]
    C --> D{Actions}
    D -->|Wishlist| E[Add to wishlist]
    D -->|Save| F[Add to saved items]
    D -->|Contact seller| G{Logged in?}
    G -->|No| H[Auth wall] --> I[Login]
    G -->|Yes| J[Open/start conversation about this product]
    I --> J
    J --> K[Send message + optional image]
    K --> L[Seller notified: in-app + email/push]
    L --> M[Buyer & seller agree terms off-platform]
    M --> N[Seller ships; deal completes off-platform]
    N --> O[Buyer may leave a seller review - gated by this conversation]
```

### 2.3 Buyer "dispute" (no on-platform payment)
Because money doesn't flow through ReWorn, disputes are **trust-and-safety**, not
refunds:
```mermaid
flowchart TD
    A[Buyer has a problem: scam / item not as described] --> B[Report seller or listing]
    B --> C[Moderation queue - admin]
    C --> D{Assessment}
    D -->|Valid| E[Warn / suspend / ban seller + hide listing]
    D -->|Invalid| F[Dismiss + notify reporter]
    E --> G[Audit log entry]
    F --> G
```
> ⚠️ There is **no platform refund** — the buyer paid the seller directly. This is the
> model's core limitation and the #1 reason to consider v2 on-platform payments.

---

## 3. Seller flow

### 3.1 Registration → subscription onboarding
```mermaid
flowchart TD
    A[User taps 'Become a seller'] --> B{Has account?}
    B -->|No| C[Sign up + verify]
    B -->|Yes| D[Create seller profile: shop name, business?]
    C --> D
    D --> E[Choose subscription plan - tier = weekly quota 7..30]
    E --> F[Stripe Checkout - SCA/3DS]
    F --> G{Payment result}
    G -->|Success webhook| H[subscription=active -> seller role unlocked]
    G -->|Failure| I[Show retry + dunning]
    H --> J[Seller onboarding: payout/ship prefs, first listing prompt]
```
> **Recommendation applied:** offer a **free trial / first-N-free** at step E to beat the
> cold-start (see business review §4.3).

### 3.2 Listing a product (with quota enforcement)
```mermaid
flowchart TD
    A[New listing] --> B{Subscription active?}
    B -->|No| X[Block + prompt to subscribe/renew]
    B -->|Yes| C{Within weekly quota?}
    C -->|No| Y[Block: quota reached, resets Monday]
    C -->|Yes| D[Enter details: title, category, gender, condition, price]
    D --> E[Add size variants + color attribute]
    E --> F[Upload images -> signed upload -> validate + re-encode + EXIF strip]
    F --> G[Publish immediately - no pre-approval]
    G --> H[increment listing_usage; images queued for async moderation scan]
    H --> I[Listing live + searchable]
```

### 3.3 Managing sales & messages
```mermaid
flowchart TD
    A[Seller dashboard] --> B[Listings: active/sold/hidden/expired]
    A --> C[Messages inbox - buyer conversations]
    A --> D[Analytics: views, saves, wishlist adds, buyer contacts/leads]
    A --> E[Subscription: plan, renewal, invoices]
    C --> F[Reply to buyer + attach image]
    F --> G[Agree + ship off-platform]
    G --> H[Mark item as sold]
    E --> I{Renew / upgrade / cancel}
```

### 3.4 Subscription lifecycle
```mermaid
stateDiagram-v2
    [*] --> Trialing: start free trial (optional)
    Trialing --> Active: first successful charge
    [*] --> Active: subscribe (no trial)
    Active --> PastDue: invoice.payment_failed
    PastDue --> Active: retry succeeds (dunning)
    PastDue --> Expired: retries exhausted / grace ends
    Active --> Canceled: seller cancels
    Canceled --> Expired: period ends
    Expired --> Active: re-subscribe
    Expired --> [*]
    note right of Expired
      New listings blocked;
      existing listings hidden (restored on renewal)
    end note
```

---

## 4. Administrator / Support flow (single combined role)

```mermaid
flowchart TD
    A[Admin login + mandatory MFA] --> B[Admin console]
    B --> C[Moderation queue - reports]
    C --> C1{Action}
    C1 -->|Remove listing| C2[Hide + notify seller + audit]
    C1 -->|Suspend user| C3[Status=suspended + audit]
    C1 -->|Dismiss| C4[Close report]
    B --> D[User & seller management: verify, suspend, ban]
    B --> E[Category management: CRUD]
    B --> F[Reports & analytics: signups, active sellers, listings, leads, revenue from subs]
    B --> G[Support tickets - from reports / contact form]
    G --> G1[Respond, escalate, resolve]
    B --> H[Subscription oversight - read-only Stripe state]
```

### 4.1 Support ticket / dispute handling
```mermaid
flowchart TD
    A[Ticket created: user report / email / n8n auto-create] --> B[Triage priority]
    B --> C{Category}
    C -->|Fraud/scam| D[Investigate conversation + listing history]
    C -->|Account/billing| E[Check subscription + Stripe]
    C -->|Content| F[Review flagged item/message]
    D --> G[Action: warn/suspend/ban + audit]
    E --> G
    F --> G
    G --> H[Notify user + close + log]
```

---

## 5. Cross-cutting: authentication flow
```mermaid
flowchart TD
    A[Login] --> B{Method}
    B -->|Email+password| C[Verify credential]
    B -->|Google| D[OAuth redirect + callback]
    B -->|Phone| E[Send OTP -> verify code]
    C --> F{MFA enabled?}
    D --> F
    E --> F
    F -->|Yes| G[Prompt TOTP]
    F -->|No| H[Issue session]
    G --> H
    H --> I[Access + refresh tokens; role claim set]
    I --> J{Risk signals? new device / impossible travel}
    J -->|Yes| K[Step-up MFA + email alert]
    J -->|No| L[Enter app]
```

---

## 6. Notification & messaging flow
```mermaid
flowchart TD
    A[Buyer sends message] --> B[messages row created]
    B --> C[Emit domain event -> n8n]
    C --> D{Recipient prefs}
    D -->|In-app| E[notifications row -> bell badge]
    D -->|Email| F[Transactional email]
    D -->|Push| G[Web Push - PWA]
    E --> H[Seller opens inbox -> is_read=true]
    F --> H
    G --> H
```

---

## 7. Journey maps (experience view)

### 7.1 Buyer journey map
| Stage | Goal | Touchpoints | Emotions | Risks / drop-off | Design response |
|---|---|---|---|---|---|
| Discover | Find items worth buying | Home, search, filters | Curious | Poor relevance, "everything" noise | Strong filters, niche curation, fast image grid |
| Evaluate | Trust the item & seller | Product page, images, seller rating | Cautious | No buyer protection fear | Seller ratings, verification badge, clear condition |
| Connect | Reach the seller | Contact button, auth wall, chat | Motivated | Auth friction, slow reply | Fast social/OTP login, push nudges to seller |
| Transact | Agree & pay (off-platform) | Chat, external payment | Anxious | **Scam risk** | Safety tips, report button; **v2 on-platform pay** |
| Post | Feel good / recommend | Review, wishlist | Satisfied/annoyed | Bad experience → churn | Gated reviews, easy re-engagement |

### 7.2 Seller journey map
| Stage | Goal | Touchpoints | Emotions | Risks / drop-off | Design response |
|---|---|---|---|---|---|
| Consider | Is it worth paying? | Pricing page | Skeptical | Pay-before-value friction | **Free trial**, show buyer demand |
| Subscribe | Start selling | Stripe checkout | Committed | Payment failure | SCA-ready, dunning, retries |
| List | Get items live fast | Listing form, image upload | Eager | Upload friction, quota confusion | 3-min flow, clear quota meter |
| Sell | Convert contacts | Inbox, analytics | Hopeful | Slow/no buyers (cold start) | Lead analytics, notifications, seeding |
| Retain | Keep subscribing | Dashboard, renewal | Value-seeking | **Disintermediation churn** | Show ongoing lead value; **v2 lock-in via payments** |

---

## 8. Flow-level risks surfaced
- **Auth wall at "contact seller"** is the key conversion gate — keep it frictionless
  (one-tap Google / phone OTP).
- **Quota confusion** (7–30/week, resets weekly) — show a visible quota meter.
- **No-refund reality** must be communicated honestly to buyers (safety guidance) to
  limit reputational damage and DSA/consumer-law exposure.
- **Seller retention** is the whole business — the dashboard must continuously *prove
  lead value*, or churn kills the subscription model.
