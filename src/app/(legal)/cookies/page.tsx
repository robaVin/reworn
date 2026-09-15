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
  title: 'Cookie Policy',
  description: 'How ReWorn uses cookies and similar technologies.',
  alternates: { canonical: '/cookies' },
  robots: { index: true, follow: true },
};

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      lastUpdated={COMPANY.lastUpdated}
      intro={
        <>
          This policy explains how {COMPANY.tradingName} uses cookies and
          similar local-storage technologies. It should be read together with
          our{' '}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </>
      }
    >
      <LegalSection heading="1. What cookies are">
        <p>
          Cookies are small text files stored on your device by your browser.
          Similar technologies (such as your browser’s local storage) work the
          same way. We use only what is needed to run the service securely and
          to remember your preferences.
        </p>
      </LegalSection>

      <LegalSection heading="2. Cookies we use">
        <LegalList
          items={[
            <>
              <strong>
                Strictly necessary — authentication &amp; security.
              </strong>{' '}
              Set by our identity provider to keep you signed in and to protect
              against cross-site request forgery. The service does not work
              without these.
            </>,
            <>
              <strong>Functional preferences.</strong> Small values (for example
              in local storage) that remember lightweight UI choices such as a
              selected tab or filter. These stay on your device.
            </>,
          ]}
        />
        <p>
          <strong>
            We do not use advertising, profiling or third-party tracking
            cookies,
          </strong>{' '}
          and we do not sell data collected through cookies.
        </p>
      </LegalSection>

      <LegalSection heading="3. Managing cookies">
        <p>
          You can delete or block cookies through your browser settings. Because
          the authentication cookies are strictly necessary, blocking them will
          prevent you from signing in and using the marketplace.
        </p>
      </LegalSection>

      <LegalSection heading="4. Changes and contact">
        <p>
          We may update this policy; the “Last updated” date reflects the
          current version. Questions:{' '}
          <Link href="/contact" className="underline">
            Contact &amp; Support
          </Link>
          .
        </p>
      </LegalSection>

      <LegalNote>
        Confirm this reflects the exact cookies/local-storage keys set in
        production before publishing, and align any cookie-consent banner with
        the requirements of {COMPANY.jurisdiction}.
      </LegalNote>
    </LegalPage>
  );
}
