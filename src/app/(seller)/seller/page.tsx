import { requireAnyRolePage } from '@/modules/auth/page-guards';

export const dynamic = 'force-dynamic';

export default async function SellerHomePage() {
  await requireAnyRolePage(['seller', 'admin'], '/seller');
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl">Seller area</h1>
      <p className="mt-3 text-sm text-muted">
        Access granted. Seller tools arrive in Stage 2.
      </p>
    </main>
  );
}
