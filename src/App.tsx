/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCircle2,
  Film,
  Home,
  MessageSquare,
  Moon,
  Radio,
  Search,
  Sun,
  X,
} from 'lucide-react';
import type {
  AppConfig,
  CommunityPost,
  FeedNotificationItem,
  FeedSnapshot,
  LiveNowState,
  VideoItem,
} from './types/archive';
import {
  detectFeedUpdates,
  filterPosts,
  filterVideos,
  formatArchiveDate,
  formatYouTubeRelativeTime,
  getYouTubeVideoMeta,
  type VideoTopicFilter,
} from './utils/archiveLogic';
import {
  loadFullArchiveBundle,
  requestNativeNotificationPermission,
  sendBrowserNotification,
} from './services/archiveService';
import { TheatrePlayerSection } from './components/TheatrePlayerSection';
import { CommunitySection } from './components/CommunitySection';
import { InbuiltVideoPlayer } from './components/InbuiltVideoPlayer';
import { OfflineIndicator } from './components/OfflineIndicator';
import {
  ChannelAvatar,
  ResilientThumbnail,
} from './components/ResilientThumbnail';

const SNAPSHOT_STORAGE_KEY = 'azadari_kopaganj_feed_snapshot_v1';
const ALERTS_ENABLED_KEY = 'azadari_kopaganj_alerts_enabled_v1';
const THEME_STORAGE_KEY = 'azadari_kopaganj_youtube_theme_v1';

export type YouTubeSectionTab = 'home' | 'live' | 'videos' | 'posts';

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
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [live, setLive] = useState<LiveNowState>({ is_live: false, title: '', youtube_id: '' });
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Only the 4 core YouTube sections: Home, Live, Videos, Posts
  const [activeSection, setActiveSection] = useState<YouTubeSectionTab>('home');
  // When a user clicks a video card, open the full 2-column YouTube Watch view
  const [watchingPlayerOpen, setWatchingPlayerOpen] = useState<boolean>(false);

  // YouTube Dark Mode default (#0F0F0F)
  const [darkMode, setDarkMode] = useState<boolean>(() =>
    loadStoredJson<boolean>(THEME_STORAGE_KEY, true)
  );

  // Active player state
  const [activeVideo, setActiveVideo] = useState<VideoItem | null>(null);
  const [isPlayingLive, setIsPlayingLive] = useState<boolean>(false);

  // Queue & Video Grid filters
  const [selectedQueueMonth, setSelectedQueueMonth] = useState<string>('all');
  const [selectedVideoMonth, setSelectedVideoMonth] = useState<string>('all');
  const [selectedTopicChip, setSelectedTopicChip] = useState<VideoTopicFilter>('all');
  const [videoSearchQuery, setVideoSearchQuery] = useState<string>('');
  const [visibleVideoCount, setVisibleVideoCount] = useState<number>(48);

  // Community filters
  const [selectedPostMonth, setSelectedPostMonth] = useState<string>('all');

  // Persisted notification preference (Zero login required)
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(() =>
    loadStoredJson<boolean>(ALERTS_ENABLED_KEY, false)
  );

  // Notification drawer & feed alerts
  const [alertsDrawerOpen, setAlertsDrawerOpen] = useState<boolean>(false);
  const [feedAlerts, setFeedAlerts] = useState<FeedNotificationItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const snapshotRef = useRef<FeedSnapshot | null>(
    loadStoredJson<FeedSnapshot | null>(SNAPSHOT_STORAGE_KEY, null)
  );

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

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const processFeedDiffAndNotify = useCallback(
    (
      nextLive: LiveNowState,
      nextVideos: VideoItem[],
      nextPosts: CommunityPost[],
      latestId: string,
      latestTitle: string,
      forceNotify = false
    ) => {
      const { notifications, nextSnapshot } = detectFeedUpdates(snapshotRef.current, {
        live: nextLive,
        videos: nextVideos,
        posts: nextPosts,
        latestVideoId: latestId,
        latestVideoTitle: latestTitle,
      });

      snapshotRef.current = nextSnapshot;
      try {
        localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(nextSnapshot));
      } catch {
        // ignore storage quota errors
      }

      if (notifications.length > 0) {
        setFeedAlerts((prev) => [...notifications, ...prev].slice(0, 20));
        if (alertsEnabled || forceNotify) {
          notifications.forEach((alert) => {
            sendBrowserNotification(alert.title, alert.body);
          });
          showToast(notifications[0].title);
        }
      }
    },
    [alertsEnabled, showToast]
  );

  const fetchArchive = useCallback(
    async (notifyOnDiff = false) => {
      try {
        const loaded = await loadFullArchiveBundle('./');
        setConfig(loaded.config);
        setLive(loaded.live);
        setVideos(loaded.videos);
        setPosts(loaded.posts);

        setActiveVideo((prev) => {
          if (prev) return prev;
          const matchLatest = loaded.videos.find(
            (v) => (v.youtube_id || v.id) === loaded.config.latest_video_id
          );
          return matchLatest || loaded.videos[0] || null;
        });

        if (loaded.live.is_live && loaded.live.youtube_id) {
          setIsPlayingLive(true);
        }

        processFeedDiffAndNotify(
          loaded.live,
          loaded.videos,
          loaded.posts,
          loaded.config.latest_video_id,
          loaded.config.latest_video_title,
          notifyOnDiff
        );
      } catch (err) {
        console.error('Error loading Azadari Kopaganj archive:', err);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [processFeedDiffAndNotify]
  );

  useEffect(() => {
    fetchArchive(false);
  }, [fetchArchive]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchArchive(true);
    }, 90_000);
    return () => clearInterval(interval);
  }, [fetchArchive]);

  const handleTriggerRssSync = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/sync-rss', { method: 'POST' });
      if (res.ok) {
        showToast('Refreshed latest videos from Azadari Kopaganj feed.');
      }
    } catch {
      // static host fallback
    }
    await fetchArchive(true);
  };

  const handleToggleAlerts = async () => {
    if (!alertsEnabled) {
      const perm = await requestNativeNotificationPermission();
      setAlertsEnabled(true);
      try {
        localStorage.setItem(ALERTS_ENABLED_KEY, JSON.stringify(true));
      } catch {
        // ignore
      }
      if (perm === 'granted') {
        sendBrowserNotification(
          'Azadari Kopaganj Notifications Enabled',
          'You will receive native alerts for new video uploads, live streams, and posts.'
        );
        showToast('Notifications enabled for new uploads and live streams.');
      } else {
        showToast('In-app feed notifications enabled.');
      }
    } else {
      setAlertsDrawerOpen((prev) => !prev);
    }
  };

  const handlePlayVideoById = (youtubeId: string) => {
    const found = videos.find((v) => (v.youtube_id || v.id) === youtubeId);
    if (found) {
      setActiveVideo(found);
    } else {
      setActiveVideo({
        id: youtubeId,
        youtube_id: youtubeId,
        title: `Azadari Kopaganj Broadcast (${youtubeId})`,
        published: new Date().toISOString(),
        thumbnail: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
      });
    }
    setIsPlayingLive(false);
    setWatchingPlayerOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectVideoItem = (video: VideoItem) => {
    setActiveVideo(video);
    setIsPlayingLive(false);
    setWatchingPlayerOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateSection = (section: YouTubeSectionTab) => {
    setActiveSection(section);
    setWatchingPlayerOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
          {visibleItems.map((video, idx) => {
            const vid = video.youtube_id || video.id;
            const meta = getYouTubeVideoMeta(vid, video.title);
            const relTime = formatYouTubeRelativeTime(video.published);

            return (
              <div
                key={vid}
                onClick={() => handleSelectVideoItem(video)}
                className="group cursor-pointer flex flex-col"
              >
                {/* 16:9 Rounded YouTube Thumbnail */}
                <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-[#181818]">
                  <ResilientThumbnail
                    src={video.thumbnail}
                    alt={video.title}
                    fallbackIndex={idx}
                    className="w-full h-full object-cover"
                  />

                  {/* Bottom-Right Duration / Stream Badge */}
                  <span
                    className={`absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-xs font-medium text-white leading-none ${
                      badgeOverride === 'LIVE' ? 'bg-[#CC0000]' : 'bg-black/85'
                    }`}
                  >
                    {badgeOverride || meta.durationBadge}
                  </span>
                </div>

                {/* YouTube Card Info Row: ChannelAvatar Left + Title & Channel/Date Middle */}
                <div className="mt-3 flex items-start gap-3 pr-1">
                  <ChannelAvatar size="md" className="mt-0.5" />

                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-medium text-[#0F0F0F] dark:text-[#F1F1F1] line-clamp-2 leading-[21px]">
                      {video.title}
                    </h3>

                    <div className="mt-1 text-xs sm:text-[13px] text-[#606060] dark:text-[#AAAAAA] leading-[18px]">
                      <p className="flex items-center gap-1 hover:text-[#0F0F0F] dark:hover:text-[#F1F1F1]">
                        <span>{config?.channel_name || 'Azadari Kopaganj'}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      </p>
                      <p>
                        {formatArchiveDate(video.published)} •{' '}
                        {video.is_stream || meta.wasStreamed ? `Streamed ${relTime}` : relTime}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {visibleVideoCount < items.length && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setVisibleVideoCount((prev) => prev + 48)}
              className="px-6 py-2.5 rounded-full bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F] text-xs sm:text-sm font-semibold cursor-pointer"
            >
              Show More Videos ({items.length - visibleVideoCount} remaining of {items.length})
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#0F0F0F] text-[#0F0F0F] dark:text-[#F1F1F1]">
      <OfflineIndicator />

      {/* 1. YOUTUBE TOP MASTHEAD BAR (Logo, Search, Theme, Notification Bell) */}
      <header className="sticky top-0 z-40 h-14 bg-white dark:bg-[#0F0F0F] px-3 sm:px-4 flex items-center justify-between gap-2 border-b border-neutral-200 dark:border-[#272727]">
        {/* Left: Official Azadari Kopaganj Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleNavigateSection('home')}
            className="flex items-center gap-2 cursor-pointer"
          >
            <span className="h-8 px-1.5 py-0.5 rounded-lg bg-white ring-1 ring-neutral-200 dark:ring-white/15 flex items-center justify-center shrink-0">
              <img
                src="./azadari-logo.png"
                alt="Azadari Kopaganj Logo"
                className="h-6 w-auto object-contain"
              />
            </span>
            <span className="font-display font-bold text-sm sm:text-lg tracking-tight text-[#0F0F0F] dark:text-[#F1F1F1] whitespace-nowrap">
              Azadari Kopaganj
            </span>
            <span className="hidden sm:inline-block text-[10px] font-medium text-[#606060] dark:text-[#AAAAAA] self-start mt-0.5">
              IN
            </span>
          </button>
        </div>

        {/* Center: YouTube Search Pill Bar */}
        <div className="flex-1 max-w-[560px] mx-1 sm:mx-2 flex items-center min-w-0">
          <div className="flex items-center flex-1 min-w-0">
            <div className="relative flex-1 min-w-0">
              <label htmlFor="yt-masthead-search" className="sr-only">
                Search
              </label>
              <input
                id="yt-masthead-search"
                type="search"
                value={videoSearchQuery}
                onChange={(e) => {
                  setVideoSearchQuery(e.target.value);
                  if (watchingPlayerOpen && e.target.value.trim()) {
                    setWatchingPlayerOpen(false);
                    setActiveSection('videos');
                  }
                }}
                placeholder="Search..."
                className="w-full h-9 sm:h-10 pl-3 sm:pl-4 pr-2 sm:pr-3 text-xs sm:text-sm rounded-l-full border border-neutral-300 dark:border-[#303030] bg-white dark:bg-[#121212] text-[#0F0F0F] dark:text-[#F1F1F1] focus:outline-none focus:border-[#1C62B9]"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setWatchingPlayerOpen(false);
                if (activeSection !== 'videos' && activeSection !== 'posts') {
                  setActiveSection('videos');
                }
              }}
              aria-label="Search"
              className="h-9 sm:h-10 px-3 sm:px-5 rounded-r-full border border-l-0 border-neutral-300 dark:border-[#303030] bg-[#F8F8F8] dark:bg-[#222222] hover:bg-neutral-200 dark:hover:bg-[#303030] text-[#0F0F0F] dark:text-[#F1F1F1] flex items-center justify-center cursor-pointer shrink-0"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Theme Toggle & Notification Bell */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            aria-label="Toggle theme"
            className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] cursor-pointer"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={handleToggleAlerts}
            aria-label="Notifications"
            className="relative p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] cursor-pointer"
          >
            {alertsEnabled ? (
              <BellRing className="w-5 h-5 text-[#FF0000]" />
            ) : (
              <Bell className="w-5 h-5" />
            )}
            {feedAlerts.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#FF0000]" />
            )}
          </button>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-5 z-50 max-w-sm bg-[#212121] text-white px-4 py-2.5 rounded-lg shadow-2xl border border-[#3F3F3F] flex items-center gap-3 text-xs"
        >
          <span className="flex-1">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss notification"
            className="text-neutral-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Alerts History Popover */}
      {alertsDrawerOpen && (
        <div
          role="dialog"
          aria-label="Channel notifications"
          className="fixed top-14 right-4 z-50 w-80 sm:w-96 bg-white dark:bg-[#282828] border border-neutral-200 dark:border-[#3F3F3F] rounded-xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-[#3F3F3F]">
            <h2 className="text-sm font-medium">Notifications</h2>
            <button
              type="button"
              onClick={() => setAlertsDrawerOpen(false)}
              aria-label="Close notifications"
              className="p-1 text-[#606060] dark:text-[#AAAAAA] hover:text-[#0F0F0F] dark:hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 max-h-72 overflow-y-auto space-y-2">
            {feedAlerts.length === 0 ? (
              <p className="text-xs text-[#606060] dark:text-[#AAAAAA] py-6 text-center">
                Notifications are enabled. You will be alerted when Azadari Kopaganj uploads a new video, goes live, or posts a notice.
              </p>
            ) : (
              feedAlerts.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-[#3F3F3F] text-xs"
                >
                  <p className="font-medium text-[#0F0F0F] dark:text-[#F1F1F1]">{item.title}</p>
                  <p className="text-[#606060] dark:text-[#AAAAAA] mt-0.5">{item.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 2. MAIN CONTENT STAGE (Navigated via Floating Section Navigation) */}
      <main className="flex-1 min-w-0 pb-24">
        {loading || !config ? (
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-16 text-center">
            <div className="w-8 h-8 rounded-full border-2 border-[#FF0000] border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-sm text-[#606060] dark:text-[#AAAAAA]">Loading YouTube feed...</p>
          </div>
        ) : watchingPlayerOpen ? (
          /* FULL YOUTUBE WATCH VIEW (Opened when any video is clicked) */
          <TheatrePlayerSection
            config={config}
            live={live}
            activeVideo={activeVideoSafe}
            isPlayingLive={isPlayingLive}
            onSelectLiveStream={() => setIsPlayingLive(true)}
            upNextVideos={upNextVideos}
            onSelectVideo={handlePlayVideoById}
            selectedQueueMonth={selectedQueueMonth}
            onSelectQueueMonth={setSelectedQueueMonth}
            alertsEnabled={alertsEnabled}
            onToggleAlerts={handleToggleAlerts}
            onRefreshFeed={handleTriggerRssSync}
            isRefreshing={isRefreshing}
          />
        ) : (
          <div className="max-w-[1380px] mx-auto px-3 sm:px-6 pt-4 sm:pt-6">

              {/* TAB 1: HOME (Featured Video Player + Recent Uploads Grid) */}
              {activeSection === 'home' && (
                <div className="space-y-8">
                  {/* Featured / Latest Broadcast Player */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start pb-6 border-b border-neutral-200 dark:border-[#272727]">
                    <div className="lg:col-span-6 xl:col-span-5 relative aspect-video w-full rounded-xl overflow-hidden bg-black shadow-md">
                      {(() => {
                        const homeIdx = videos.findIndex(
                          (v) => (v.youtube_id || v.id) === (activeVideoSafe.youtube_id || activeVideoSafe.id)
                        );
                        const homePrev = homeIdx > 0 ? videos[homeIdx - 1] : null;
                        const homeNext =
                          homeIdx >= 0 && homeIdx < videos.length - 1
                            ? videos[homeIdx + 1]
                            : videos[0] || null;
                        return (
                          <InbuiltVideoPlayer
                            key={activeVideoSafe.youtube_id || activeVideoSafe.id}
                            youtubeId={activeVideoSafe.youtube_id || activeVideoSafe.id}
                            title={activeVideoSafe.title}
                            thumbnailUrl={activeVideoSafe.thumbnail}
                            isLive={Boolean(
                              live.is_live &&
                                live.youtube_id === (activeVideoSafe.youtube_id || activeVideoSafe.id)
                            )}
                            autoplay={false}
                            hasPrevious={Boolean(homePrev)}
                            onPrevious={() => {
                              if (homePrev) setActiveVideo(homePrev);
                            }}
                            hasNext={Boolean(homeNext)}
                            onNext={() => {
                              if (homeNext) setActiveVideo(homeNext);
                            }}
                            onEnded={() => {
                              if (homeNext) setActiveVideo(homeNext);
                            }}
                            onToggleTheater={() => handleSelectVideoItem(activeVideoSafe)}
                          />
                        );
                      })()}
                    </div>

                    <div className="lg:col-span-6 xl:col-span-7 space-y-2.5">
                      <h2
                        onClick={() => handleSelectVideoItem(activeVideoSafe)}
                        className="text-lg sm:text-xl font-bold text-[#0F0F0F] dark:text-[#F1F1F1] cursor-pointer hover:underline leading-snug"
                      >
                        {activeVideoSafe.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-[#606060] dark:text-[#AAAAAA]">
                        {config.channel_name} • {formatArchiveDate(activeVideoSafe.published)} •{' '}
                        {formatYouTubeRelativeTime(activeVideoSafe.published)}
                      </p>
                      <p className="text-xs sm:text-sm text-[#303030] dark:text-[#CCCCCC] leading-relaxed max-w-2xl">
                        Official latest Majlis and Jashn broadcast from Azadari Kopaganj (Kopaganj, Mau). Click the title or any video card to open the watch view with the Up Next queue.
                      </p>
                    </div>
                  </div>

                  {/* Videos Shelf on Home */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold text-[#0F0F0F] dark:text-[#F1F1F1]">
                        Videos
                      </h2>
                      <button
                        type="button"
                        onClick={() => handleNavigateSection('videos')}
                        className="text-xs font-semibold text-[#3EA6FF] hover:underline cursor-pointer"
                      >
                        View all ({videos.length})
                      </button>
                    </div>
                    {renderYouTubeVideoGrid(videos.slice(0, 8))}
                  </div>
                </div>
              )}

              {/* TAB 2: LIVE (Active Live Stream from assets/livenow.json + Past Live Streams) */}
              {activeSection === 'live' && (
                <div className="space-y-6">
                  {live.is_live && live.youtube_id ? (
                    <div className="p-4 rounded-2xl bg-[#181818] border border-[#CC0000]/50 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase text-[#FF0000]">
                        <Radio className="w-4 h-4 animate-pulse" />
                        <span>Live Now on Azadari Kopaganj</span>
                      </div>
                      <div className="aspect-video w-full max-w-3xl rounded-xl overflow-hidden bg-black">
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
                          onToggleTheater={() => {
                            setIsPlayingLive(true);
                            setWatchingPlayerOpen(true);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        />
                      </div>
                      <h2 className="text-lg font-bold text-white">{live.title}</h2>
                    </div>
                  ) : (
                    <div className="px-4 py-3 rounded-xl bg-[#F2F2F2] dark:bg-[#181818] flex items-center justify-between gap-3 text-xs sm:text-sm">
                      <div className="flex items-center gap-2.5 text-[#606060] dark:text-[#AAAAAA]">
                        <Radio className="w-4 h-4 text-[#FF0000] shrink-0" />
                        <span>
                          No active live broadcast right now. Showing past live streams from Azadari Kopaganj.
                        </span>
                      </div>
                      <a
                        href={config.live_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-[#3EA6FF] hover:underline whitespace-nowrap shrink-0"
                      >
                        YouTube /live →
                      </a>
                    </div>
                  )}

                  {renderYouTubeVideoGrid(liveStreamVideos)}
                </div>
              )}

              {/* TAB 3: VIDEOS (Year, Month & Topic Filter Chips + Full 4-Column Video Grid) */}
              {activeSection === 'videos' && (
                <div>
                  <div className="pb-4 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
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
                              if (active && chip.id !== 'all') {
                                setSelectedTopicChip('all');
                              } else {
                                setSelectedTopicChip(chip.id);
                              }
                              setSelectedVideoMonth('all');
                              setVisibleVideoCount(48);
                            }}
                            className={`px-3 py-1.5 text-xs sm:text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              active
                                ? 'bg-[#0F0F0F] text-white dark:bg-[#F1F1F1] dark:text-[#0F0F0F]'
                                : 'bg-[#F2F2F2] text-[#0F0F0F] dark:bg-[#272727] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F]'
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
                              if (active) {
                                setSelectedVideoMonth('all');
                              } else {
                                setSelectedVideoMonth(yyyy);
                              }
                              setSelectedTopicChip('all');
                              setVisibleVideoCount(48);
                            }}
                            className={`px-3 py-1.5 text-xs sm:text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              active
                                ? 'bg-[#0F0F0F] text-white dark:bg-[#F1F1F1] dark:text-[#0F0F0F]'
                                : 'bg-[#F2F2F2] text-[#0F0F0F] dark:bg-[#272727] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F]'
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
                        setSelectedVideoMonth(e.target.value);
                        setSelectedTopicChip('all');
                        setVisibleVideoCount(48);
                      }}
                      className="h-8 px-2.5 text-xs font-medium rounded-lg bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] border border-neutral-300 dark:border-[#3F3F3F] focus:outline-none cursor-pointer"
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
                  onSelectMonthKey={setSelectedPostMonth}
                  onPlayLinkedVideo={handlePlayVideoById}
                />
              )}
            </div>
          )}
      </main>

      {/* FLOATING SECTION NAVIGATION DOCK (Only Home, Live, Videos, Posts) */}
      <nav
        aria-label="Floating Section Navigation"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 px-2 py-1.5 rounded-full bg-white/95 dark:bg-[#212121]/95 backdrop-blur-lg border border-neutral-300 dark:border-[#3F3F3F] shadow-2xl flex items-center gap-1"
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
              className={`px-4 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#0F0F0F] text-white dark:bg-[#F1F1F1] dark:text-[#0F0F0F] font-semibold'
                  : 'text-[#606060] dark:text-[#AAAAAA] hover:text-[#0F0F0F] dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#3F3F3F]'
              }`}
            >
              <IconComponent className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
