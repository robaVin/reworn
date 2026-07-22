import { requireAnyRolePage } from '@/modules/auth/page-guards';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AuthNotConfigured } from '@/components/shell/AuthNotConfigured';

/**
 * Seller area — requires the `seller` OR `admin` role (admins may operate seller
 * tooling). Enforced server-side; a buyer is shown "not found", hiding the area.
 * Seller *features* (listings, dashboard) are Stage 2 — this is only the guard.
 *
 * Without Supabase credentials a truthful configuration-blocked state renders
 * instead (fail-closed; no mock session).
 */
export default async function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) return <AuthNotConfigured />;
  await requireAnyRolePage(['seller', 'admin'], '/seller');
  return <>{children}</>;
}
