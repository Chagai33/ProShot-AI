/**
 * Domain Types with Branded Types for Type Safety
 * 
 * Using branded types to prevent primitive obsession and ensure
 * type safety at compile time for domain-specific values.
 */

// Branded type utility
type Brand<K, T> = K & { __brand: T };

// Domain-specific branded types
export type UserId = Brand<string, 'UserId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type StoragePath = Brand<string, 'StoragePath'>;
export type DownloadURL = Brand<string, 'DownloadURL'>;

// Type guard utilities
export function isUserId(value: string): value is UserId {
  return value.length > 0;
}

export function isProjectId(value: string): value is ProjectId {
  return value.length > 0;
}

// Constructor functions for branded types
export function createUserId(id: string): UserId {
  return id as UserId;
}

export function createProjectId(id: string): ProjectId {
  return id as ProjectId;
}

export function createStoragePath(path: string): StoragePath {
  return path as StoragePath;
}

export function createDownloadURL(url: string): DownloadURL {
  return url as DownloadURL;
}

// Project status enum
export enum ProjectStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// Project metadata interface
export interface ProjectMetadata {
  projectId: ProjectId;
  userId: UserId;
  originalUrl: DownloadURL;
  processedUrl?: DownloadURL;
  storagePath: StoragePath;
  status: ProjectStatus;
  name: string;
  createdAt: Date;
  updatedAt?: Date;
  error?: string;
}

// Upload state
export interface UploadState {
  uploading: boolean;
  progress: number;
  error?: string;
}

// Authentication state
export interface AuthState {
  user: {
    uid: UserId;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    isAnonymous: boolean;
  } | null;
  loading: boolean;
  error?: string;
}
