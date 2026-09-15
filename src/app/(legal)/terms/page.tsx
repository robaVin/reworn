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
  title: 'Terms of Service',
  description:
    'The terms governing use of the ReWorn marketplace and the seller subscription.',
  alternates: { canonical: '/terms' },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      lastUpdated={COMPANY.lastUpdated}
      intro={
        <>
          These Terms of Service (the “Terms”) govern your use of{' '}
          {COMPANY.tradingName}, a second-hand fashion classifieds marketplace
          operated by {COMPANY.legalName} ({COMPANY.address}) (“
          {COMPANY.tradingName}”, “we”, “us”). By accessing the site or creating
          an account you agree to these Terms. If you do not agree, do not use{' '}
          {COMPANY.tradingName}.
        </>
      }
    >
      <LegalSection heading="1. What ReWorn is">
        <p>
          {COMPANY.tradingName} is a <strong>classifieds marketplace</strong>{' '}
          that lets sellers publish listings for pre-loved fashion items and
          lets buyers browse those listings and contact sellers directly.
        </p>
        <LegalList
          items={[
            <>
              <strong>Buyers use {COMPANY.tradingName} free of charge.</strong>{' '}
              There is no fee to browse or to message a seller.
            </>,
            <>
              <strong>Sellers pay a subscription</strong> to publish listings
              (see{' '}
              <Link href="/refunds" className="underline">
                Subscription, Refunds &amp; Cancellation
              </Link>
              ). The subscription is the <strong>only</strong> payment processed
              through {COMPANY.tradingName}.
            </>,
            <>
              We are a venue for listings and introductions only. The sale of an
              item, its price, payment and delivery are agreed and carried out{' '}
              <strong>directly between the buyer and the seller</strong>, off
              the platform. {COMPANY.tradingName} is not a party to those
              transactions, does not take custody of items, and does not process
              payments for them.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="2. Eligibility and accounts">
        <p>
          You must be at least 18 years old and able to enter into a binding
          contract. You are responsible for the accuracy of your account details
          and for keeping your credentials secure; you are responsible for
          activity under your account. Authentication is provided through our
          identity provider — see the{' '}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="3. Seller obligations and listing rules">
        <LegalList
          items={[
            'You may list only items you own and are legally entitled to sell, and which are genuinely pre-loved / second-hand fashion items.',
            'Listings must be accurate and not misleading as to brand, condition, size, materials or authenticity. Counterfeit or replica goods are prohibited.',
            'You may not list prohibited, illegal, unsafe, or recalled goods, or anything that infringes another party’s rights.',
            'Images must be your own or ones you are permitted to use, and must depict the actual item.',
            'You are responsible for agreeing terms with the buyer, for delivery, and for compliance with any tax or consumer-law obligations arising from your sales.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>You agree not to:</p>
        <LegalList
          items={[
            'use the platform for any unlawful, fraudulent or abusive purpose;',
            'harass, threaten or defraud other users, including through messaging;',
            'scrape, overload, probe or attempt to circumvent the security of the service;',
            'post spam, malware, or content that is defamatory, obscene or infringing.',
          ]}
        />
        <p>
          We may remove content or suspend or terminate accounts that breach
          these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="5. The seller subscription">
        <p>
          Publishing listings requires an active seller subscription, charged in{' '}
          {COMPANY.currency} and processed by our payment provider (see{' '}
          <Link href="/payments" className="underline">
            Payments &amp; Security
          </Link>
          ). Plan prices and features are shown at the point of purchase. Access
          to publishing is granted for the paid period and ends when the
          subscription lapses or is cancelled. Refund and cancellation terms are
          set out in the{' '}
          <Link href="/refunds" className="underline">
            Subscription, Refunds &amp; Cancellation
          </Link>{' '}
          policy.
        </p>
      </LegalSection>

      <LegalSection heading="6. Intellectual property">
        <p>
          The {COMPANY.tradingName} name, brand and the site’s software and
          design are owned by {COMPANY.legalName} or its licensors. You keep
          ownership of the content you upload (such as listing text and images)
          and grant us a non-exclusive, worldwide, royalty-free licence to host
          and display that content for the purpose of operating and promoting
          the marketplace.
        </p>
      </LegalSection>

      <LegalSection heading="7. Disclaimers and limitation of liability">
        <p>
          Because sales happen directly between users, {COMPANY.tradingName}{' '}
          does not guarantee the quality, safety, legality or authenticity of
          listed items, the truth of listings, or the ability of buyers or
          sellers to complete a transaction. The service is provided “as is” to
          the extent permitted by law.
        </p>
        <p>
          To the maximum extent permitted by the law of {COMPANY.jurisdiction},{' '}
          {COMPANY.tradingName} is not liable for disputes between users or for
          indirect or consequential loss. Nothing in these Terms limits
          liability that cannot be limited under applicable law, including
          mandatory consumer-protection rights.
        </p>
      </LegalSection>

      <LegalSection heading="8. Suspension and termination">
        <p>
          You may stop using {COMPANY.tradingName} at any time. We may suspend
          or terminate access for breach of these Terms or where required by
          law. Provisions that by their nature should survive (for example,
          sections 6 to 9) survive termination.
        </p>
      </LegalSection>

      <LegalSection heading="9. Governing law and disputes">
        <p>
          These Terms are governed by the laws of {COMPANY.jurisdiction}, and
          the courts of {COMPANY.jurisdiction} have jurisdiction, without
          prejudice to any mandatory consumer rights you may have. Consumer
          disputes may also be raised with the competent consumer-protection
          authority.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes to these Terms">
        <p>
          We may update these Terms; the “Last updated” date above reflects the
          current version, and material changes will be notified through the
          service. Continued use after changes take effect means you accept the
          updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact">
        <p>
          Questions about these Terms:{' '}
          <Link href="/contact" className="underline">
            Contact &amp; Support
          </Link>{' '}
          — {COMPANY.supportEmail}.
        </p>
      </LegalSection>

      <LegalNote>
        This document is a template grounded in how {COMPANY.tradingName}{' '}
        operates. It is not legal advice and must be reviewed by a qualified
        adviser for compliance with the law of {COMPANY.jurisdiction} before
        publication.
      </LegalNote>
    </LegalPage>
  );
}
