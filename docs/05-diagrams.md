# ReWorn — Diagrams
### Phase 8 · Rendered-ready Mermaid

> The full **ERD** lives in [`02-database-erd.md`](02-database-erd.md); **user journeys &
> auth/messaging flows** in [`03-user-flows.md`](03-user-flows.md). This file adds the
> system, backend, API, payment, order-lifecycle, n8n, mind-map, and dependency diagrams.

---

## 1. ERD
See [`02-database-erd.md`](02-database-erd.md) §2 for the complete Mermaid ERD.

---

## 2. High-level system architecture
```mermaid
flowchart TB
    subgraph Client
      PWA["Next.js PWA<br/>React + Service Worker"]
    end
    subgraph Edge
      CDN["CDN / Image Transform"]
      WAF["WAF / Bot protection<br/>(Cloudflare/Turnstile)"]
    end
    subgraph App["Modular Monolith (Next.js server)"]
      AUTHM[Auth module]
      CAT[Catalog module]
      MSG[Messaging module]
      SUB[Subscription module]
      NOT[Notification module]
      MOD[Moderation module]
      ANA[Analytics module]
    end
    subgraph Data
      PG[("PostgreSQL<br/>+ RLS")]
      OBJ[("Object Storage")]
      RED[("Redis (optional)")]
    end
    subgraph External
      SAUTH[Supabase Auth]
      STRIPE[Stripe Billing]
      N8N[n8n Automations]
      MAIL[Email Provider]
      PUSH[Web Push]
    end

    PWA --> WAF --> CDN --> App
    App --> AUTHM --> SAUTH
    App --> CAT --> PG
    App --> MSG --> PG
    App --> SUB --> STRIPE
    STRIPE -- webhooks --> App
    App --> OBJ
    CDN --> OBJ
    App -- events/webhooks --> N8N
    N8N --> MAIL
    N8N --> PUSH
    N8N --> PG
    App -. cache .-> RED
    NOT --> N8N
    MOD --> PG
    ANA --> PG
```

---

## 3. Backend service (module) diagram
```mermaid
flowchart LR
    GW[API Gateway / Route Handlers<br/>authN + rate limit + validation]
    GW --> AUTH[Auth Service]
    GW --> USER[User/Profile Service]
    GW --> SELLER[Seller & Subscription Service]
    GW --> CATALOG[Catalog Service]
    GW --> SEARCH[Search Service - Postgres FTS]
    GW --> MSGS[Messaging Service]
    GW --> NOTIF[Notification Service]
    GW --> MODS[Moderation/Reports Service]
    GW --> ANALYTICS[Analytics Service]

    SELLER --> STRIPE[(Stripe)]
    AUTH --> SUPA[(Supabase Auth)]
    CATALOG --> DB[(Postgres)]
    MSGS --> DB
    MODS --> DB
    ANALYTICS --> DB
    NOTIF --> Q[[n8n / queue]]
    CATALOG --> STORE[(Object Storage)]

    classDef ext fill:#eee,stroke:#999;
    class STRIPE,SUPA ext;
```

---

## 4. API interaction diagram (representative endpoints)
```mermaid
sequenceDiagram
    participant U as PWA
    participant API as API (v1)
    participant DB as Postgres(RLS)
    participant S as Supabase Auth
    participant St as Stripe

    U->>S: POST /auth (email/google/phone)
    S-->>U: JWT (role claim) + refresh
    U->>API: GET /v1/products?category&size&price (Bearer)
    API->>DB: SELECT ... (RLS: public active)
    DB-->>API: rows
    API-->>U: 200 listings

    U->>API: POST /v1/conversations {product_id} (Bearer buyer)
    API->>DB: INSERT conversation (RLS: buyer=self)
    API-->>U: 201 conversation

    U->>API: POST /v1/subscriptions/checkout (Bearer seller)
    API->>St: create Checkout Session
    St-->>API: session url
    API-->>U: 200 {url}
    St-->>API: webhook invoice.paid (signed)
    API->>DB: UPDATE subscription=active
```

---

## 5. Authentication flow
```mermaid
sequenceDiagram
    participant U as User
    participant App
    participant Auth as Supabase Auth
    participant Risk as Risk/ATO check
    U->>App: choose method (email/google/phone)
    App->>Auth: authenticate
    Auth-->>App: identity + tokens
    App->>Risk: evaluate device/geo/velocity
    alt risky
        Risk-->>App: require step-up
        App->>U: TOTP / OTP challenge + email alert
        U->>App: code
    end
    App-->>U: session (access+refresh), role claim
    Note over App: RLS enforces per-row authz on every query
```

---

## 6. Payment flow (seller subscription)
```mermaid
sequenceDiagram
    participant S as Seller (PWA)
    participant App
    participant Stripe
    participant DB
    participant N8N
    S->>App: Select plan (tier=quota)
    App->>Stripe: Create Checkout Session (SCA/3DS)
    Stripe-->>App: session URL
    App-->>S: redirect to Stripe (card never touches App - PCI SAQ-A)
    S->>Stripe: enter card + 3DS
    Stripe-->>App: webhook checkout.session.completed / invoice.paid (signed)
    App->>App: verify signature + idempotency
    App->>DB: subscription=active, unlock seller role, record payment+txn
    App->>N8N: emit payment.success
    N8N-->>S: receipt email + in-app notification
    Note over Stripe,App: invoice.payment_failed -> past_due -> dunning -> expired
```

---

## 7. Order lifecycle
> MVP is **classifieds** — the "order" is a conversation that completes off-platform. The
> second diagram shows the **v2 transactional** lifecycle the schema is ready for.

**MVP (conversation lifecycle):**
```mermaid
stateDiagram-v2
    [*] --> Listed
    Listed --> Contacted: buyer messages seller
    Contacted --> Negotiating: replies exchanged
    Negotiating --> AgreedOffPlatform: terms agreed
    AgreedOffPlatform --> Shipped: seller ships (off-platform)
    Shipped --> Completed: buyer receives
    Completed --> Reviewed: buyer reviews seller
    Negotiating --> Abandoned: no response
    Listed --> Sold: seller marks sold
    Reviewed --> [*]
    Abandoned --> [*]
```

**v2 (transactional lifecycle):**
```mermaid
stateDiagram-v2
    [*] --> Pending: buyer checks out (on-platform)
    Pending --> Paid: payment captured (escrow)
    Paid --> Shipped: seller ships + tracking
    Shipped --> Delivered
    Delivered --> Completed: buyer confirms / auto after N days -> payout - commission
    Paid --> Disputed: buyer opens dispute
    Disputed --> Refunded
    Disputed --> Completed
    Completed --> [*]
    Refunded --> [*]
```

---

## 8. Messaging flow
See [`03-user-flows.md`](03-user-flows.md) §6. Summary:
```mermaid
flowchart LR
    B[Buyer] -->|POST message| API
    API --> DB[(messages)]
    DB --> RT[Realtime/poll]
    RT --> Seller
    API -->|event| N8N
    N8N --> Email & Push & Bell
    Seller -->|reply + image| API
```

---

## 9. n8n workflow diagrams (representative)

**Seller subscription payment success (WF #7):**
```mermaid
flowchart TD
    T[Stripe webhook invoice.paid] --> V{Signature valid?}
    V -->|No| R[Reject 400 + alert]
    V -->|Yes| I{Idempotent? already processed?}
    I -->|Yes| End1[Ack 200 - no-op]
    I -->|No| U[Set subscription active + unlock role]
    U --> L[Record payment + transaction]
    L --> N[Send receipt + in-app notif]
    N --> A[Audit log] --> End2[Ack 200]
    U -.error.-> E[Error trigger -> ops alert + DLQ]
```

**Post-hoc image moderation (WF #5):**
```mermaid
flowchart TD
    T[product.published] --> F[Fetch images via signed URL]
    F --> S[NSFW/counterfeit/AV scan]
    S --> D{Result}
    D -->|Clean| OK[moderation_status=approved]
    D -->|Suspicious| FL[flag + create report + notify admin]
    S -.hard fail.-> MAN[Route to manual review - fail safe]
    OK --> Log[Audit]
    FL --> Log
```

**Fraud detection (WF #19):**
```mermaid
flowchart TD
    T[events + schedule] --> H[Compute signals: velocity, dup images, chargeback, geo]
    H --> SC[Risk score]
    SC --> TH{Over threshold?}
    TH -->|No| End[Store score]
    TH -->|Yes| ACT[Auto-throttle/suspend + create admin report]
    ACT --> NOT[Notify admin] --> AUD[Audit]
```

---

## 10. User journey maps
See [`03-user-flows.md`](03-user-flows.md) §7 (buyer & seller experience tables) and
§2–4 (flowcharts).

---

## 11. Product mind map
```mermaid
mindmap
  root((ReWorn))
    Buyers
      Discover
        Search
        Filters: category/size/price/condition/gender
        Recently viewed
        Similar items
      Save
        Wishlist
        Saved items
      Connect
        Contact seller
        Messaging + images
      Trust
        Seller ratings
        Reports
    Sellers
      Subscription
        Plans by weekly quota 7-30
        Trial
        Billing/dunning
      Listings
        Create (no pre-approval)
        Size variants
        Images
        Quota meter
      Dashboard
        Lead analytics
        Messages inbox
        Subscription mgmt
    Admin
      Moderation queue
      User/seller mgmt
      Categories
      Reports & analytics
      Support tickets
    Platform
      Auth: email/google/phone + MFA
      Payments: Stripe subs (SAQ-A)
      Notifications: in-app/email/push
      Automation: n8n
      Security & GDPR
      PWA
    Future v2
      On-platform payments + commission
      Buyer protection/escrow
      Recommendations/AI
      Followed sellers / social
```

---

## 12. Feature dependency diagram
```mermaid
flowchart TD
    AUTH[Authentication + RBAC] --> PROFILE[Profiles]
    AUTH --> SELLER[Seller profile]
    SELLER --> SUBS[Subscriptions - Stripe]
    SUBS --> QUOTA[Weekly quota enforcement]
    QUOTA --> LISTING[Product listings]
    CAT[Categories] --> LISTING
    LISTING --> VARIANTS[Size variants]
    LISTING --> IMAGES[Image upload + validation]
    IMAGES --> MODERATION[Post-hoc moderation]
    LISTING --> SEARCH[Search + filters]
    SEARCH --> DISCOVERY[Discovery/feed]
    DISCOVERY --> WISHLIST[Wishlist/saved]
    DISCOVERY --> MESSAGING[Buyer-seller messaging]
    MESSAGING --> NOTIF[Notifications]
    MESSAGING --> REVIEWS[Gated reviews]
    REVIEWS --> RATINGS[Seller ratings]
    MESSAGING --> REPORTS[Reports]
    REPORTS --> MODERATION
    NOTIF --> N8N[n8n automation]
    SUBS --> N8N
    MODERATION --> ADMIN[Admin console]
    REPORTS --> ADMIN
    ANALYTICS[Lead analytics] --> DASH[Seller dashboard]
    LISTING --> ANALYTICS
    MESSAGING --> ANALYTICS

    subgraph v2
      PAYMENTS[On-platform payments] --> COMMISSION[Commission]
      PAYMENTS --> ESCROW[Buyer protection]
      RECS[Recommendation engine]
    end
    MESSAGING -.enables.-> PAYMENTS
    RATINGS -.feeds.-> RECS
```

**Critical path for MVP (build order):** Auth+RBAC → Seller profile → Subscriptions →
Quota → Categories/Listings → Images+Moderation → Search/Discovery → Messaging →
Notifications → Reviews/Reports → Admin console → Analytics dashboard.
