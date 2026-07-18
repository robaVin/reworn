import { requireUserPage } from '@/modules/auth/page-guards';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const ctx = await requireUserPage('/account');
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl">Your account</h1>
      <p className="mt-3 text-sm text-muted">
        Signed in. Roles: {ctx.roles.join(', ') || 'buyer'}.
      </p>
      <form action="/api/auth/logout" method="post" className="mt-8">
        <button
          type="submit"
          className="rounded-control bg-terracotta px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-terracotta-hover"
        >
          Log out
        </button>
      </form>
    </main>
  );
}
