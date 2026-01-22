import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { UploadZone } from '@/features/upload/components/UploadZone';

export default function HomePage() {
  const t = useTranslations('HomePage');
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <main className="flex flex-col items-center justify-center w-full flex-1 px-20 text-center">
        <h1 className="text-6xl font-bold">
          {t('title')}
        </h1>
        <p className="mt-3 text-2xl">
          {t('subtitle')}
        </p>
        <div className="w-full max-w-2xl mt-10">
          <UploadZone />
        </div>
        <div className="mt-6 flex gap-4">
          <Link href="/gallery" className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            {t('gallery')}
          </Link>
        </div>
      </main>
    </div>
  );
}
