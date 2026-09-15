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
  title: 'Payments & Security',
  description:
    'How subscription payments are processed securely through CaSys, and how card data is protected.',
  alternates: { canonical: '/payments' },
  robots: { index: true, follow: true },
};

export default function PaymentsPage() {
  return (
    <LegalPage
      title="Payments & Security"
      lastUpdated={COMPANY.lastUpdated}
      intro={
        <>
          This page explains how payments for the {COMPANY.tradingName} seller
          subscription are processed and secured. The subscription is the only
          payment taken through {COMPANY.tradingName}.
        </>
      }
    >
      <LegalSection heading="1. What can be paid for">
        <p>
          Only the <strong>seller subscription</strong> is paid through{' '}
          {COMPANY.tradingName}. Purchases of items between users are arranged
          and paid directly between buyer and seller and are not processed here.
        </p>
      </LegalSection>

      <LegalSection heading="2. Accepted cards and currency">
        <LegalList
          items={[
            <>
              Accepted cards: <strong>{COMPANY.cardBrands}</strong>.
            </>,
            <>
              Payments are charged in <strong>{COMPANY.currency}</strong>.
            </>,
            <>
              The descriptor shown on your card statement will be{' '}
              <strong>[STATEMENT DESCRIPTOR]</strong>.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. How payment is processed">
        <p>
          Payments are processed by <strong>{COMPANY.paymentGateway}</strong>,
          our payment provider, in cooperation with the acquiring bank
          {COMPANY.acquiringBank ? <> ({COMPANY.acquiringBank})</> : null}. When
          you subscribe:
        </p>
        <LegalList
          items={[
            'You are taken to the payment provider’s secure, hosted payment page to enter your card details.',
            'The transaction is authenticated using 3-D Secure (Verified by Visa / Mastercard Identity Check) where your card supports it.',
            'On a successful, verified payment, your subscription is activated automatically.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Card data security">
        <p>
          <strong>
            {COMPANY.tradingName} does not see, transmit or store your card
            number, expiry date or CVV.
          </strong>{' '}
          Those details are entered on and handled by {COMPANY.paymentGateway},
          on its PCI-DSS-compliant infrastructure. We receive only a
          non-sensitive result and transaction reference needed to activate your
          subscription and to reconcile the payment. See the{' '}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
        <p>
          All connections to {COMPANY.tradingName} are encrypted with HTTPS/TLS.
        </p>
      </LegalSection>

      <LegalSection heading="5. Refunds and cancellation">
        <p>
          See the{' '}
          <Link href="/refunds" className="underline">
            Subscription, Refunds &amp; Cancellation
          </Link>{' '}
          policy.
        </p>
      </LegalSection>

      <LegalSection heading="6. Payment support">
        <p>
          For a payment or billing question, contact {COMPANY.supportEmail}
          {COMPANY.supportPhone ? (
            <> or {COMPANY.supportPhone}</>
          ) : null} (see{' '}
          <Link href="/contact" className="underline">
            Contact &amp; Support
          </Link>
          ).
        </p>
      </LegalSection>

      <LegalNote>
        Before publishing: confirm the statement descriptor and acquiring bank,
        display the official {COMPANY.cardBrands} and CaSys logos as required by
        your card-acceptance agreement, and verify the wording matches CaSys’
        onboarding requirements.
      </LegalNote>
    </LegalPage>
  );
}
