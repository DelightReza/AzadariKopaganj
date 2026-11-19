import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  AppConfig,
  CommunityPost,
  GitHubRepoSettings,
  LiveNowState,
  VideoItem,
} from '../types/archive';
import {
  normalizeRelativeAssetUrl,
  resolveEndpointTemplate,
} from '../utils/archiveLogic';

import {
  ARCHIVE_CACHE_SCHEMA_VERSION,
  readCachedArchiveBundle,
  selectMonthsToRefresh,
  writeCachedArchiveBundle,
  type CachedArchiveRecord,
  type CachedMonthSlice,
} from './archiveCache';

export const DEFAULT_GITHUB_OWNER = 'DelightReza';
export const DEFAULT_GITHUB_REPO = 'AzadariKopaganj';
export const DEFAULT_GITHUB_BRANCH = 'main';
export const REMOTE_RAW_BASE = `https://raw.githubusercontent.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/${DEFAULT_GITHUB_BRANCH}/`;

export interface LoadedArchiveBundle {
  config: AppConfig;
  live: LiveNowState;
  videos: VideoItem[];
  posts: CommunityPost[];
  fromCache?: boolean;
  cacheRecord?: CachedArchiveRecord;
}

export async function fetchJsonOrNull<T>(
  url: string,
  cacheMode: RequestCache = 'no-store'
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: cacheMode,
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchJsonSafe<T>(
  url: string,
  fallback: T,
  cacheMode: RequestCache = 'no-store'
): Promise<T> {
  const data = await fetchJsonOrNull<T>(url, cacheMode);
  return data === null ? fallback : data;
}

function flattenOrderedMonths(
  config: AppConfig,
  monthsByKey: Record<string, CachedMonthSlice>
): { videos: VideoItem[]; posts: CommunityPost[] } {
  const allVideos: VideoItem[] = [];
  const seenVideoIds = new Set<string>();
  const allPosts: CommunityPost[] = [];
  const seenPostIds = new Set<string>();

  const months = Array.isArray(config.available_months) ? config.available_months : [];
  for (const month of months) {
    const monthKey = `${month.yyyy}-${month.mm.padStart(2, '0')}`;
    const slice = monthsByKey[monthKey];
    if (!slice) continue;

    for (const v of slice.videos) {
      const vid = v.youtube_id || v.id;
      if (vid && !seenVideoIds.has(vid)) {
        seenVideoIds.add(vid);
        allVideos.push(v);
      }
    }
    for (const p of slice.posts) {
      if (p.id && !seenPostIds.has(p.id)) {
        seenPostIds.add(p.id);
        allPosts.push(p);
      }
    }
  }

  return { videos: allVideos, posts: allPosts };
}

/**
 * Loads `config.json` and `assets/livenow.json` first, then performs smart incremental
 * sync against the local IndexedDB cache:
 * - On 90-second polls when `config.last_updated` hasn't changed, reuses all cached monthly
 *   `videos.json` and `post.json` slices (fetching only 2 tiny files instead of 184+).
 * - When `config.last_updated` changes, fetches only newly added/changed months + the newest 2 months.
 * - Offline in Capacitor Android APK: serves the persisted IndexedDB cache if available, or falls
 *   back cleanly to bundled `./` APK assets on a first-launch offline start.
 */
export async function loadFullArchiveBundle(
  baseUrl: string = './',
  existingCache?: CachedArchiveRecord | null
): Promise<LoadedArchiveBundle> {
  const isNative = Capacitor.isNativePlatform();
  const cached = existingCache !== undefined ? existingCache : await readCachedArchiveBundle();

  const fallbackConfig: AppConfig = {
    version: 1,
    channel_id: 'UCyCIC43pbujKarf1irIjtrA',
    channel_name: 'Azadari Kopaganj',
    channel_url: 'https://www.youtube.com/channel/UCyCIC43pbujKarf1irIjtrA',
    rss_url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCyCIC43pbujKarf1irIjtrA',
    live_url: 'https://www.youtube.com/channel/UCyCIC43pbujKarf1irIjtrA/live',
    last_updated: '2026-11-03T09:02:34Z',
    endpoints: {
      live: 'assets/livenow.json',
      videos_month_template: 'assets/{yyyy}/{mm}/videos.json',
      post_month_template: 'assets/{yyyy}/{mm}/post.json',
    },
    video_json_files: [],
    post_json_files: [],
    latest_video_id: 'GOOvPNTUmtg',
    latest_video_title: 'Live Jashne Syedus Sajideen as Kopaganj, Mau | 14 Jamadiul Awwal 1448H/2026',
    is_live: false,
    available_months: [],
  };

  let effectiveBase = isNative ? REMOTE_RAW_BASE : baseUrl;
  let source: 'remote' | 'bundled' = 'remote';

  let config = await fetchJsonOrNull<AppConfig>(
    normalizeRelativeAssetUrl('config.json', effectiveBase),
    'no-store'
  );

  // Offline / unreachable handling
  if (!config || !Array.isArray(config.available_months) || config.available_months.length === 0) {
    // 1. If we already have a cached archive (from a previous remote or bundled load), return it immediately
    if (cached && cached.videos.length > 0) {
      return {
        config: cached.config,
        live: cached.live,
        videos: cached.videos,
        posts: cached.posts,
        fromCache: true,
        cacheRecord: cached,
      };
    }

    // 2. First launch while offline in Android APK: switch effectiveBase to bundled './' assets
    if (isNative) {
      effectiveBase = './';
      source = 'bundled';
      config = await fetchJsonOrNull<AppConfig>(
        normalizeRelativeAssetUrl('config.json', './'),
        'default'
      );
    }
  }

  if (!config) {
    config = cached?.config || fallbackConfig;
  }

  // Always check assets/livenow.json fresh (tiny file, drives live banner & notifications)
  const liveRelPath = config.endpoints?.live || 'assets/livenow.json';
  const fetchedLive = await fetchJsonOrNull<LiveNowState>(
    normalizeRelativeAssetUrl(liveRelPath, effectiveBase),
    'no-store'
  );
  const live: LiveNowState = fetchedLive || cached?.live || {
    is_live: false,
    title: '',
    youtube_id: '',
  };

  const resolvedLive: LiveNowState = {
    is_live: Boolean(live.is_live || config.is_live),
    title: live.title || (config.is_live ? config.latest_video_title : ''),
    youtube_id: live.youtube_id || (config.is_live ? config.latest_video_id : ''),
  };

  const videoTemplate = config.endpoints?.videos_month_template || 'assets/{yyyy}/{mm}/videos.json';
  const postTemplate = config.endpoints?.post_month_template || 'assets/{yyyy}/{mm}/post.json';

  // Only reuse per-month cache if it came from the same/better source (remote overrides bundled)
  const reusableMonthsByKey: Record<string, CachedMonthSlice> =
    cached && (source === 'bundled' || cached.source === 'remote')
      ? { ...cached.monthsByKey }
      : {};
  const prevConfigForDiff =
    cached && (source === 'bundled' || cached.source === 'remote') ? cached.config : null;

  const monthsToFetch = selectMonthsToRefresh(prevConfigForDiff, config, reusableMonthsByKey);

  if (monthsToFetch.length > 0) {
    const batchSize = 18;
    const monthCacheMode: RequestCache = source === 'bundled' ? 'default' : 'no-store';

    for (let i = 0; i < monthsToFetch.length; i += batchSize) {
      const slice = monthsToFetch.slice(i, i + batchSize);
      await Promise.all(
        slice.map(async (month) => {
          const monthKey = `${month.yyyy}-${month.mm.padStart(2, '0')}`;
          const vPath =
            month.videos_path || resolveEndpointTemplate(videoTemplate, month.yyyy, month.mm);
          const pPath =
            month.post_path || resolveEndpointTemplate(postTemplate, month.yyyy, month.mm);

          const [fetchedVideos, fetchedPosts] = await Promise.all([
            fetchJsonOrNull<VideoItem[]>(
              normalizeRelativeAssetUrl(vPath, effectiveBase),
              monthCacheMode
            ),
            fetchJsonOrNull<CommunityPost[]>(
              normalizeRelativeAssetUrl(pPath, effectiveBase),
              monthCacheMode
            ),
          ]);

          const prevSlice = reusableMonthsByKey[monthKey];

          // If a remote month request fails transiently, fall back to cached slice or bundled './' in APK
          let resolvedVideos = fetchedVideos;
          let resolvedPosts = fetchedPosts;
          if (resolvedVideos === null && !prevSlice && isNative && effectiveBase !== './') {
            resolvedVideos = await fetchJsonOrNull<VideoItem[]>(
              normalizeRelativeAssetUrl(vPath, './'),
              'default'
            );
          }
          if (resolvedPosts === null && !prevSlice && isNative && effectiveBase !== './') {
            resolvedPosts = await fetchJsonOrNull<CommunityPost[]>(
              normalizeRelativeAssetUrl(pPath, './'),
              'default'
            );
          }

          const finalVideos =
            resolvedVideos !== null
              ? resolvedVideos.map((v) => ({
                  ...v,
                  month_key: monthKey,
                  month_label: month.month_year,
                }))
              : prevSlice?.videos || [];

          const finalPosts =
            resolvedPosts !== null
              ? resolvedPosts.map((p) => ({
                  ...p,
                  month_key: monthKey,
                  month_label: month.month_year,
                }))
              : prevSlice?.posts || [];

          if (resolvedVideos !== null || resolvedPosts !== null || prevSlice) {
            reusableMonthsByKey[monthKey] = {
              month_key: monthKey,
              video_count: resolvedVideos !== null ? month.video_count : -1,
              videos_path: vPath,
              post_path: pPath,
              videos: finalVideos,
              posts: finalPosts,
            };
          }
        })
      );
    }
  }

  const { videos: allVideos, posts: allPosts } = flattenOrderedMonths(config, reusableMonthsByKey);

  const nextCacheRecord: CachedArchiveRecord = {
    schemaVersion: ARCHIVE_CACHE_SCHEMA_VERSION,
    cachedAt: Date.now(),
    source,
    config,
    live: resolvedLive,
    monthsByKey: reusableMonthsByKey,
    videos: allVideos,
    posts: allPosts,
  };

  // Persist asynchronously so UI renders immediately
  if (allVideos.length > 0 || allPosts.length > 0) {
    void writeCachedArchiveBundle(nextCacheRecord);
  }

  return {
    config,
    live: resolvedLive,
    videos: allVideos,
    posts: allPosts,
    fromCache: monthsToFetch.length === 0 && Boolean(cached),
    cacheRecord: nextCacheRecord,
  };
}

/**
 * Commits an updated JSON file directly to https://github.com/DelightReza/AzadariKopaganj
 * using the GitHub Contents API, fetching the latest file SHA first to prevent conflicts.
 */
export async function commitJsonToGitHub(
  settings: GitHubRepoSettings,
  filePath: string,
  jsonContent: unknown,
  commitMessage: string
): Promise<{ ok: boolean; sha?: string; htmlUrl?: string; error?: string }> {
  const { owner, repo, branch, token } = settings;
  if (!owner.trim() || !repo.trim() || !token.trim()) {
    return { ok: false, error: 'GitHub owner, repository name, and personal access token are required.' };
  }

  const cleanPath = filePath.replace(/^\/+/, '');
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner.trim())}/${encodeURIComponent(
    repo.trim()
  )}/contents/${cleanPath}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    let existingSha: string | undefined;
    const getResp = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch.trim() || 'main')}`, {
      headers,
    });
    if (getResp.ok) {
      const fileMeta = (await getResp.json()) as { sha?: string };
      existingSha = fileMeta.sha;
    }

    const formatted = JSON.stringify(jsonContent, null, 2) + '\n';
    const utf8Bytes = new TextEncoder().encode(formatted);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    const base64Content = btoa(binary);

    const putResp = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: commitMessage,
        content: base64Content,
        branch: branch.trim() || 'main',
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });

    if (!putResp.ok) {
      const errBody = await putResp.text();
      return { ok: false, error: `GitHub API (${putResp.status}): ${errBody.slice(0, 180)}` };
    }

    const result = (await putResp.json()) as {
      content?: { sha?: string; html_url?: string };
    };
    return {
      ok: true,
      sha: result.content?.sha,
      htmlUrl: result.content?.html_url,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network failure communicating with GitHub API.' };
  }
}

/**
 * Requests permission for Native Notifications (Capacitor LocalNotifications on Android APK + Web Notification API in Browser).
 */
export async function requestNativeNotificationPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await LocalNotifications.requestPermissions();
      return perm.display === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const result = await Notification.requestPermission();
    return result === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export function sendBrowserNotification(title: string, body: string): boolean {
  if (Capacitor.isNativePlatform()) {
    LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2147483647),
          title,
          body,
          schedule: { at: new Date(Date.now() + 250) },
        },
      ],
    }).catch(() => {});
    return true;
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }
  try {
    new Notification(title, {
      body,
      tag: `azadari-${Date.now()}`,
    });
    return true;
  } catch {
    return false;
  }
}
