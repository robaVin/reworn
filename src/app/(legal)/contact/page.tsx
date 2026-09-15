import type { Metadata } from 'next';
import Link from 'next/link';
import {
  LegalPage,
  LegalSection,
  LegalList,
} from '@/components/legal/LegalPage';
import { COMPANY } from '@/config/company';

export const metadata: Metadata = {
  title: 'Contact & Support',
  description:
    'How to reach ReWorn — support email, phone, and company details.',
  alternates: { canonical: '/contact' },
  robots: { index: true, follow: true },
};

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact & Support"
      lastUpdated={COMPANY.lastUpdated}
      intro={
        <>
          We’re happy to help with your account, a listing, a subscription or a
          payment question.
        </>
      }
    >
      <LegalSection heading="Customer support">
        <LegalList
          items={[
            <>
              <strong>Email:</strong>{' '}
              <a href={`mailto:${COMPANY.supportEmail}`} className="underline">
                {COMPANY.supportEmail}
              </a>
            </>,
            <>
              <strong>Phone:</strong>{' '}
              <a
                href={`tel:${COMPANY.supportPhone.replace(/\s+/g, '')}`}
                className="underline"
              >
                {COMPANY.supportPhone}
              </a>
            </>,
            <>
              <strong>Hours:</strong> {COMPANY.supportHours}
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Privacy & data requests">
        <p>
          For questions about your personal data or to exercise your rights,
          contact{' '}
          <a href={`mailto:${COMPANY.privacyEmail}`} className="underline">
            {COMPANY.privacyEmail}
          </a>
          . See the{' '}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Company details">
        <LegalList
          items={[
            <>
              <strong>Legal entity:</strong> {COMPANY.legalName}
            </>,
            <>
              <strong>Registered address:</strong> {COMPANY.address}
            </>,
            <>
              <strong>Company registration no. (EMBS):</strong>{' '}
              {COMPANY.companyRegNo}
            </>,
            <>
              <strong>Tax / VAT no. (EDB):</strong> {COMPANY.taxNo}
            </>,
            <>
              <strong>Country:</strong> {COMPANY.country}
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Legal documents">
        <LegalList
          items={[
            <Link key="terms" href="/terms" className="underline">
              Terms of Service
            </Link>,
            <Link key="privacy" href="/privacy" className="underline">
              Privacy Policy
            </Link>,
            <Link key="cookies" href="/cookies" className="underline">
              Cookie Policy
            </Link>,
            <Link key="refunds" href="/refunds" className="underline">
              Subscription, Refunds &amp; Cancellation
            </Link>,
            <Link key="payments" href="/payments" className="underline">
              Payments &amp; Security
            </Link>,
          ]}
        />
      </LegalSection>
    </LegalPage>
  );
}
