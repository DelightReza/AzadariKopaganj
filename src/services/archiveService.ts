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

export const DEFAULT_GITHUB_OWNER = 'DelightReza';
export const DEFAULT_GITHUB_REPO = 'AzadariKopaganj';
export const DEFAULT_GITHUB_BRANCH = 'main';
export const REMOTE_RAW_BASE = `https://raw.githubusercontent.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/${DEFAULT_GITHUB_BRANCH}/`;

export interface LoadedArchiveBundle {
  config: AppConfig;
  live: LiveNowState;
  videos: VideoItem[];
  posts: CommunityPost[];
}

export async function fetchJsonSafe<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) {
      return fallback;
    }
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

/**
 * Loads `config.json` first (Base Discovery Manifest), then fetches `assets/livenow.json`
 * and all monthly `videos.json` and `post.json` files discovered in `config.available_months`.
 * When running inside a Capacitor Android APK, it attempts to fetch the latest live files from
 * `https://raw.githubusercontent.com/DelightReza/AzadariKopaganj/main/` and falls back to bundled assets.
 */
export async function loadFullArchiveBundle(baseUrl: string = './'): Promise<LoadedArchiveBundle> {
  const isNative = Capacitor.isNativePlatform();
  const effectiveBase = isNative ? REMOTE_RAW_BASE : baseUrl;

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
    video_json_files: [
      'assets/2026/10/videos.json',
      'assets/2026/09/videos.json',
      'assets/2026/08/videos.json',
    ],
    post_json_files: [
      'assets/2026/10/post.json',
      'assets/2026/09/post.json',
      'assets/2026/08/post.json',
    ],
    latest_video_id: 'GOOvPNTUmtg',
    latest_video_title: 'Live Jashne Syedus Sajideen as Kopaganj, Mau | 14 Jamadiul Awwal 1448H/2026',
    is_live: false,
    available_months: [
      {
        month_year: 'October 2026',
        yyyy: '2026',
        mm: '10',
        video_count: 1,
        videos_path: 'assets/2026/10/videos.json',
        post_path: 'assets/2026/10/post.json',
      },
      {
        month_year: 'September 2026',
        yyyy: '2026',
        mm: '09',
        video_count: 4,
        videos_path: 'assets/2026/09/videos.json',
        post_path: 'assets/2026/09/post.json',
      },
      {
        month_year: 'August 2026',
        yyyy: '2026',
        mm: '08',
        video_count: 10,
        videos_path: 'assets/2026/08/videos.json',
        post_path: 'assets/2026/08/post.json',
      },
    ],
  };

  let config = await fetchJsonSafe<AppConfig>(
    normalizeRelativeAssetUrl('config.json', effectiveBase),
    fallbackConfig
  );
  if (isNative && (!config.available_months || config.available_months.length === 0)) {
    config = await fetchJsonSafe<AppConfig>(normalizeRelativeAssetUrl('config.json', './'), fallbackConfig);
  }

  // Single live stream endpoint: assets/livenow.json
  const liveRelPath = config.endpoints?.live || 'assets/livenow.json';
  const live = await fetchJsonSafe<LiveNowState>(
    normalizeRelativeAssetUrl(liveRelPath, effectiveBase),
    { is_live: false, title: '', youtube_id: '' }
  );

  const videoTemplate = config.endpoints?.videos_month_template || 'assets/{yyyy}/{mm}/videos.json';
  const postTemplate = config.endpoints?.post_month_template || 'assets/{yyyy}/{mm}/post.json';

  const months = Array.isArray(config.available_months) ? config.available_months : [];

  const monthResults: Array<{ videos: VideoItem[]; posts: CommunityPost[] }> = [];
  const batchSize = 18;
  for (let i = 0; i < months.length; i += batchSize) {
    const slice = months.slice(i, i + batchSize);
    const batch = await Promise.all(
      slice.map(async (month) => {
        const monthKey = `${month.yyyy}-${month.mm.padStart(2, '0')}`;
        const vPath =
          month.videos_path || resolveEndpointTemplate(videoTemplate, month.yyyy, month.mm);
        const pPath =
          month.post_path || resolveEndpointTemplate(postTemplate, month.yyyy, month.mm);

        const [monthVideos, monthPosts] = await Promise.all([
          fetchJsonSafe<VideoItem[]>(normalizeRelativeAssetUrl(vPath, effectiveBase), []),
          fetchJsonSafe<CommunityPost[]>(normalizeRelativeAssetUrl(pPath, effectiveBase), []),
        ]);

        return {
          videos: monthVideos.map((v) => ({
            ...v,
            month_key: monthKey,
            month_label: month.month_year,
          })),
          posts: monthPosts.map((p) => ({
            ...p,
            month_key: monthKey,
            month_label: month.month_year,
          })),
        };
      })
    );
    monthResults.push(...batch);
  }

  const allVideos: VideoItem[] = [];
  const seenVideoIds = new Set<string>();
  const allPosts: CommunityPost[] = [];
  const seenPostIds = new Set<string>();

  for (const res of monthResults) {
    for (const v of res.videos) {
      const vid = v.youtube_id || v.id;
      if (vid && !seenVideoIds.has(vid)) {
        seenVideoIds.add(vid);
        allVideos.push(v);
      }
    }
    for (const p of res.posts) {
      if (p.id && !seenPostIds.has(p.id)) {
        seenPostIds.add(p.id);
        allPosts.push(p);
      }
    }
  }

  return {
    config,
    live: {
      is_live: Boolean(live.is_live || config.is_live),
      title: live.title || (config.is_live ? config.latest_video_title : ''),
      youtube_id: live.youtube_id || (config.is_live ? config.latest_video_id : ''),
    },
    videos: allVideos,
    posts: allPosts,
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
