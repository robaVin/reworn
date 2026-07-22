import type { Metadata } from 'next';
import { requireUserPage } from '@/modules/auth/page-guards';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AuthNotConfigured } from '@/components/shell/AuthNotConfigured';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { MessageIcon } from '@/components/shell/icons';

export const metadata: Metadata = { title: 'Messages' };
export const dynamic = 'force-dynamic';

/**
 * Messages — real guarded route (any authenticated user), truthful
 * not-yet-connected state until the messaging domain ships in its
 * scheduled increment. Fail-closed configuration state without Supabase.
 */
export default async function MessagesPage() {
  if (!isSupabaseConfigured()) return <AuthNotConfigured />;
  await requireUserPage('/messages');

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        Messages
      </h1>
      <div className="mt-6">
        <EmptyState
          icon={<MessageIcon />}
          title="Messaging is on its way"
          action={
            <Button href="/browse" variant="outline">
              Browse the edit
            </Button>
          }
        >
          Buyer–seller conversations arrive in a later increment. You&apos;ll
          contact sellers about their listings directly from here.
        </EmptyState>
      </div>
    </main>
  );
}
