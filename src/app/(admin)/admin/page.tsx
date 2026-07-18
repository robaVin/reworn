import { requireAdminPage } from '@/modules/auth/page-guards';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  await requireAdminPage('/admin');
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl">Admin &amp; support</h1>
      <p className="mt-3 text-sm text-muted">
        Admin access confirmed. Management tools arrive in a later increment.
      </p>
    </main>
  );
}
