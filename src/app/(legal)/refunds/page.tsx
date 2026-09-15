import type { Metadata } from 'next';
import Link from 'next/link';
import {
  LegalPage,
  LegalSection,
  LegalList,
  LegalNote,
} from '@/components/legal/LegalPage';
import { COMPANY } from '@/config/company';

export const metadata: Metadata = {
  title: 'Subscription, Refunds & Cancellation',
  description:
    'Terms for the ReWorn seller subscription, including cancellation and refunds.',
  alternates: { canonical: '/refunds' },
  robots: { index: true, follow: true },
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Subscription, Refunds & Cancellation"
      lastUpdated={COMPANY.lastUpdated}
      intro={
        <>
          This policy applies to the {COMPANY.tradingName}{' '}
          <strong>seller subscription</strong> — the only payment processed
          through {COMPANY.tradingName}. It does not apply to sales of items
          between users, which happen directly and are not handled by us (see
          section 5).
        </>
      }
    >
      <LegalSection heading="1. What you are paying for">
        <p>
          The seller subscription is a <strong>digital service</strong> that
          grants access to publish listings for a defined period. It is charged
          in {COMPANY.currency} and processed by {COMPANY.paymentGateway} (see{' '}
          <Link href="/payments" className="underline">
            Payments &amp; Security
          </Link>
          ). Plan price, billing period and features are shown at the point of
          purchase.
        </p>
      </LegalSection>

      <LegalSection heading="2. Activation and delivery">
        <p>
          The subscription is a digital service delivered by activation:{' '}
          <strong>
            publishing access is enabled immediately after a successful payment
            is confirmed
          </strong>{' '}
          by the payment provider. There is no physical shipment.
        </p>
      </LegalSection>

      <LegalSection heading="3. Right of withdrawal (distance contract)">
        <p>
          Under the consumer-protection law of {COMPANY.jurisdiction}, a
          consumer generally has a 14-day right to withdraw from a distance
          contract. For a digital service that begins immediately, this right
          can be lost once the service has been fully performed, where you have
          expressly requested immediate provision and acknowledged that you
          thereby lose the right of withdrawal. Where the subscription has not
          yet been used, the withdrawal right applies as provided by law.
        </p>
      </LegalSection>

      <LegalSection heading="4. Refunds and cancellation">
        <p>
          <strong>
            [REFUND TERMS — business decision, confirm with adviser.]
          </strong>{' '}
          Set out here exactly how refunds and cancellation work. A common,
          lawful approach for a digital subscription is:
        </p>
        <LegalList
          items={[
            'You may cancel at any time; cancellation stops future renewals, and access continues until the end of the period already paid for.',
            'A full refund is available within 14 days of purchase if you have not yet used the subscription to publish or republish a listing.',
            'Once the subscription has been used to publish, the service is treated as provided and the paid period is generally non-refundable, except where required by law or in case of a proven service fault on our side.',
            'Approved refunds are returned to the original payment card via the payment provider, normally within [N] business days.',
          ]}
        />
        <p>
          To request a refund or cancel, contact {COMPANY.supportEmail} with
          your account email and the transaction reference. Nothing here removes
          mandatory consumer rights you have under the law of{' '}
          {COMPANY.jurisdiction}.
        </p>
      </LegalSection>

      <LegalSection heading="5. Sales between users are not covered">
        <p>
          {COMPANY.tradingName} does not sell items and does not process
          payments for items. Payment, delivery, returns and refunds for a
          purchased item are agreed and handled{' '}
          <strong>directly between the buyer and the seller</strong>. Any
          dispute about an item is between those users.
        </p>
      </LegalSection>

      <LegalSection heading="6. Contact">
        <p>
          Billing questions:{' '}
          <Link href="/contact" className="underline">
            Contact &amp; Support
          </Link>{' '}
          — {COMPANY.supportEmail}
          {COMPANY.supportPhone ? <>, {COMPANY.supportPhone}</> : null}.
        </p>
      </LegalSection>

      <LegalNote>
        The refund terms in section 4 are a lawful{' '}
        <em>default to choose from</em>, not a decision — confirm the exact
        stance and the refund processing time, and have it checked against the
        consumer-protection law of {COMPANY.jurisdiction} and CaSys’
        requirements before publishing.
      </LegalNote>
    </LegalPage>
  );
}
