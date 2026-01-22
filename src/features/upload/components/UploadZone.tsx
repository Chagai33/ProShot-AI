'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@/features/auth/AuthProvider';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useTranslations } from 'next-intl';

export function UploadZone() {
  const t = useTranslations('HomePage');
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!user || acceptedFiles.length === 0) return;

    setUploading(true);
    const file = acceptedFiles[0];
    const fileId = crypto.randomUUID();
    const storageRef = ref(storage, `users/${user.uid}/uploads/${fileId}_${file.name}`);

    try {
      // 1. Upload to Storage
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(progress);
        },
        (error) => {
          console.error("Upload error:", error);
          setUploading(false);
        },
        async () => {
          // 2. Get Download URL
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

          // 3. Create Firestore Document (Trigger for Cloud Function)
          await addDoc(collection(db, 'users', user.uid, 'projects'), {
            originalUrl: downloadURL,
            storagePath: storageRef.fullPath,
            status: 'pending',
            createdAt: serverTimestamp(),
            name: file.name
          });

          setUploading(false);
        }
      );
    } catch (error) {
      console.error("Error uploading:", error);
      setUploading(false);
    }
  }, [user]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    disabled: uploading || !user
  });

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'}
          ${uploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
        ) : (
          <UploadCloud className="h-10 w-10 text-gray-400 mb-4" />
        )}
        <p className="text-center text-gray-600 dark:text-gray-300">
          {isDragActive ? "Drop the image here" : t('uploadButton')}
        </p>
        <Button disabled={uploading} variant="secondary" className="mt-4 pointer-events-none">
          Select File
        </Button>
      </div>

      {uploading && (
        <div className="mt-6 space-y-2">
          <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
            <span>{progress < 100 ? t('uploading') : t('processing')}...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          {progress === 100 && (
            <p className="text-xs text-center text-muted-foreground mt-2 animate-pulse">
              Finalizing upload and starting processing...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
