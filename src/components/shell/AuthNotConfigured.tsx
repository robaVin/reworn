import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

/**
 * TRUTHFUL configuration-blocked state for protected areas.
 *
 * Rendered INSTEAD of protected content when Supabase credentials are not
 * configured in this environment (see .env.example). Fail-closed: nothing
 * protected renders, and no mock session is ever substituted for the real
 * authentication stack.
 */
export function AuthNotConfigured() {
  return (
    <main className="mx-auto max-w-shell px-4 py-16 sm:px-8 lg:px-10">
      <div className="max-w-xl">
        <Alert
          tone="warning"
          title="Authentication is not configured in this environment"
        >
          <p>
            This area requires a signed-in account, but the Supabase
            authentication service has no credentials configured here, so nobody
            can sign in yet. No demo or mock session is substituted — connect a
            Supabase project (see <code>.env.example</code>) to use accounts.
          </p>
        </Alert>
        <div className="mt-6">
          <Button href="/" variant="outline">
            Back to the homepage
          </Button>
        </div>
      </div>
    </main>
  );
}
