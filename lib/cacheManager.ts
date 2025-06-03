// lib/cacheManager.ts

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class CacheManager {
  private cache: Map<string, CacheEntry<any>>;
  private maxSize: number;
  private defaultTTL: number; // Time to live in milliseconds

  constructor(maxSize: number = 100, defaultTTL: number = 5 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  // Generate cache key
  public generateKey(prefix: string, data: any): string {
    const dataString = JSON.stringify(data);
    // Simple hash function for consistent keys
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${prefix}_${hash}`;
  }

  // Set cache entry
  set<T>(key: string, data: T, ttl?: number): void {
    // Check cache size and evict oldest if necessary
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.getOldestKey();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const expiresAt = Date.now() + (ttl || this.defaultTTL);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt
    });
  }

  // Get cache entry
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  // Check if key exists and is valid
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  // Get oldest key for eviction
  private getOldestKey(): string | null {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    this.cache.forEach((entry, key) => {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    });

    return oldestKey;
  }

  // Clear expired entries
  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getStats() {
    this.clearExpired();
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        timestamp: new Date(entry.timestamp).toISOString(),
        expiresAt: new Date(entry.expiresAt).toISOString(),
        remainingTTL: Math.max(0, entry.expiresAt - Date.now())
      }))
    };
  }
}

// Create singleton instance
const cacheManager = new CacheManager();

// Export wrapped functions for specific use cases
export const apiCache = {
  // Cache extraction results
  setClaims: (content: string, claims: any[]) => {
    const key = `claims_${content.substring(0, 50)}_${content.length}`;
    cacheManager.set(key, claims, 10 * 60 * 1000); // 10 minutes
  },
  
  getClaims: (content: string): any[] | null => {
    const key = `claims_${content.substring(0, 50)}_${content.length}`;
    return cacheManager.get(key);
  },

  // Cache search results
  setSearchResults: (claim: string, results: any) => {
    const key = `search_${claim.substring(0, 50)}_${claim.length}`;
    cacheManager.set(key, results, 15 * 60 * 1000); // 15 minutes
  },
  
  getSearchResults: (claim: string): any | null => {
    const key = `search_${claim.substring(0, 50)}_${claim.length}`;
    return cacheManager.get(key);
  },

  // Cache verification results
  setVerification: (claim: string, sources: any, verification: any) => {
    const key = `verify_${claim.substring(0, 30)}_${JSON.stringify(sources).length}`;
    cacheManager.set(key, verification, 20 * 60 * 1000); // 20 minutes
  },
  
  getVerification: (claim: string, sources: any): any | null => {
    const key = `verify_${claim.substring(0, 30)}_${JSON.stringify(sources).length}`;
    return cacheManager.get(key);
  },

  // Utility functions
  clearAll: () => cacheManager.clear(),
  getStats: () => cacheManager.getStats()
};

export default cacheManager;



