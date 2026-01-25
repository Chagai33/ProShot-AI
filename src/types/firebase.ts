/**
 * Firebase Type Definitions
 * 
 * Strongly typed interfaces for all Firestore documents and collections
 */

import { Timestamp } from 'firebase/firestore';
import { ProjectId, UserId, StoragePath, DownloadURL, ProjectStatus } from './domain';

// Firestore timestamp helper
export type FirestoreTimestamp = Timestamp;

// Convert Firestore timestamp to Date
export function timestampToDate(timestamp: FirestoreTimestamp): Date {
  return timestamp.toDate();
}

// Firestore document base interface
export interface FirestoreDocument {
  id: string;
  createdAt: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

// Project document in Firestore
export interface ProjectDocument extends FirestoreDocument {
  id: ProjectId;
  userId: UserId;
  originalUrl: DownloadURL;
  processedUrl?: DownloadURL;
  storagePath: StoragePath;
  status: ProjectStatus;
  name: string;
  error?: string;
}

// User document in Firestore (if needed for user metadata)
export interface UserDocument extends FirestoreDocument {
  id: UserId;
  email?: string;
  displayName?: string;
  photoURL?: string;
  createdAt: FirestoreTimestamp;
  lastLoginAt?: FirestoreTimestamp;
}

// Storage metadata
export interface StorageMetadata {
  projectId: ProjectId;
  originalName: string;
  contentType?: string;
  size?: number;
}

// Collection paths
export const COLLECTIONS = {
  USERS: 'users',
  PROJECTS: 'projects',
} as const;

// Type-safe collection reference helpers
export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];

// Firestore query result
export interface QueryResult<T> {
  data: T[];
  hasMore: boolean;
  lastDoc?: any;
}

// Pagination params
export interface PaginationParams {
  limit?: number;
  startAfter?: any;
}
