import { requireAnyRolePage } from '@/modules/auth/page-guards';

/**
 * Seller area — requires the `seller` OR `admin` role (admins may operate seller
 * tooling). Enforced server-side; a buyer is shown "not found", hiding the area.
 * Seller *features* (listings, dashboard) are Stage 2 — this is only the guard.
 */
export default async function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAnyRolePage(['seller', 'admin'], '/seller');
  return <>{children}</>;
}
