import type {
  AppConfig,
  AvailableMonth,
  CommunityPost,
  LiveNowState,
  VideoItem,
} from '../types/archive';

export interface CachedMonthSlice {
  month_key: string;
  video_count: number;
  videos_path: string;
  post_path: string;
  videos: VideoItem[];
  posts: CommunityPost[];
}

export interface CachedArchiveRecord {
  schemaVersion: number;
  cachedAt: number;
  source: 'remote' | 'bundled';
  config: AppConfig;
  live: LiveNowState;
  monthsByKey: Record<string, CachedMonthSlice>;
  videos: VideoItem[];
  posts: CommunityPost[];
}

export const ARCHIVE_CACHE_SCHEMA_VERSION = 1;
const IDB_NAME = 'azadari_kopaganj_archive_db';
const IDB_STORE = 'archive_cache';
const IDB_KEY = 'full_bundle_v1';
const LS_FALLBACK_KEY = 'azadari_kopaganj_archive_bundle_v1';

/**
 * Pure diff helper determining which monthly JSON files actually need to be fetched:
 * - Always fetches months missing from cache.
 * - When `config.last_updated` changes, refreshes the newest 2 months (so new community posts
 *   and recent uploads are picked up immediately) plus any older month whose `video_count`
 *   or JSON file paths changed.
 * - When `config.last_updated` is unchanged and all months are cached, returns `[]`
 *   so 90-second polls only touch `config.json` and `assets/livenow.json`.
 */
export function selectMonthsToRefresh(
  prevConfig: AppConfig | null,
  nextConfig: AppConfig,
  cachedMonthsByKey: Record<string, CachedMonthSlice>
): AvailableMonth[] {
  const months = Array.isArray(nextConfig.available_months) ? nextConfig.available_months : [];
  const manifestChanged = !prevConfig || prevConfig.last_updated !== nextConfig.last_updated;

  const toFetch: AvailableMonth[] = [];
  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const key = `${month.yyyy}-${month.mm.padStart(2, '0')}`;
    const existing = cachedMonthsByKey[key];

    if (!existing || existing.video_count < 0) {
      toFetch.push(month);
      continue;
    }

    if (manifestChanged) {
      const countChanged = existing.video_count !== month.video_count;
      const pathsChanged =
        existing.videos_path !== month.videos_path || existing.post_path !== month.post_path;
      // Always refresh the newest 2 months on a manifest update to catch new posts/edits
      if (i < 2 || countChanged || pathsChanged) {
        toFetch.push(month);
      }
    }
  }

  return toFetch;
}

function openArchiveDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function isValidCachedRecord(value: unknown): value is CachedArchiveRecord {
  if (!value || typeof value !== 'object') return false;
  const rec = value as Partial<CachedArchiveRecord>;
  return (
    rec.schemaVersion === ARCHIVE_CACHE_SCHEMA_VERSION &&
    Boolean(rec.config) &&
    Boolean(rec.live) &&
    Array.isArray(rec.videos) &&
    Array.isArray(rec.posts) &&
    Boolean(rec.monthsByKey) &&
    typeof rec.monthsByKey === 'object'
  );
}

export async function readCachedArchiveBundle(): Promise<CachedArchiveRecord | null> {
  const db = await openArchiveDb();
  if (db) {
    try {
      const result = await new Promise<unknown>((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const getReq = store.get(IDB_KEY);
        getReq.onsuccess = () => resolve(getReq.result);
        getReq.onerror = () => resolve(null);
      });
      db.close();
      if (isValidCachedRecord(result)) {
        return result;
      }
    } catch {
      try {
        db.close();
      } catch {
        // ignore close errors
      }
    }
  }

  // Fallback to localStorage if IndexedDB is unavailable or empty
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(LS_FALLBACK_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isValidCachedRecord(parsed)) {
          return parsed;
        }
      }
    } catch {
      // ignore storage read errors
    }
  }

  return null;
}

export async function writeCachedArchiveBundle(record: CachedArchiveRecord): Promise<void> {
  const db = await openArchiveDb();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put(record, IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
      db.close();
      return;
    } catch {
      try {
        db.close();
      } catch {
        // ignore close errors
      }
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(record));
    } catch {
      // ignore quota errors
    }
  }
}
