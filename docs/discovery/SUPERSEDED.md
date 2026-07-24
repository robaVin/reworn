# ⚠️ SUPERSEDED — historical planning material

The documents in this `discovery/` folder are the **original pre-implementation
discovery and planning set**. They are retained for history and rationale only.

**They are superseded by the code and by the canonical docs in
[`../`](../README.md).** Where anything here conflicts with the implemented
system, the code and canonical docs are correct.

Known divergences from the current implementation:

- **Payments:** these docs reference **Stripe**. Stripe does not onboard
  merchants in North Macedonia; the platform is now designed around a **local
  bank gateway (likely CaSys / CPay)**, kept fully provider-independent until
  official documentation and credentials arrive. See [`../PAYMENTS.md`](../PAYMENTS.md).
- **Business model:** some diagrams/tables here include transactional
  eCommerce concepts (checkout, orders, payouts, sales revenue). ReWorn is a
  **classifieds** marketplace — none of those exist. The only platform payment
  is the seller subscription.
- **Numbering:** the "Phase/Increment" numbering in these documents predates the
  approved [`../ROADMAP.md`](../ROADMAP.md) and does not match it.

Do not use these documents to drive implementation decisions. Start from
[`../README.md`](../README.md).
