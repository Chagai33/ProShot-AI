import { useTranslations } from 'next-intl';
import { LoginForm } from '@/features/auth/components/LoginForm';

export default function LoginPage() {
  const t = useTranslations('Auth');

  return (
    <div className="flex h-screen w-full items-center justify-center px-4">
      <LoginForm />
    </div>
  );
}
