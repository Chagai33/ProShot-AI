'use client';

import { useCallback } from 'react';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export function Header() {
  const t = useTranslations('HomePage');
  const tAuth = useTranslations('Auth');
  const { user, loading } = useAuth();

  const handleLogout = useCallback(() => signOut(auth), []);

  return (
    <header className="flex h-16 w-full items-center justify-between border-b px-4 md:px-6">
      <Link href="/" className="flex items-center gap-2 font-bold text-xl">
        ProShot AI
      </Link>
      <nav className="flex items-center gap-4">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : user ? (
          <>
            <Link href="/gallery" className="text-sm font-medium hover:underline">
              {t('gallery')}
            </Link>
            <Button onClick={handleLogout} variant="ghost" size="sm">
              {tAuth('logout')}
            </Button>
          </>
        ) : (
          <Link href="/auth/login">
            <Button size="sm">
              {tAuth('login')}
            </Button>
          </Link>
        )}
      </nav>
    </header>
  );
}
