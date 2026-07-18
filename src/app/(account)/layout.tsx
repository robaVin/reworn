import { requireUserPage } from '@/modules/auth/page-guards';

/**
 * Account area — any authenticated user. The guard runs server-side on every
 * request to this segment; an unauthenticated visitor is redirected to /login.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUserPage('/account');
  return <>{children}</>;
}
