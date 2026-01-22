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

interface Project {
  id: string;
  originalUrl: string;
  processedUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  name: string;
  createdAt: Timestamp;
}

export function GalleryGrid() {
  const t = useTranslations('HomePage');
  const { user } = useAuth();

  const [value, loading, error] = useCollection(
    user
      ? query(collection(db, 'users', user.uid, 'projects'), orderBy('createdAt', 'desc'))
      : null
  );

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;
  if (!user) return <div className="text-center p-10">Please login to view your gallery.</div>;
  if (error) return <div className="text-red-500 text-center p-10">Error loading gallery.</div>;

  const projects = value?.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Project[];

  if (projects?.length === 0) {
    return <div className="text-center p-10 text-gray-500">No images yet. Upload one to get started!</div>;
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
            <div className="absolute top-2 right-2">
              <Badge variant={project.status === 'completed' ? 'default' : 'secondary'}>
                {project.status}
              </Badge>
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
