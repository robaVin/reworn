# ReWorn — Technical Discovery & Architecture Package

CTO-level analysis of the fashion buy/sell marketplace, produced from the client
discovery answers. **Start with the executive summary — it reframes the whole project.**

## ⚠️ The one thing to read first
The client's answers describe a **subscription-gated classifieds / lead-generation
marketplace** (buyers contact sellers, deals happen off-platform, seller ships) — **not**
the transactional eCommerce platform the 10-phase template implies. ~60% of the template
(orders, goods-payments, refunds, checkout, PCI transactional scope) is **out of scope**.
Budget (€1,300–€2,000) fits the *scoped* MVP only. Full reasoning in doc 00.

## Documents
| Doc | Covers | Requested phases / deliverables |
|---|---|---|
| [00 — Executive Summary & Requirements](00-executive-summary-and-requirements.md) | Reframing, budget reality, requirements extraction, ambiguities/conflicts/gaps, **business model review**, assumptions register, out-of-scope | Phase 1, Phase 2, Risk Assessment, PRD core |
| [01 — Architecture & Security](01-architecture-and-security.md) | Full production architecture + security-first design + attack-vector ranking | Phase 3, Phase 4, Security Review, Software Architecture Doc |
| [02 — Database & ERD](02-database-erd.md) | Normalized schema, Mermaid ERD, every relationship, indexes/RLS | Phase 5, Database ERD |
| [03 — User Flows & Journey Maps](03-user-flows.md) | Buyer/seller/admin/support flows, auth/messaging flows, journey maps | Phase 6, User Journey Maps |
| [04 — n8n Automations](04-n8n-automations.md) | All 20 workflows: trigger/nodes/APIs/conditions/retries/errors/logging/security | Phase 7 |
| [05 — Diagrams](05-diagrams.md) | System, backend, API, auth, payment, order lifecycle, messaging, n8n, mind map, feature dependency | Phase 8, all diagrams |
| [06 — Tech Stack & Roadmap](06-tech-stack-and-roadmap.md) | Stack recommendations w/ trade-offs; phased roadmap with risks/testing/deploy | Phase 9, Phase 10, Development Roadmap |

## Final deliverables → location
- **Technical Specification** → docs 01, 02, 05, 06
- **PRD** → doc 00 (requirements, roles, scope) + doc 03 (flows)
- **Software Architecture Document** → doc 01 (+ 05 diagrams)
- **Database ERD** → doc 02
- **System Architecture Diagrams** → doc 05
- **User Journey Maps** → doc 03
- **Mind Maps** → doc 05 §11
- **n8n Workflow Diagrams** → doc 04 + doc 05 §9
- **API Design Recommendations** → doc 01 §A.4 + doc 05 §3–4
- **Security Review** → doc 01 Part B
- **Risk Assessment** → doc 00 §3–4 + per-phase risks in doc 06
- **Development Roadmap** → doc 06 Part B

## Top decisions requiring client sign-off (before any code)
1. **Confirm classifieds model** (no on-platform goods payments) — resolves the C1/C2
   contradictions (orders/revenue/messages).
2. **Pick a launch niche** instead of "everything for everyone."
3. **Free seller trial?** (to beat the cold-start before charging subscriptions).
4. **Subscription tiers & prices** (quota 7–30/week mapping).
5. **Acknowledge v2 on-platform payments** as the strategic fix for disintermediation,
   quoted separately from the MVP budget.

## Rendering the diagrams
All diagrams are **Mermaid** — they render on GitHub/GitLab, in VS Code (Mermaid
extension), Obsidian, or at mermaid.live. The `mindmap` block needs a recent Mermaid
version.
