import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/modules/auth/page-guards';
import { isSupabaseConfigured } from '@/lib/supabase/config';

/**
 * Admin/support area — requires the `admin` role. Enforced server-side; any
 * non-admin (including sellers) receives "not found", so the area's existence
 * is not disclosed.
 *
 * Without Supabase credentials nobody can be an admin, so the area renders
 * notFound() — same response a non-admin gets, disclosing nothing.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) notFound();
  await requireAdminPage('/admin');
  return <>{children}</>;
}
