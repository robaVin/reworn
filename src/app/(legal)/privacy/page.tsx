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
  title: 'Privacy Policy',
  description:
    'How ReWorn collects, uses and protects personal data, and how cardholder data is handled.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated={COMPANY.lastUpdated}
      intro={
        <>
          This Privacy Policy explains how {COMPANY.legalName} (“
          {COMPANY.tradingName}”, “we”), as data controller, collects, uses and
          protects personal data when you use {COMPANY.tradingName}. We process
          personal data in accordance with the Law on Personal Data Protection
          of {COMPANY.jurisdiction}
          (harmonised with the EU GDPR).
        </>
      }
    >
      <LegalSection heading="1. Who we are (controller)">
        <p>
          {COMPANY.legalName}, {COMPANY.address}. Company registration number{' '}
          {COMPANY.companyRegNo}. For any privacy request, contact{' '}
          {COMPANY.privacyEmail}.
        </p>
      </LegalSection>

      <LegalSection heading="2. What personal data we collect">
        <LegalList
          items={[
            <>
              <strong>Account &amp; profile data</strong> — the email and
              profile details you provide when you register, and your seller
              profile (shop name, public handle, location if you choose to add
              it).
            </>,
            <>
              <strong>Content you create</strong> — listings (title,
              description, brand, size, price and images) and messages you send
              to other users.
            </>,
            <>
              <strong>Subscription &amp; billing metadata</strong> — records
              that a subscription was purchased, its plan, status and dates, and
              a non-sensitive transaction reference from our payment provider.{' '}
              <strong>
                We do not collect or store your card number or card security
                data
              </strong>{' '}
              — see section 7.
            </>,
            <>
              <strong>Technical &amp; usage data</strong> — information such as
              your IP address, device/browser type and interactions with the
              service, collected through server logs and essential cookies (see
              the{' '}
              <Link href="/cookies" className="underline">
                Cookie Policy
              </Link>
              ).
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. How and why we use it (legal bases)">
        <LegalList
          items={[
            'To provide the marketplace — create your account, publish listings, enable buyer–seller messaging (performance of a contract).',
            'To operate the seller subscription and process the related payment (performance of a contract).',
            'To keep the service secure, prevent fraud and abuse, and comply with legal obligations (legitimate interests / legal obligation).',
            'To communicate with you about your account, transactions and support requests (contract / legitimate interests).',
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Who we share data with (processors)">
        <p>
          We share personal data only with service providers that process it on
          our behalf under a data-processing agreement, and only as needed to
          run the service:
        </p>
        <LegalList
          items={[
            <>
              <strong>Cloud database, authentication and file storage</strong> —
              our infrastructure provider (Supabase), hosting the database,
              authentication and image storage.
            </>,
            <>
              <strong>Application hosting</strong> — our cloud host (see{' '}
              <Link href="/contact" className="underline">
                Contact
              </Link>
              ), located in the EU region.
            </>,
            <>
              <strong>Payment processing</strong> — {COMPANY.paymentGateway},
              which processes the seller subscription payment. Card data is
              handled by the provider, not by us (section 7).
            </>,
          ]}
        />
        <p>
          We do not sell your personal data. We may disclose data where required
          by law or to protect our rights and users.
        </p>
      </LegalSection>

      <LegalSection heading="5. International transfers">
        <p>
          Our providers may process data in the EU/EEA. Where data is
          transferred outside {COMPANY.jurisdiction} or the EEA, we rely on
          appropriate safeguards (such as adequacy decisions or standard
          contractual clauses).
        </p>
      </LegalSection>

      <LegalSection heading="6. How long we keep it (retention)">
        <p>
          We keep personal data only as long as necessary for the purposes
          above: account and listing data for as long as your account is active;
          billing and transaction records for the period required by tax and
          accounting law; and messages for as long as needed to provide the
          service. When no longer needed, data is deleted or anonymised.
          Specific retention periods:{' '}
          <strong>[RETENTION PERIODS — confirm with adviser]</strong>.
        </p>
      </LegalSection>

      <LegalSection heading="7. Payment card data (PCI DSS)">
        <p>
          <strong>
            {COMPANY.tradingName} never receives, processes or stores your
            payment card number, expiry date or security code.
          </strong>{' '}
          Card details are entered on the secure, PCI-DSS-compliant hosted
          payment page of our payment provider, {COMPANY.paymentGateway}, and
          are transmitted directly to it. We receive only a non-sensitive
          confirmation (such as success/failure and a transaction reference) so
          we can activate your subscription. See{' '}
          <Link href="/payments" className="underline">
            Payments &amp; Security
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="8. How we protect data">
        <LegalList
          items={[
            'All traffic is served over encrypted HTTPS/TLS connections.',
            'The database enforces row-level security so users can reach only the data they are entitled to; the privileged service key is server-side only.',
            'Uploaded images are stored in a private bucket and served through short-lived signed URLs, never public links.',
            'Authentication is handled by a dedicated identity provider; we never store your password.',
          ]}
        />
      </LegalSection>

      <LegalSection heading="9. Your rights">
        <p>
          Subject to applicable law, you have the right to access, rectify,
          erase, restrict or object to the processing of your personal data, to
          data portability, and to withdraw consent where processing is based on
          consent. To exercise these rights, contact {COMPANY.privacyEmail}. You
          also have the right to lodge a complaint with the {COMPANY.dpaName} (
          <a
            href={COMPANY.dpaUrl}
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {COMPANY.dpaUrl}
          </a>
          ).
        </p>
      </LegalSection>

      <LegalSection heading="10. Children">
        <p>
          {COMPANY.tradingName} is not directed to children under 18 and we do
          not knowingly collect their personal data.
        </p>
      </LegalSection>

      <LegalSection heading="11. Changes and contact">
        <p>
          We may update this policy; the “Last updated” date reflects the
          current version. Questions or requests: {COMPANY.privacyEmail}, or see{' '}
          <Link href="/contact" className="underline">
            Contact &amp; Support
          </Link>
          .
        </p>
      </LegalSection>

      <LegalNote>
        Template grounded in how {COMPANY.tradingName} operates; not legal
        advice. Have it reviewed for compliance with the Law on Personal Data
        Protection of {COMPANY.jurisdiction} (and GDPR where relevant) before
        publication.
      </LegalNote>
    </LegalPage>
  );
}
