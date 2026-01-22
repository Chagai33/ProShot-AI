import { useTranslations } from 'next-intl';
import { GalleryGrid } from '@/features/gallery/components/GalleryGrid';

export default function GalleryPage() {
  const t = useTranslations('HomePage');

  return (
    <div className="container mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-8">{t('gallery')}</h1>
      <GalleryGrid />
    </div>
  );
}
