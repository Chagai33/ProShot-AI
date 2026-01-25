'use client';

import { useAuth } from '@/features/auth/AuthProvider';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, Timestamp } from 'firebase/firestore';
import { useCollection } from 'react-firebase-hooks/firestore';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, XCircle, Loader2 as Spinner } from 'lucide-react';

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('Gallery');

  const styles = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100",
    error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100",
  };

  const icons = {
    pending: <Clock className="w-3 h-3 me-1" />,
    processing: <Spinner className="w-3 h-3 me-1 animate-spin" />,
    completed: <CheckCircle2 className="w-3 h-3 me-1" />,
    error: <XCircle className="w-3 h-3 me-1" />,
  };

  const labels = {
    pending: t('statusPending'),
    processing: t('statusProcessing'),
    completed: t('statusCompleted'),
    error: t('statusError'),
  };

  const statusKey = status as keyof typeof styles;

  return (
    <Badge className={`${styles[statusKey] || 'bg-gray-100 text-gray-800'} border-0 flex items-center`}>
      {icons[statusKey]}
      {labels[statusKey] || status}
    </Badge>
  );
}

interface Project {
  id: string;
  originalUrl: string;
  processedUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  name: string;
  createdAt: Timestamp;
}

export function GalleryGrid() {
  const t = useTranslations('Gallery');
  const tCommon = useTranslations('Common');
  const { user } = useAuth();

  const [value, loading, error] = useCollection(
    user
      ? query(collection(db, 'users', user.uid, 'projects'), orderBy('createdAt', 'desc'))
      : null
  );

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;
  if (!user) return <div className="text-center p-10">{t('loginRequired')}</div>;
  if (error) return <div className="text-red-500 text-center p-10">{t('errorLoading')}</div>;

  const projects = value?.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Project[];

  if (projects?.length === 0) {
    return <div className="text-center p-10 text-gray-500">{t('empty')}</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {projects?.map((project) => (
        <Card key={project.id} className="overflow-hidden">
          <CardContent className="p-0 relative aspect-square">
            <Image
              src={project.processedUrl || project.originalUrl}
              alt={project.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            <div className="absolute top-2 end-2">
              <StatusBadge status={project.status} />
            </div>
          </CardContent>
          <CardFooter className="p-4 flex justify-between items-center text-sm text-gray-500">
            <span className="truncate max-w-[150px]">{project.name}</span>
            <span>{project.createdAt?.toDate().toLocaleDateString()}</span>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
