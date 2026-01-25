/**
 * Validation Schemas using Zod
 * 
 * Runtime validation for user inputs and API data
 */

import { z } from 'zod';

// File upload validation
export const fileUploadSchema = z.object({
  file: z.instanceof(File)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'File size must be less than 10MB'
    })
    .refine((file) => file.type.startsWith('image/'), {
      message: 'File must be an image'
    })
    .refine((file) => ['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(file.type), {
      message: 'Supported formats: JPEG, PNG, WebP, HEIC'
    })
});

// Project creation validation
export const projectCreateSchema = z.object({
  name: z.string().min(1).max(255),
  userId: z.string().min(1),
  originalUrl: z.string().url(),
  storagePath: z.string().min(1)
});

// Project update validation
export const projectUpdateSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  processedUrl: z.string().url().optional(),
  error: z.string().optional()
});

// Pagination validation
export const paginationSchema = z.object({
  limit: z.number().int().positive().max(100).default(12),
  startAfter: z.string().optional()
});

// Type exports
export type FileUploadInput = z.infer<typeof fileUploadSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;

// Validation helper
export function validateFile(file: File): { success: boolean; error?: string } {
  const result = fileUploadSchema.safeParse({ file });

  if (!result.success) {
    const firstError = result.error.issues[0];
    return {
      success: false,
      error: firstError?.message || 'Invalid file'
    };
  }

  return { success: true };
}
