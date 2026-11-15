import type {
  AvailableMonth,
  CommunityPost,
  CommunityPostDraft,
  FeedNotificationItem,
  FeedSnapshot,
  LiveNowState,
  VideoItem,
} from '../types/archive';

/**
 * Resolves a template like "assets/{yyyy}/{mm}/videos.json" with year and month.
 */
export function resolveEndpointTemplate(template: string, yyyy: string, mm: string): string {
  const paddedMm = mm.trim().padStart(2, '0');
  return template
    .replace(/\{yyyy\}/gi, yyyy.trim())
    .replace(/\{mm\}/gi, paddedMm);
}

/**
 * Normalizes a relative asset path so it works both at root (`/`) and on GitHub Pages subpaths (`/repo-name/`).
 */
export function normalizeRelativeAssetUrl(assetPath: string, baseUrl: string = './'): string {
  const cleanAsset = assetPath.trim().replace(/^\.?\//, '');
  const cleanBase = baseUrl.trim().endsWith('/') ? baseUrl.trim() : `${baseUrl.trim()}/`;
  if (cleanBase === './' || cleanBase === '/') {
    return `./${cleanAsset}`;
  }
  return `${cleanBase}${cleanAsset}`;
}

/**
 * Extracts an 11-character YouTube video ID from a raw ID, watch URL, short youtu.be URL, or embed URL.
 */
export function extractYouTubeId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
    /img\.youtube\.com\/vi\/([a-zA-Z0-9_-]{11})\//,
  ];

  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }

  return '';
}

export function buildThumbnailUrl(youtubeId: string): string {
  const cleanId = extractYouTubeId(youtubeId) || youtubeId.trim();
  if (!cleanId) return '';
  return `https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validates a manual community post draft before generating or committing `post.json`.
 */
export function validateCommunityPostDraft(draft: CommunityPostDraft): ValidationResult {
  const errors: Record<string, string> = {};

  if (!draft.title || !draft.title.trim()) {
    errors.title = 'Announcement title is required.';
  } else if (draft.title.trim().length < 4) {
    errors.title = 'Title must be at least 4 characters.';
  }

  if (!draft.text || !draft.text.trim()) {
    errors.text = 'Announcement body text is required.';
  }

  if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date.trim())) {
    errors.date = 'Date must follow YYYY-MM-DD format.';
  }

  if (draft.link_url && draft.link_url.trim()) {
    const urlStr = draft.link_url.trim();
    if (!/^https?:\/\/.+/i.test(urlStr)) {
      errors.link_url = 'Link URL must start with http:// or https://.';
    }
  }

  if (draft.image_url && draft.image_url.trim()) {
    const imgStr = draft.image_url.trim();
    if (!/^(https?:\/\/|\/|\.|assets\/).+/i.test(imgStr)) {
      errors.image_url = 'Image URL must be a valid http(s) or relative path.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Creates a deterministic, schema-compliant CommunityPost object for `assets/YYYY/MM/post.json`.
 */
export function createCommunityPost(draft: CommunityPostDraft, existingCount: number = 0): CommunityPost {
  const cleanDate = draft.date.trim();
  const dateSlug = cleanDate.replace(/-/g, '_');
  const suffix = existingCount > 0 ? `_${existingCount + 1}` : '';
  const generatedId = draft.id?.trim() || `post_${dateSlug}${suffix}`;

  const linkedVideoId = extractYouTubeId(draft.link_url || '') || extractYouTubeId(draft.image_url || '');
  const resolvedImageUrl =
    draft.image_url.trim() ||
    (linkedVideoId ? buildThumbnailUrl(linkedVideoId) : 'https://img.youtube.com/vi/GOOvPNTUmtg/hqdefault.jpg');
  const resolvedLinkUrl =
    draft.link_url.trim() ||
    (linkedVideoId
      ? `https://www.youtube.com/watch?v=${linkedVideoId}`
      : 'https://www.youtube.com/channel/UCyCIC43pbujKarf1irIjtrA');

  const [yyyy = '2026', mm = '10'] = cleanDate.split('-');

  return {
    id: generatedId,
    date: cleanDate,
    title: draft.title.trim(),
    text: draft.text.trim(),
    image_url: resolvedImageUrl,
    link_url: resolvedLinkUrl,
    month_key: `${yyyy}-${mm}`,
  };
}

/**
 * Merges a new or edited community post into an existing list sorted by date descending.
 */
export function mergeCommunityPosts(existing: CommunityPost[], incoming: CommunityPost): CommunityPost[] {
  const map = new Map<string, CommunityPost>();
  for (const item of existing) {
    map.set(item.id, item);
  }
  map.set(incoming.id, incoming);
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Compares previous and current feed states to emit native notification items for:
 * 1. Newly started live stream (`assets/livenow.json` or `config.is_live`)
 * 2. New video uploads (`videos.json` or `config.latest_video_id`)
 * 3. New community notices (`post.json`)
 */
export function detectFeedUpdates(
  previous: FeedSnapshot | null,
  current: {
    live: LiveNowState;
    videos: VideoItem[];
    posts: CommunityPost[];
    latestVideoId: string;
    latestVideoTitle: string;
  },
  nowIso: string = new Date().toISOString()
): { notifications: FeedNotificationItem[]; nextSnapshot: FeedSnapshot } {
  const currentVideoIds = current.videos.map((v) => v.youtube_id || v.id);
  const currentPostIds = current.posts.map((p) => p.id);

  const nextSnapshot: FeedSnapshot = {
    latestVideoId: current.latestVideoId || currentVideoIds[0] || '',
    isLive: Boolean(current.live.is_live),
    liveVideoId: current.live.youtube_id || '',
    knownVideoIds: Array.from(new Set(currentVideoIds)),
    knownPostIds: Array.from(new Set(currentPostIds)),
  };

  if (!previous) {
    return { notifications: [], nextSnapshot };
  }

  const notifications: FeedNotificationItem[] = [];

  // 1. Check live stream transition
  if (
    current.live.is_live &&
    (!previous.isLive || (current.live.youtube_id && current.live.youtube_id !== previous.liveVideoId))
  ) {
    notifications.push({
      id: `notif_live_${current.live.youtube_id || Date.now()}`,
      kind: 'live',
      title: 'Live Now: Azadari Kopaganj',
      body: current.live.title || 'Live Majlis / Julus broadcast has started.',
      youtubeId: current.live.youtube_id,
      url: current.live.youtube_id
        ? `https://www.youtube.com/watch?v=${current.live.youtube_id}`
        : 'https://www.youtube.com/channel/UCyCIC43pbujKarf1irIjtrA/live',
      timestamp: nowIso,
    });
  }

  // 2. Check new video uploads
  const prevVideoSet = new Set(previous.knownVideoIds);
  for (const video of current.videos) {
    const vid = video.youtube_id || video.id;
    if (vid && !prevVideoSet.has(vid)) {
      notifications.push({
        id: `notif_video_${vid}`,
        kind: 'video',
        title: 'New Video Uploaded — Azadari Kopaganj',
        body: video.title,
        youtubeId: vid,
        url: `https://www.youtube.com/watch?v=${vid}`,
        timestamp: nowIso,
      });
    }
  }

  // Also check if config.latest_video_id changed and wasn't in current.videos yet
  if (
    current.latestVideoId &&
    current.latestVideoId !== previous.latestVideoId &&
    !prevVideoSet.has(current.latestVideoId) &&
    !notifications.some((n) => n.youtubeId === current.latestVideoId)
  ) {
    notifications.push({
      id: `notif_video_${current.latestVideoId}`,
      kind: 'video',
      title: 'New Video Uploaded — Azadari Kopaganj',
      body: current.latestVideoTitle || `Video ${current.latestVideoId} is now available.`,
      youtubeId: current.latestVideoId,
      url: `https://www.youtube.com/watch?v=${current.latestVideoId}`,
      timestamp: nowIso,
    });
  }

  // 3. Check new community posts
  const prevPostSet = new Set(previous.knownPostIds);
  for (const post of current.posts) {
    if (post.id && !prevPostSet.has(post.id)) {
      notifications.push({
        id: `notif_post_${post.id}`,
        kind: 'post',
        title: `Community Notice: ${post.title}`,
        body: post.text,
        url: post.link_url,
        timestamp: nowIso,
      });
    }
  }

  return { notifications, nextSnapshot };
}

export interface VideoFilterOptions {
  searchQuery?: string;
  monthKey?: string; // "all", "YYYY", or "YYYY-MM"
  watchlistOnly?: boolean;
  watchlistIds?: string[];
}

export function filterVideos(videos: VideoItem[], options: VideoFilterOptions): VideoItem[] {
  const query = (options.searchQuery || '').trim().toLowerCase();
  const monthKey = options.monthKey || 'all';
  const watchlistSet = new Set(options.watchlistIds || []);

  return videos
    .filter((video) => {
      const vid = video.youtube_id || video.id;
      if (options.watchlistOnly && !watchlistSet.has(vid)) {
        return false;
      }
      if (monthKey !== 'all') {
        const itemMonth = video.month_key || video.published.slice(0, 7);
        if (monthKey.length === 4) {
          if (!itemMonth.startsWith(monthKey)) {
            return false;
          }
        } else if (itemMonth !== monthKey) {
          return false;
        }
      }
      if (query) {
        const hay = `${video.title} ${vid} ${video.published} ${video.month_label || ''}`.toLowerCase();
        if (!hay.includes(query)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => b.published.localeCompare(a.published));
}

export function filterPosts(
  posts: CommunityPost[],
  options: { searchQuery?: string; monthKey?: string }
): CommunityPost[] {
  const query = (options.searchQuery || '').trim().toLowerCase();
  const monthKey = options.monthKey || 'all';

  return posts
    .filter((post) => {
      if (monthKey !== 'all') {
        const itemMonth = post.month_key || post.date.slice(0, 7);
        if (monthKey.length === 4) {
          if (!itemMonth.startsWith(monthKey)) {
            return false;
          }
        } else if (itemMonth !== monthKey) {
          return false;
        }
      }
      if (query) {
        const hay = `${post.title} ${post.text} ${post.date} ${post.id}`.toLowerCase();
        if (!hay.includes(query)) {
          return false;
        }
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function formatArchiveDate(isoOrDate: string): string {
  if (!isoOrDate) return 'Unknown Date';
  const parsed = new Date(isoOrDate.length === 10 ? `${isoOrDate}T00:00:00Z` : isoOrDate);
  if (Number.isNaN(parsed.getTime())) {
    return isoOrDate;
  }
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatYouTubeRelativeTime(isoOrDate: string): string {
  if (!isoOrDate) return 'Recently';
  const parsed = new Date(isoOrDate.length === 10 ? `${isoOrDate}T00:00:00Z` : isoOrDate);
  if (Number.isNaN(parsed.getTime())) return isoOrDate;

  const refNow = Math.max(Date.now(), new Date('2026-11-14T10:00:00Z').getTime());
  const diffSec = Math.max(60, Math.floor((refNow - parsed.getTime()) / 1000));
  const days = Math.floor(diffSec / 86400);

  if (days < 1) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

export function getYouTubeVideoMeta(videoId: string, title: string = ''): {
  viewsText: string;
  durationBadge: string;
  likesCount: number;
  wasStreamed: boolean;
} {
  let hash = 0;
  for (let i = 0; i < videoId.length; i++) {
    hash = (hash * 31 + videoId.charCodeAt(i)) >>> 0;
  }
  const views = 420 + (hash % 3800);
  const viewsText =
    views >= 1000 ? `${(views / 1000).toFixed(1).replace(/\.0$/, '')}K views` : `${views} views`;
  const wasStreamed = /live|jashn|majlis/i.test(title);
  const mins = 18 + (hash % 95);
  const secs = String(10 + (hash % 49)).padStart(2, '0');
  const durationBadge =
    mins >= 60
      ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}:${secs}`
      : `${mins}:${secs}`;
  const likesCount = 38 + (hash % 210);

  return {
    viewsText,
    durationBadge,
    likesCount,
    wasStreamed,
  };
}

export function getMonthKeyFromAvailable(m: AvailableMonth): string {
  return `${m.yyyy}-${m.mm.padStart(2, '0')}`;
}

