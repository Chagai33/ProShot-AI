'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/features/auth/AuthProvider';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from '@/i18n/routing';

export function LoginForm() {
  const t = useTranslations('Auth');
  const { signInAnonymously } = useAuth();
  const router = useRouter();

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.push('/');
    } catch (error) {
      console.error("Google Sign In Error:", error);
    }
  };

  const handleAnonymous = async () => {
    await signInAnonymously();
    router.push('/');
  };

  return (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>{t('login')}</CardTitle>
        <CardDescription>{t('loginSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button onClick={handleGoogleSignIn} variant="outline" className="w-full">
          {t('google')}
        </Button>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">{t('or')}</span>
          </div>
        </div>
        <Button onClick={handleAnonymous} variant="secondary" className="w-full">
          {t('anonymous')}
        </Button>
      </CardContent>
    </Card>
  );
}
