/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Film,
  Home,
  MessageSquare,
  Moon,
  Play,
  Radio,
  Search,
  Sun,
  X,
} from 'lucide-react';
import type {
  AppConfig,
  CommunityPost,
  LiveNowState,
  VideoItem,
} from './types/archive';
import {
  extractVideoViewCount,
  filterPosts,
  filterVideos,
  formatArchiveDate,
  formatCompactViewCount,
  formatYouTubeRelativeTime,
  getPopularVideos,
  getYouTubeVideoMeta,
  isShortVideo,
  type VideoTopicFilter,
} from './utils/archiveLogic';
import {
  buildAppHash,
  parseAppRoute,
  type ParsedAppRoute,
  type YouTubeSectionTab,
} from './utils/appRouting';
import { loadFullArchiveBundle } from './services/archiveService';
import {
  initBackgroundNotificationSync,
  processFeedSyncNotifications,
  promptToAllowNativeNotifications,
} from './services/notificationSyncService';
import { TheatrePlayerSection } from './components/TheatrePlayerSection';
import { CommunitySection } from './components/CommunitySection';
import { InbuiltVideoPlayer } from './components/InbuiltVideoPlayer';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  ChannelAvatar,
  ResilientThumbnail,
} from './components/ResilientThumbnail';

export type { YouTubeSectionTab };

const THEME_STORAGE_KEY = 'azadari_kopaganj_youtube_theme_v1';

function buildFallbackVideoItem(youtubeId: string): VideoItem {
  return {
    id: youtubeId,
    youtube_id: youtubeId,
    title: `Azadari Kopaganj Broadcast (${youtubeId})`,
    published: new Date().toISOString(),
    thumbnail: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
  };
}

function loadStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const initialRoute = useMemo(
    () => parseAppRoute(typeof window !== 'undefined' ? window.location.hash : ''),
    []
  );

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [live, setLive] = useState<LiveNowState>({ is_live: false, title: '', youtube_id: '' });
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Only the 4 core YouTube sections: Home, Live, Videos, Posts
  const [activeSection, setActiveSection] = useState<YouTubeSectionTab>(initialRoute.section);
  // When a user clicks a video card, open the full 2-column YouTube Watch view
  const [watchingPlayerOpen, setWatchingPlayerOpen] = useState<boolean>(initialRoute.watching);

  // YouTube Dark Mode default (#0F0F0F)
  const [darkMode, setDarkMode] = useState<boolean>(() =>
    loadStoredJson<boolean>(THEME_STORAGE_KEY, true)
  );

  // Active player state
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(() =>
    initialRoute.watchId ? buildFallbackVideoItem(initialRoute.watchId) : null
  );
  const [isPlayingLive, setIsPlayingLive] = useState<boolean>(initialRoute.isLiveStream);

  // Queue & Video Grid filters (restored from URL hash on refresh)
  const [selectedQueueMonth, setSelectedQueueMonth] = useState<string>(initialRoute.queueMonth);
  const [selectedVideoMonth, setSelectedVideoMonth] = useState<string>(initialRoute.videoMonth);
  const [selectedTopicChip, setSelectedTopicChip] = useState<VideoTopicFilter>(
    initialRoute.videoTopic
  );
  const [videoSearchQuery, setVideoSearchQuery] = useState<string>(initialRoute.searchQuery);
  const [visibleVideoCount, setVisibleVideoCount] = useState<number>(48);

  // Community filters
  const [selectedPostMonth, setSelectedPostMonth] = useState<string>(initialRoute.postMonth);

  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 640px)').matches : true
  );
  const [notificationPromptOpen, setNotificationPromptOpen] = useState<boolean>(false);

  const videosRef = useRef<VideoItem[]>(videos);
  videosRef.current = videos;
  const desiredWatchIdRef = useRef<string | null>(initialRoute.watchId);
  const desiredLiveRef = useRef<boolean>(initialRoute.isLiveStream);
  const lastRouteHashRef = useRef<string>(buildAppHash(initialRoute));
  const inAppNavDepthRef = useRef<number>(0);
  const scrollCacheRef = useRef<Map<string, number>>(new Map());
  const lastFetchAtRef = useRef<number>(0);

  const currentRouteRef = useRef<ParsedAppRoute>(initialRoute);
  currentRouteRef.current = {
    section: activeSection,
    watching: watchingPlayerOpen,
    watchId: activeVideo ? activeVideo.youtube_id || activeVideo.id : desiredWatchIdRef.current,
    isLiveStream: isPlayingLive,
    videoTopic: selectedTopicChip,
    videoMonth: selectedVideoMonth,
    postMonth: selectedPostMonth,
    queueMonth: selectedQueueMonth,
    searchQuery: videoSearchQuery,
  };

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(darkMode));
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  // Normalize initial history entry and synchronize with browser/Android Back & Forward navigation
  useEffect(() => {
    const initialCanonical = buildAppHash(parseAppRoute(window.location.hash));
    lastRouteHashRef.current = initialCanonical;
    try {
      window.history.replaceState({ azadariRoute: initialCanonical }, '', initialCanonical);
    } catch {
      // ignore history errors
    }

    const syncFromLocation = () => {
      const parsed = parseAppRoute(window.location.hash);
      const canonicalHash = buildAppHash(parsed);

      // Ignore history pops whose hash didn't change (e.g. closing PostImageLightbox modal)
      if (canonicalHash === lastRouteHashRef.current) {
        return;
      }

      lastRouteHashRef.current = canonicalHash;
      inAppNavDepthRef.current = Math.max(0, inAppNavDepthRef.current - 1);
      desiredWatchIdRef.current = parsed.watchId;
      desiredLiveRef.current = parsed.isLiveStream;

      setActiveSection(parsed.section);
      setWatchingPlayerOpen(parsed.watching);
      setIsPlayingLive(parsed.isLiveStream);
      setSelectedQueueMonth(parsed.queueMonth);
      setSelectedVideoMonth(parsed.videoMonth);
      setSelectedTopicChip(parsed.videoTopic);
      setVideoSearchQuery(parsed.searchQuery);
      setSelectedPostMonth(parsed.postMonth);

      if (parsed.watching && parsed.watchId) {
        const match = videosRef.current.find((v) => (v.youtube_id || v.id) === parsed.watchId);
        setActiveVideo(match || buildFallbackVideoItem(parsed.watchId));
      }

      const savedY = scrollCacheRef.current.get(canonicalHash) ?? 0;
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: savedY, behavior: 'auto' });
      });
    };

    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener('hashchange', syncFromLocation);
    };
  }, []);

  const commitRoute = useCallback(
    (
      nextRoute: ParsedAppRoute,
      mode: 'push' | 'replace',
      scrollBehavior: 'top' | 'none' = 'top'
    ) => {
      const prevHash = lastRouteHashRef.current;
      const nextHash = buildAppHash(nextRoute);

      if (nextHash !== prevHash) {
        if (mode === 'push') {
          scrollCacheRef.current.set(prevHash, window.scrollY || 0);
          try {
            window.history.pushState({ azadariRoute: nextHash }, '', nextHash);
            inAppNavDepthRef.current += 1;
          } catch {
            window.location.hash = nextHash;
          }
        } else {
          try {
            window.history.replaceState({ azadariRoute: nextHash }, '', nextHash);
          } catch {
            // ignore history errors
          }
        }
        lastRouteHashRef.current = nextHash;
      }

      if (scrollBehavior === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    []
  );

  const updateRouteFilters = useCallback(
    (patch: Partial<ParsedAppRoute>) => {
      const nextRoute: ParsedAppRoute = {
        ...currentRouteRef.current,
        ...patch,
      };
      commitRoute(nextRoute, 'replace', 'none');
    },
    [commitRoute]
  );

  const navigateFromNotification = useCallback(
    (routeHash: string) => {
      const parsed = parseAppRoute(routeHash);
      desiredWatchIdRef.current = parsed.watchId;
      desiredLiveRef.current = parsed.isLiveStream;
      setActiveSection(parsed.section);
      setWatchingPlayerOpen(parsed.watching);
      setIsPlayingLive(parsed.isLiveStream);

      if (parsed.watching && parsed.watchId) {
        const match = videosRef.current.find((v) => (v.youtube_id || v.id) === parsed.watchId);
        setActiveVideo(match || buildFallbackVideoItem(parsed.watchId));
      }

      commitRoute(
        {
          ...currentRouteRef.current,
          section: parsed.section,
          watching: parsed.watching,
          watchId: parsed.watchId,
          isLiveStream: parsed.isLiveStream,
        },
        'push',
        'top'
      );
    },
    [commitRoute]
  );

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let active = true;

    const setup = async () => {
      const fn = await initBackgroundNotificationSync(
        navigateFromNotification,
        (allowed) => {
          if (active) {
            setNotificationPromptOpen(!allowed);
          }
        }
      );
      if (active) {
        cleanup = fn;
      } else {
        fn();
      }
    };

    void setup();
    return () => {
      active = false;
      cleanup?.();
    };
  }, [navigateFromNotification]);

  const fetchArchive = useCallback(async () => {
    try {
      const loaded = await loadFullArchiveBundle('./');
      lastFetchAtRef.current = Date.now();
      setConfig(loaded.config);
      setLive(loaded.live);
      setVideos(loaded.videos);
      setPosts(loaded.posts);
      void processFeedSyncNotifications(loaded);

      setActiveVideo((prev) => {
        const targetWatchId = desiredWatchIdRef.current;
        if (targetWatchId) {
          const matchTarget = loaded.videos.find((v) => (v.youtube_id || v.id) === targetWatchId);
          return matchTarget || prev || buildFallbackVideoItem(targetWatchId);
        }
        if (prev) return prev;
        const matchLatest = loaded.videos.find(
          (v) => (v.youtube_id || v.id) === loaded.config.latest_video_id
        );
        return matchLatest || loaded.videos[0] || null;
      });

      if (desiredLiveRef.current && loaded.live.is_live && loaded.live.youtube_id) {
        setIsPlayingLive(true);
      }
    } catch (err) {
      console.error('Error loading Azadari Kopaganj archive:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchive();
  }, [fetchArchive]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchArchive();
    }, 90_000);
    const onVisibilityChange = () => {
      if (!document.hidden && Date.now() - lastFetchAtRef.current > 60_000) {
        fetchArchive();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchArchive]);

  const handlePlayVideoById = (youtubeId: string) => {
    const found = videos.find((v) => (v.youtube_id || v.id) === youtubeId);
    const nextVideo = found || buildFallbackVideoItem(youtubeId);
    desiredWatchIdRef.current = youtubeId;
    desiredLiveRef.current = false;
    setActiveVideo(nextVideo);
    setIsPlayingLive(false);
    setWatchingPlayerOpen(true);

    commitRoute(
      {
        ...currentRouteRef.current,
        watching: true,
        watchId: youtubeId,
        isLiveStream: false,
      },
      'push',
      'top'
    );
  };

  const handleSelectVideoItem = (video: VideoItem) => {
    const youtubeId = video.youtube_id || video.id;
    desiredWatchIdRef.current = youtubeId;
    desiredLiveRef.current = false;
    setActiveVideo(video);
    setIsPlayingLive(false);
    setWatchingPlayerOpen(true);

    commitRoute(
      {
        ...currentRouteRef.current,
        watching: true,
        watchId: youtubeId,
        isLiveStream: false,
      },
      'push',
      'top'
    );
  };

  const handleOpenLiveWatch = (fromSection: YouTubeSectionTab = activeSection) => {
    desiredLiveRef.current = true;
    desiredWatchIdRef.current = null;
    setIsPlayingLive(true);
    setWatchingPlayerOpen(true);

    commitRoute(
      {
        ...currentRouteRef.current,
        section: fromSection,
        watching: true,
        watchId: null,
        isLiveStream: true,
      },
      'push',
      'top'
    );
  };

  const handleNavigateSection = (section: YouTubeSectionTab) => {
    const alreadyOnSection = activeSection === section && !watchingPlayerOpen;
    desiredLiveRef.current = false;
    setActiveSection(section);
    setWatchingPlayerOpen(false);

    if (alreadyOnSection) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    commitRoute(
      {
        ...currentRouteRef.current,
        section,
        watching: false,
        watchId: null,
        isLiveStream: false,
      },
      'push',
      'top'
    );
  };

  const handleBackFromWatch = () => {
    if (inAppNavDepthRef.current > 0) {
      window.history.back();
      return;
    }
    // Direct visit / refreshed watch URL: exit watch view cleanly back to section feed
    desiredLiveRef.current = false;
    setWatchingPlayerOpen(false);
    setIsPlayingLive(false);
    commitRoute(
      {
        ...currentRouteRef.current,
        watching: false,
        watchId: null,
        isLiveStream: false,
      },
      'replace',
      'top'
    );
  };

  const upNextVideos = useMemo(
    () =>
      filterVideos(videos, {
        monthKey: selectedQueueMonth,
        searchQuery: '',
        watchlistOnly: false,
      }),
    [videos, selectedQueueMonth]
  );

  const filteredGridVideos = useMemo(
    () =>
      filterVideos(videos, {
        monthKey: selectedVideoMonth,
        searchQuery: videoSearchQuery,
        topic: selectedTopicChip,
        watchlistOnly: false,
      }),
    [videos, selectedVideoMonth, videoSearchQuery, selectedTopicChip]
  );

  const liveStreamVideos = useMemo(
    () =>
      filterVideos(videos, {
        monthKey: selectedVideoMonth,
        searchQuery: videoSearchQuery,
      }).filter((v) => Boolean(v.is_stream) || /live|jashn/i.test(v.title)),
    [videos, selectedVideoMonth, videoSearchQuery]
  );

  const popularVideos = useMemo(
    () => getPopularVideos(videos, 8, config?.popular_video_ids),
    [videos, config?.popular_video_ids]
  );

  const availableYears = useMemo(() => {
    if (!config) return [];
    return Array.from(new Set(config.available_months.map((m) => m.yyyy))).sort((a, b) =>
      b.localeCompare(a)
    );
  }, [config]);

  const filteredPosts = useMemo(
    () =>
      filterPosts(posts, {
        monthKey: selectedPostMonth,
        searchQuery: videoSearchQuery,
      }),
    [posts, selectedPostMonth, videoSearchQuery]
  );

  const activeVideoSafe: VideoItem = activeVideo || {
    id: config?.latest_video_id || 'GOOvPNTUmtg',
    youtube_id: config?.latest_video_id || 'GOOvPNTUmtg',
    title:
      config?.latest_video_title ||
      'Live Jashne Syedus Sajideen as Kopaganj, Mau | 14 Jamadiul Awwal 1448H/2026',
    published: '2026-10-27T17:19:47Z',
    thumbnail: `https://img.youtube.com/vi/${config?.latest_video_id || 'GOOvPNTUmtg'}/hqdefault.jpg`,
    month_key: '2026-10',
    month_label: 'October 2026',
  };

  // Reusable Authentic YouTube Video Grid Card (Zero login actions, pure YouTube layout)
  const renderYouTubeVideoGrid = (items: VideoItem[], badgeOverride?: string) => {
    if (items.length === 0) {
      return (
        <div className="py-16 text-center">
          <p className="text-sm text-[#606060] dark:text-[#AAAAAA]">No videos found.</p>
          <button
            type="button"
            onClick={() => {
              setSelectedVideoMonth('all');
              setSelectedTopicChip('all');
              setVideoSearchQuery('');
              updateRouteFilters({ videoMonth: 'all', videoTopic: 'all', searchQuery: '' });
            }}
            className="mt-3 px-4 py-2 text-xs font-semibold rounded-full bg-[#272727] text-white hover:bg-[#3F3F3F] cursor-pointer"
          >
            Show All Videos
          </button>
        </div>
      );
    }

    const visibleItems = items.slice(0, visibleVideoCount);

    return (
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
          {visibleItems.map((video, idx) => {
            const vid = video.youtube_id || video.id;
            const meta = getYouTubeVideoMeta(vid, video.title);
            const relTime = formatYouTubeRelativeTime(video.published);
            const shortVideo = isShortVideo(video);
            const viewCountText = formatCompactViewCount(extractVideoViewCount(video));
            const timeLabel =
              video.is_stream || meta.wasStreamed ? `Streamed ${relTime}` : relTime;

            return (
              <div
                key={vid}
                onClick={() => handleSelectVideoItem(video)}
                className="group cursor-pointer flex flex-col"
              >
                {/* Thumbnail (9:16 centered framing for Shorts, 16:9 for Videos/Streams) */}
                <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black ring-1 ring-black/[0.06] dark:ring-white/[0.08] shadow-sm group-hover:shadow-xl group-hover:shadow-black/25 transition-all duration-200 flex items-center justify-center">
                  <ResilientThumbnail
                    src={video.thumbnail}
                    alt={video.title}
                    fallbackIndex={idx}
                    className={
                      shortVideo
                        ? 'h-full aspect-[9/16] object-cover'
                        : 'w-full h-full object-cover'
                    }
                  />

                  {/* Contrast Scrim & Hover Play Affordance */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-200" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <span className="w-11 h-11 rounded-full bg-black/75 backdrop-blur-md text-white ring-1 ring-white/25 shadow-xl flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                      <Play className="w-4 h-4 fill-white ml-0.5" />
                    </span>
                  </div>

                  {/* Bottom-Right Duration / Stream / Shorts Badge */}
                  <span
                    className={`absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md font-mono text-[11px] font-medium tracking-tight text-white leading-none shadow-sm ${
                      badgeOverride === 'LIVE' || shortVideo
                        ? 'bg-[#DC2626]'
                        : 'bg-black/80 backdrop-blur-xs'
                    }`}
                  >
                    {badgeOverride || (shortVideo ? 'SHORTS' : meta.durationBadge)}
                  </span>
                </div>

                {/* Card Info Row: ChannelAvatar Left + Balanced Title & Unboxed Metadata */}
                <div className="mt-3 flex items-start gap-3 pr-1">
                  <ChannelAvatar size="md" className="mt-0.5" />

                  <div className="min-w-0 flex-1">
                    <h3 className="font-sans text-[15px] font-semibold tracking-[-0.01em] text-[#0F0F12] dark:text-[#F3F3F6] group-hover:text-[#CC0000] dark:group-hover:text-[#FF5252] transition-colors line-clamp-2 leading-[21px]">
                      {video.title}
                    </h3>

                    <div className="mt-1.5 text-xs text-[#606068] dark:text-[#9A9AA6] leading-[18px]">
                      <p className="flex items-center gap-1 font-medium text-[#45454D] dark:text-[#C5C5CE]">
                        <span className="truncate">{config?.channel_name || 'Azadari Kopaganj'}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#606068] dark:text-[#8E8E9B]" />
                      </p>
                      <p className="mt-0.5 tabular-nums">
                        {viewCountText
                          ? `${viewCountText} · ${formatArchiveDate(video.published)} · ${timeLabel}`
                          : `${formatArchiveDate(video.published)} · ${timeLabel}`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {visibleVideoCount < items.length && (
          <div className="mt-9 text-center">
            <button
              type="button"
              onClick={() => setVisibleVideoCount((prev) => prev + 48)}
              className="px-6 py-2.5 rounded-full bg-white dark:bg-[#19191F] text-[#0F0F12] dark:text-[#F3F3F6] border border-black/[0.08] dark:border-white/[0.1] hover:bg-[#EFEFF2] dark:hover:bg-[#24242C] text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Show More Videos ({items.length - visibleVideoCount} remaining of {items.length})
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F7F8] dark:bg-[#0B0B0E] text-[#0F0F12] dark:text-[#F3F3F6]">
      <OfflineIndicator />

      {/* 1. FROSTED TOP MASTHEAD BAR (Logo, Search, Theme) */}
      <header className="sticky top-0 z-40 h-14 sm:h-[60px] bg-white/85 dark:bg-[#0B0B0E]/85 backdrop-blur-xl px-3 sm:px-6 flex items-center justify-between gap-3 sm:gap-6 border-b border-black/[0.07] dark:border-white/[0.08]">
        {/* Left: Official Azadari Kopaganj Brand Mark */}
        <button
          type="button"
          onClick={() => handleNavigateSection('home')}
          className="flex items-center gap-2.5 shrink-0 cursor-pointer group"
        >
          <span className="h-8 sm:h-9 px-1.5 py-0.5 rounded-xl bg-white ring-1 ring-black/[0.08] dark:ring-white/15 shadow-xs flex items-center justify-center shrink-0">
            <img
              src="./azadari-logo.png"
              alt="Azadari Kopaganj Logo"
              className="h-6 sm:h-7 w-auto object-contain"
            />
          </span>
          <span className="font-display font-bold text-sm sm:text-lg tracking-tight text-[#0F0F12] dark:text-[#F3F3F6] group-hover:text-[#CC0000] dark:group-hover:text-white transition-colors whitespace-nowrap">
            Azadari Kopaganj
          </span>
        </button>

        {/* Center: Elevated Search Bar */}
        <div className="flex-1 max-w-[540px] flex items-center min-w-0">
          <div className="flex items-center flex-1 min-w-0 rounded-full bg-[#EFEFF2] dark:bg-[#17171D] border border-black/[0.06] dark:border-white/[0.09] focus-within:bg-white dark:focus-within:bg-[#121216] focus-within:border-[#DC2626]/50 focus-within:ring-2 focus-within:ring-[#DC2626]/15 transition-all">
            <label htmlFor="yt-masthead-search" className="sr-only">
              Search
            </label>
            <input
              id="yt-masthead-search"
              type="search"
              value={videoSearchQuery}
              onChange={(e) => {
                const nextQuery = e.target.value;
                setVideoSearchQuery(nextQuery);
                if (
                  nextQuery.trim() &&
                  (watchingPlayerOpen || (activeSection !== 'videos' && activeSection !== 'posts'))
                ) {
                  setWatchingPlayerOpen(false);
                  setActiveSection('videos');
                  commitRoute(
                    {
                      ...currentRouteRef.current,
                      section: 'videos',
                      watching: false,
                      watchId: null,
                      isLiveStream: false,
                      searchQuery: nextQuery,
                    },
                    'push',
                    'top'
                  );
                } else {
                  updateRouteFilters({ searchQuery: nextQuery });
                }
              }}
              placeholder={isDesktop ? 'Search Majlis, Nauha, Jashn, Qaseeda...' : 'Search...'}
              className="w-full h-9 sm:h-10 pl-3.5 sm:pl-4 pr-2 text-xs sm:text-sm bg-transparent text-[#0F0F12] dark:text-[#F3F3F6] placeholder:text-[#767682] dark:placeholder:text-[#7E7E8B] focus:outline-none min-w-0"
            />
            {videoSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setVideoSearchQuery('');
                  updateRouteFilters({ searchQuery: '' });
                }}
                aria-label="Clear search"
                className="p-1.5 mr-0.5 rounded-full text-[#606068] dark:text-[#9A9AA6] hover:text-[#0F0F12] dark:hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const nextSection =
                  activeSection === 'posts' ? 'posts' : 'videos';
                setWatchingPlayerOpen(false);
                setActiveSection(nextSection);
                commitRoute(
                  {
                    ...currentRouteRef.current,
                    section: nextSection,
                    watching: false,
                    watchId: null,
                    isLiveStream: false,
                  },
                  watchingPlayerOpen || activeSection !== nextSection ? 'push' : 'replace',
                  'top'
                );
              }}
              aria-label="Search"
              className="h-9 sm:h-10 px-3.5 sm:px-4 rounded-r-full border-l border-black/[0.06] dark:border-white/[0.08] text-[#45454D] dark:text-[#D4D4DC] hover:text-[#0F0F12] dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05] flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Theme Toggle */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            aria-label="Toggle theme"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#EFEFF2] dark:bg-[#17171D] hover:bg-[#E4E4E9] dark:hover:bg-[#23232B] border border-black/[0.05] dark:border-white/[0.08] text-[#0F0F12] dark:text-[#F3F3F6] flex items-center justify-center transition-colors cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4 sm:w-[18px] sm:h-[18px]" /> : <Moon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />}
          </button>
        </div>
      </header>

      {/* 2. MAIN CONTENT STAGE (Navigated via Floating Section Navigation) */}
      <main
        className={`flex-1 min-w-0 ${
          watchingPlayerOpen ? 'pb-24 max-lg:[@media(min-height:540px)]:pb-0' : 'pb-24'
        }`}
      >
        {loading || !config ? (
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-20 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-[#DC2626] border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-sm text-[#606068] dark:text-[#9A9AA6]">Loading channel archive...</p>
          </div>
        ) : watchingPlayerOpen ? (
          /* FULL YOUTUBE WATCH VIEW (Opened when any video is clicked) */
          <TheatrePlayerSection
            config={config}
            live={live}
            activeVideo={activeVideoSafe}
            isPlayingLive={isPlayingLive}
            onSelectLiveStream={() => {
              desiredLiveRef.current = true;
              setIsPlayingLive(true);
              updateRouteFilters({ isLiveStream: true, watchId: null });
            }}
            upNextVideos={upNextVideos}
            onSelectVideo={handlePlayVideoById}
            selectedQueueMonth={selectedQueueMonth}
            onSelectQueueMonth={(month) => {
              setSelectedQueueMonth(month);
              updateRouteFilters({ queueMonth: month });
            }}
            onBack={handleBackFromWatch}
            backLabel={
              activeSection === 'posts'
                ? 'Back to Posts'
                : activeSection === 'videos'
                  ? 'Back to Videos'
                  : activeSection === 'live'
                    ? 'Back to Live'
                    : 'Back to Home'
            }
          />
        ) : (
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-5 sm:pt-7">

              {/* TAB 1: HOME (Active Live Player only when live + Recent Videos + Popular Videos) */}
              {activeSection === 'home' && (
                <div className="space-y-10">
                  {live.is_live && live.youtube_id && (
                    <div className="rounded-2xl bg-white dark:bg-[#141418] border border-[#DC2626]/30 p-3.5 sm:p-5 shadow-md grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                      <div className="lg:col-span-6 xl:col-span-5 relative aspect-video w-full rounded-xl overflow-hidden bg-black ring-1 ring-white/10 shadow-md">
                        <InbuiltVideoPlayer
                          key={live.youtube_id}
                          youtubeId={live.youtube_id}
                          title={live.title || 'Live Stream'}
                          isLive={true}
                          autoplay={false}
                          hasNext={liveStreamVideos.length > 0}
                          onNext={() => {
                            if (liveStreamVideos[0]) {
                              handleSelectVideoItem(liveStreamVideos[0]);
                            }
                          }}
                          onToggleTheater={() => handleOpenLiveWatch('home')}
                        />
                      </div>

                      <div className="lg:col-span-6 xl:col-span-7 space-y-2.5">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#DC2626] text-white text-[11px] font-bold uppercase tracking-wide">
                          <Radio className="w-3.5 h-3.5 animate-pulse" />
                          <span>Live Now</span>
                        </div>
                        <h2
                          onClick={() => handleOpenLiveWatch('home')}
                          className="font-display text-lg sm:text-2xl font-bold text-[#0F0F12] dark:text-[#F3F3F6] cursor-pointer hover:text-[#CC0000] dark:hover:text-[#FF5252] transition-colors leading-snug"
                        >
                          {live.title || activeVideoSafe.title}
                        </h2>
                        <p className="text-xs sm:text-sm text-[#606068] dark:text-[#9A9AA6]">
                          {config.channel_name} · Active Live Broadcast
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Recent Videos Shelf */}
                  <section aria-labelledby="recent-videos-heading">
                    <div className="flex items-end justify-between gap-4 mb-5">
                      <div>
                        <h2
                          id="recent-videos-heading"
                          className="font-display text-xl sm:text-[22px] font-bold tracking-tight text-[#0F0F12] dark:text-[#F3F3F6]"
                        >
                          Recent videos
                        </h2>
                        <p className="mt-0.5 text-xs text-[#606068] dark:text-[#9A9AA6]">
                          <span className="sm:hidden">Latest uploads &amp; broadcasts</span>
                          <span className="hidden sm:inline">Latest uploads and live broadcasts from {config.channel_name}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleNavigateSection('videos')}
                        className="px-3.5 py-1.5 rounded-full bg-white dark:bg-[#17171D] border border-black/[0.08] dark:border-white/[0.1] hover:bg-[#EFEFF2] dark:hover:bg-[#23232B] text-xs font-semibold text-[#0F0F12] dark:text-[#F3F3F6] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                      >
                        <span className="tabular-nums">View all ({videos.length})</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {renderYouTubeVideoGrid(videos.slice(0, 8))}
                  </section>

                  {/* Popular Videos Shelf */}
                  {popularVideos.length > 0 && (
                    <section
                      aria-labelledby="popular-videos-heading"
                      className="pt-8 border-t border-black/[0.07] dark:border-white/[0.08]"
                    >
                      <div className="flex items-end justify-between gap-4 mb-5">
                        <div>
                          <h2
                            id="popular-videos-heading"
                            className="font-display text-xl sm:text-[22px] font-bold tracking-tight text-[#0F0F12] dark:text-[#F3F3F6]"
                          >
                            Popular videos
                          </h2>
                          <p className="mt-0.5 text-xs text-[#606068] dark:text-[#9A9AA6]">
                            Most-watched full Majlis, Nauha, and Jashn recordings
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleNavigateSection('videos')}
                          className="px-3.5 py-1.5 rounded-full bg-white dark:bg-[#17171D] border border-black/[0.08] dark:border-white/[0.1] hover:bg-[#EFEFF2] dark:hover:bg-[#23232B] text-xs font-semibold text-[#0F0F12] dark:text-[#F3F3F6] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                        >
                          <span>Explore archive</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {renderYouTubeVideoGrid(popularVideos)}
                    </section>
                  )}
                </div>
              )}

              {/* TAB 2: LIVE (Active Live Stream from assets/livenow.json + Past Live Streams) */}
              {activeSection === 'live' && (
                <div className="space-y-6">
                  {live.is_live && live.youtube_id && (
                    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#141418] border border-[#DC2626]/35 shadow-lg space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#DC2626]">
                        <Radio className="w-4 h-4 animate-pulse" />
                        <span>Live Now on Azadari Kopaganj</span>
                      </div>
                      <div className="aspect-video w-full max-w-3xl rounded-xl overflow-hidden bg-black ring-1 ring-white/10">
                        <InbuiltVideoPlayer
                          key={live.youtube_id}
                          youtubeId={live.youtube_id}
                          title={live.title || 'Live Stream'}
                          isLive={true}
                          autoplay={false}
                          hasNext={liveStreamVideos.length > 0}
                          onNext={() => {
                            if (liveStreamVideos[0]) {
                              handleSelectVideoItem(liveStreamVideos[0]);
                            }
                          }}
                          onToggleTheater={() => handleOpenLiveWatch('live')}
                        />
                      </div>
                      <h2 className="font-display text-lg sm:text-xl font-bold text-[#0F0F12] dark:text-white">
                        {live.title}
                      </h2>
                    </div>
                  )}

                  {renderYouTubeVideoGrid(liveStreamVideos)}
                </div>
              )}

              {/* TAB 3: VIDEOS (Year, Month & Topic Filter Chips + Full 4-Column Video Grid) */}
              {activeSection === 'videos' && (
                <div>
                  <div className="pb-5 flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
                      {(
                        [
                          { id: 'all', label: `All (${videos.length})` },
                          { id: 'jashn', label: 'Jashn' },
                          { id: 'majlis', label: 'Majlis' },
                          { id: 'nauha', label: 'Nauha' },
                          { id: 'qaseeda', label: 'Qaseeda' },
                        ] as const
                      ).map((chip) => {
                        const active =
                          selectedTopicChip === chip.id && selectedVideoMonth === 'all';
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => {
                              const nextTopic: VideoTopicFilter =
                                active && chip.id !== 'all' ? 'all' : chip.id;
                              setSelectedTopicChip(nextTopic);
                              setSelectedVideoMonth('all');
                              setVisibleVideoCount(48);
                              updateRouteFilters({ videoTopic: nextTopic, videoMonth: 'all' });
                            }}
                            className={`px-3.5 py-1.5 text-xs sm:text-[13px] font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              active
                                ? 'bg-[#0F0F12] text-white dark:bg-white dark:text-[#0F0F12] font-semibold shadow-xs'
                                : 'bg-white dark:bg-[#17171D] text-[#45454D] dark:text-[#D4D4DC] border border-black/[0.07] dark:border-white/[0.08] hover:bg-[#EFEFF2] dark:hover:bg-[#23232B]'
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}

                      {availableYears.map((yyyy) => {
                        const active = selectedVideoMonth === yyyy;
                        return (
                          <button
                            key={yyyy}
                            type="button"
                            onClick={() => {
                              const nextMonth = active ? 'all' : yyyy;
                              setSelectedVideoMonth(nextMonth);
                              setSelectedTopicChip('all');
                              setVisibleVideoCount(48);
                              updateRouteFilters({ videoMonth: nextMonth, videoTopic: 'all' });
                            }}
                            className={`px-3.5 py-1.5 text-xs sm:text-[13px] font-medium rounded-full transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                              active
                                ? 'bg-[#0F0F12] text-white dark:bg-white dark:text-[#0F0F12] font-semibold shadow-xs'
                                : 'bg-white dark:bg-[#17171D] text-[#45454D] dark:text-[#D4D4DC] border border-black/[0.07] dark:border-white/[0.08] hover:bg-[#EFEFF2] dark:hover:bg-[#23232B]'
                            }`}
                          >
                            {yyyy}
                          </button>
                        );
                      })}
                    </div>

                    <select
                      aria-label="Filter videos by month"
                      value={selectedVideoMonth.length === 7 ? selectedVideoMonth : 'all'}
                      onChange={(e) => {
                        const nextMonth = e.target.value;
                        setSelectedVideoMonth(nextMonth);
                        setSelectedTopicChip('all');
                        setVisibleVideoCount(48);
                        updateRouteFilters({ videoMonth: nextMonth, videoTopic: 'all' });
                      }}
                      className="h-8.5 px-3.5 text-xs font-medium rounded-full bg-white dark:bg-[#17171D] text-[#0F0F12] dark:text-[#F3F3F6] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none cursor-pointer"
                    >
                      <option value="all">
                        Filter by Month ({config.available_months.length} months)...
                      </option>
                      {config.available_months.map((m) => {
                        const key = `${m.yyyy}-${m.mm.padStart(2, '0')}`;
                        return (
                          <option key={key} value={key}>
                            {m.month_year} ({m.video_count})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {renderYouTubeVideoGrid(filteredGridVideos)}
                </div>
              )}

              {/* TAB 4: POSTS (Read-Only YouTube Community Posts from assets/YYYY/MM/post.json) */}
              {activeSection === 'posts' && (
                <CommunitySection
                  posts={filteredPosts}
                  availableMonths={config.available_months}
                  selectedMonthKey={selectedPostMonth}
                  onSelectMonthKey={(monthKey) => {
                    setSelectedPostMonth(monthKey);
                    updateRouteFilters({ postMonth: monthKey });
                  }}
                  onPlayLinkedVideo={handlePlayVideoById}
                />
              )}
            </div>
          )}
      </main>

      {/* FLOATING SECTION NAVIGATION DOCK (Only Home, Live, Videos, Posts) */}
      <nav
        aria-label="Floating Section Navigation"
        className="fixed bottom-3.5 sm:bottom-5 left-1/2 -translate-x-1/2 z-40 p-1.5 rounded-full bg-white/90 dark:bg-[#16161B]/90 backdrop-blur-xl border border-black/[0.08] dark:border-white/[0.12] shadow-[0_14px_40px_rgba(0,0,0,0.3)] flex items-center gap-1"
      >
        {(
          [
            { id: 'home', label: 'Home', icon: Home },
            { id: 'live', label: 'Live', icon: Radio },
            { id: 'videos', label: 'Videos', icon: Film },
            { id: 'posts', label: 'Posts', icon: MessageSquare },
          ] as const
        ).map((item) => {
          const IconComponent = item.icon;
          const isActive = activeSection === item.id && !watchingPlayerOpen;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigateSection(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#0F0F12] text-white dark:bg-white dark:text-[#0F0F12] font-semibold shadow-sm'
                  : 'text-[#606068] dark:text-[#9A9AA6] hover:text-[#0F0F12] dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07]'
              }`}
            >
              <IconComponent
                className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#FF3B3B] dark:text-[#DC2626]' : ''}`}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* APK Startup Notification Permission Prompt (only shown in Android APK if notifications are disabled) */}
      {notificationPromptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="apk-notif-prompt-title"
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#16161B] border border-black/[0.08] dark:border-white/[0.12] p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#DC2626]/12 text-[#DC2626] dark:text-[#FF5252] flex items-center justify-center shrink-0">
                <BellRing className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="apk-notif-prompt-title"
                  className="font-display text-base font-bold text-[#0F0F12] dark:text-[#F3F3F6]"
                >
                  Allow Notifications
                </h2>
                <p className="mt-1 text-xs sm:text-[13px] text-[#606068] dark:text-[#9A9AA6] leading-relaxed">
                  Notifications are currently turned off. Allow notifications to receive instant alerts when Azadari Kopaganj goes Live or adds new videos and community posts.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNotificationPromptOpen(false)}
                className="px-4 py-2 rounded-full text-xs font-semibold text-[#606068] dark:text-[#9A9AA6] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={async () => {
                  const granted = await promptToAllowNativeNotifications();
                  if (granted) {
                    setNotificationPromptOpen(false);
                  }
                }}
                className="px-4 py-2 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                Allow Notifications
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
