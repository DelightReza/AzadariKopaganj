import type { VideoTopicFilter } from './archiveLogic';

export type YouTubeSectionTab = 'home' | 'live' | 'videos' | 'posts';

export interface ParsedAppRoute {
  section: YouTubeSectionTab;
  watching: boolean;
  watchId: string | null;
  isLiveStream: boolean;
  videoTopic: VideoTopicFilter;
  videoMonth: string;
  postMonth: string;
  queueMonth: string;
  searchQuery: string;
}

const VALID_SECTIONS = new Set<YouTubeSectionTab>(['home', 'live', 'videos', 'posts']);
const VALID_TOPICS = new Set<VideoTopicFilter>([
  'all',
  'jashn',
  'majlis',
  'nauha',
  'qaseeda',
  'shorts',
]);

export const DEFAULT_APP_ROUTE: ParsedAppRoute = {
  section: 'home',
  watching: false,
  watchId: null,
  isLiveStream: false,
  videoTopic: 'all',
  videoMonth: 'all',
  postMonth: 'all',
  queueMonth: 'all',
  searchQuery: '',
};

/**
 * Parses window.location.hash (e.g. "#/videos?topic=majlis&month=2026-10" or "#/watch/GOOvPNTUmtg")
 * into deterministic app state so page refreshes and browser Back/Forward preserve exact views.
 */
export function parseAppRoute(hash: string): ParsedAppRoute {
  const cleaned = (hash || '').replace(/^#/, '');
  if (!cleaned || cleaned === '/') {
    return { ...DEFAULT_APP_ROUTE };
  }

  const [rawPath, rawQuery = ''] = cleaned.split('?');
  const segments = rawPath
    .split('/')
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);

  const params = new URLSearchParams(rawQuery);
  const rawTopic = (params.get('topic') || 'all').toLowerCase() as VideoTopicFilter;
  const videoTopic: VideoTopicFilter = VALID_TOPICS.has(rawTopic) ? rawTopic : 'all';
  const videoMonth = params.get('month') || 'all';
  const postMonth = params.get('pmonth') || 'all';
  const queueMonth = params.get('queue') || 'all';
  const searchQuery = params.get('q') || '';
  const fromParam = (params.get('from') || '').toLowerCase() as YouTubeSectionTab;

  if (segments[0] === 'watch' && segments[1]) {
    const target = segments[1];
    const isLiveStream = target.toLowerCase() === 'live';
    return {
      section: VALID_SECTIONS.has(fromParam) ? fromParam : 'home',
      watching: true,
      watchId: isLiveStream ? null : target,
      isLiveStream,
      videoTopic,
      videoMonth,
      postMonth,
      queueMonth,
      searchQuery,
    };
  }

  const sectionCandidate = (segments[0] || 'home').toLowerCase() as YouTubeSectionTab;
  const section: YouTubeSectionTab = VALID_SECTIONS.has(sectionCandidate)
    ? sectionCandidate
    : 'home';

  return {
    section,
    watching: false,
    watchId: null,
    isLiveStream: false,
    videoTopic,
    videoMonth,
    postMonth,
    queueMonth,
    searchQuery,
  };
}

/**
 * Serializes current app navigation & active filters into a shareable, GitHub-Pages-safe hash URL.
 */
export function buildAppHash(route: ParsedAppRoute): string {
  const params = new URLSearchParams();

  if (route.watching) {
    if (route.section !== 'home') {
      params.set('from', route.section);
    }
    if (route.queueMonth && route.queueMonth !== 'all') {
      params.set('queue', route.queueMonth);
    }
    if (route.videoTopic && route.videoTopic !== 'all') {
      params.set('topic', route.videoTopic);
    }
    if (route.videoMonth && route.videoMonth !== 'all') {
      params.set('month', route.videoMonth);
    }
    if (route.postMonth && route.postMonth !== 'all') {
      params.set('pmonth', route.postMonth);
    }
    if (route.searchQuery.trim()) {
      params.set('q', route.searchQuery.trim());
    }

    const watchSegment = route.isLiveStream ? 'live' : encodeURIComponent(route.watchId || '');
    const qs = params.toString();
    return `#/watch/${watchSegment}${qs ? `?${qs}` : ''}`;
  }

  if (route.videoTopic && route.videoTopic !== 'all') {
    params.set('topic', route.videoTopic);
  }
  if (route.videoMonth && route.videoMonth !== 'all') {
    params.set('month', route.videoMonth);
  }
  if (route.postMonth && route.postMonth !== 'all') {
    params.set('pmonth', route.postMonth);
  }
  if (route.queueMonth && route.queueMonth !== 'all') {
    params.set('queue', route.queueMonth);
  }
  if (route.searchQuery.trim()) {
    params.set('q', route.searchQuery.trim());
  }

  const basePath = route.section === 'home' ? '#/' : `#/${route.section}`;
  const qs = params.toString();
  return `${basePath}${qs ? `?${qs}` : ''}`;
}
