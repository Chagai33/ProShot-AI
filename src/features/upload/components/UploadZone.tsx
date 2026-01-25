'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@/features/auth/AuthProvider';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, db } from '@/lib/firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Loader2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from 'next-intl';

export function UploadZone() {
  const t = useTranslations('HomePage');
  const tUpload = useTranslations('Upload');
  const tCommon = useTranslations('Common');
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);

  const [progress, setProgress] = useState(0);
  const [userPrompt, setUserPrompt] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!user || !file) return;

    setUploading(true);

    try {
      // 1. Generate Firestore Document ID FIRST
      const projectsCollection = collection(db, 'users', user.uid, 'projects');
      const newProjectRef = doc(projectsCollection);
      const projectId = newProjectRef.id;

      // 2. Upload to Storage with ORIGINAL filename and metadata
      // 2. Upload to Storage with ORIGINAL filename and metadata
      const storageRef = ref(storage, `users/${user.uid}/uploads/${file.name}`);
      const metadata = {
        customMetadata: {
          projectId: projectId,
          originalName: file.name,
          // userPrompt must be a string for Firebase metadata, or omitted. 
          // Using empty string if falsy, or ensuring string type.
          userPrompt: userPrompt || ""
        }
      };

      const uploadTask = uploadBytesResumable(storageRef, file, metadata);

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
          // 3. Get Download URL
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

          // 4. Create Firestore Document using pre-generated reference
          await setDoc(newProjectRef, {
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
  }, [user, userPrompt]); // Add userPrompt to dependency array

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    disabled: uploading || !user
  });

  return (
    <div className="w-full space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-700 dark:text-gray-300">
          {tUpload('promptLabel')}
        </label>
        <Textarea
          placeholder={tUpload('promptPlaceholder')}
          value={userPrompt}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setUserPrompt(e.target.value)}
          disabled={uploading}
          className="resize-none"
        />
      </div>

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
          {isDragActive ? tUpload('dropHere') : t('uploadButton')}
        </p>
        <Button disabled={uploading} variant="secondary" className="mt-4 pointer-events-none">
          {tCommon('selectFile')}
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
              {tUpload('finalizingUpload')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
