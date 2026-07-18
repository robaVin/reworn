import { requireAdminPage } from '@/modules/auth/page-guards';

/**
 * Admin/support area — requires the `admin` role. Enforced server-side; any
 * non-admin (including sellers) receives "not found", so the area's existence
 * is not disclosed.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage('/admin');
  return <>{children}</>;
}
