import { safeJsonLdString } from '@/lib/structured-data';

/**
 * Renders a JSON-LD structured-data block. The payload is serialized with
 * {@link safeJsonLdString}, which escapes `<`, `>`, `&`, and the U+2028/U+2029
 * line separators so listing text can never terminate the script element or
 * inject markup. Never interpolate untrusted data into JSX text — always route
 * it through this component.
 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- serialized via safeJsonLdString
      dangerouslySetInnerHTML={{ __html: safeJsonLdString(data) }}
    />
  );
}
