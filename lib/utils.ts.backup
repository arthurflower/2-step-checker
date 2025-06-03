import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getAssetPath = (path: string): string => {
  // In development, don't add any prefix if basePath is not set for dev
  if (process.env.NODE_ENV === 'development') {
    return path;
  }
  // In production, if basePath is set, Next.js handles it.
  // If you need to manually construct paths respecting basePath for non-Next.js links/assets:
  // return `/hallucination-detector${path}`;
  // However, for API routes called via fetch, Next.js should resolve them correctly
  // with or without basePath if called like '/api/...' or with basePath prefix.
  // The previous logic was specific to how basePath was handled with fetch.
  // With basePath in next.config.js, relative paths like '/api/...' should work.
  // For clarity and ensuring it works with production basePath:
  if (process.env.NODE_ENV === 'production') {
    return `/hallucination-detector${path}`;
  }
  return path;
};