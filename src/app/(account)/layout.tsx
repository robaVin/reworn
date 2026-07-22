import { requireUserPage } from '@/modules/auth/page-guards';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AuthNotConfigured } from '@/components/shell/AuthNotConfigured';

/**
 * Account area — any authenticated user. The guard runs server-side on every
 * request to this segment; an unauthenticated visitor is redirected to /login.
 *
 * When Supabase credentials are absent (development without a project), a
 * truthful configuration-blocked state renders INSTEAD of the protected
 * content — fail-closed, never a mock session.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) return <AuthNotConfigured />;
  await requireUserPage('/account');
  return <>{children}</>;
}
