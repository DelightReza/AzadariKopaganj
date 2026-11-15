import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  ExternalLink,
  Maximize2,
  Minimize2,
  Radio,
  RefreshCw,
  Share2,
} from 'lucide-react';
import type { AppConfig, LiveNowState, VideoItem } from '../types/archive';
import {
  formatArchiveDate,
  formatYouTubeRelativeTime,
  getYouTubeVideoMeta,
} from '../utils/archiveLogic';
import { ChannelAvatar, ResilientThumbnail } from './ResilientThumbnail';

interface TheatrePlayerSectionProps {
  config: AppConfig;
  live: LiveNowState;
  activeVideo: VideoItem;
  upNextVideos: VideoItem[];
  onSelectVideo: (youtubeId: string) => void;
  selectedQueueMonth: string;
  onSelectQueueMonth: (monthKey: string) => void;
  isPlayingLive: boolean;
  onSelectLiveStream: () => void;
  alertsEnabled: boolean;
  onToggleAlerts: () => void;
  onRefreshFeed: () => void;
  isRefreshing: boolean;
}

export const TheatrePlayerSection: React.FC<TheatrePlayerSectionProps> = ({
  config,
  live,
  activeVideo,
  upNextVideos,
  onSelectVideo,
  selectedQueueMonth,
  onSelectQueueMonth,
  isPlayingLive,
  onSelectLiveStream,
  alertsEnabled,
  onToggleAlerts,
  onRefreshFeed,
  isRefreshing,
}) => {
  const [theaterWide, setTheaterWide] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [descExpanded, setDescExpanded] = useState<boolean>(false);

  const currentVideoId =
    isPlayingLive && live.youtube_id
      ? live.youtube_id
      : activeVideo.youtube_id || activeVideo.id || config.latest_video_id;

  const currentTitle =
    isPlayingLive && live.title ? live.title : activeVideo.title || config.latest_video_title;

  const watchUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${currentVideoId}?rel=0&modestbranding=1`;

  const relativeTime = formatYouTubeRelativeTime(activeVideo.published);

  const handleCopyWatchUrl = async () => {
    try {
      await navigator.clipboard.writeText(watchUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <section id="watch" aria-labelledby="watch-heading" className="pb-10">
      {/* Active Live Broadcast Banner */}
      {live.is_live && (
        <div
          role="region"
          aria-label="Active Live Stream"
          className="bg-[#CC0000] text-white px-4 sm:px-6 py-2"
        >
          <div className="max-w-[1650px] mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
              <Radio className="w-4 h-4 shrink-0 animate-pulse" />
              <span>LIVE NOW:</span>
              <span className="font-semibold">{live.title || 'Live Majlis Stream'}</span>
            </div>
            <button
              type="button"
              onClick={onSelectLiveStream}
              className="px-3 py-1 text-xs font-semibold bg-white text-[#CC0000] rounded-full hover:bg-neutral-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isPlayingLive ? 'Watching Live' : 'Watch Live Stream'}
            </button>
          </div>
        </div>
      )}

      {/* YouTube 2-Column Watch Layout (Zero login-required actions) */}
      <div className="max-w-[1650px] mx-auto px-3 sm:px-6 pt-3">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Primary Watch Column */}
          <div className={theaterWide ? 'w-full' : 'w-full lg:flex-1 min-w-0'}>
            {/* 16:9 YouTube Video Player */}
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black shadow-lg">
              <iframe
                key={currentVideoId}
                src={embedUrl}
                title={`YouTube video player: ${currentTitle}`}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>

            {/* YouTube Video Title */}
            <h1
              id="watch-heading"
              className="mt-3 text-lg sm:text-[20px] font-bold text-[#0F0F0F] dark:text-[#F1F1F1] leading-snug"
            >
              {currentTitle}
            </h1>

            {/* Channel Owner & Zero-Login Action Row */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              {/* Left: Channel Avatar + Name + Native Alerts Toggle */}
              <div className="flex items-center gap-3">
                <a href={config.channel_url} target="_blank" rel="noopener noreferrer">
                  <ChannelAvatar size="md" />
                </a>
                <div className="mr-2">
                  <div className="flex items-center gap-1">
                    <a
                      href={config.channel_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[15px] font-bold text-[#0F0F0F] dark:text-[#F1F1F1] hover:underline leading-tight"
                    >
                      {config.channel_name}
                    </a>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#AAAAAA] shrink-0" />
                  </div>
                  <span className="text-xs text-[#606060] dark:text-[#AAAAAA] block">
                    @AzadariKopaganj
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onToggleAlerts}
                  className={`h-9 px-4 text-xs sm:text-sm font-semibold rounded-full inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    alertsEnabled
                      ? 'bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F]'
                      : 'bg-[#0F0F0F] dark:bg-[#F1F1F1] text-white dark:text-[#0F0F0F] hover:opacity-90'
                  }`}
                >
                  {alertsEnabled ? (
                    <>
                      <BellRing className="w-4 h-4 text-[#FF0000]" />
                      <span>Alerts On</span>
                    </>
                  ) : (
                    <>
                      <Bell className="w-4 h-4" />
                      <span>Notify Me</span>
                    </>
                  )}
                </button>
              </div>

              {/* Right: Share + Open on YouTube + Refresh + Theater Mode */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyWatchUrl}
                  className="h-9 px-3.5 text-xs sm:text-sm font-medium rounded-full bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span>Copied Link</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      <span>Share</span>
                    </>
                  )}
                </button>

                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-3.5 text-xs sm:text-sm font-medium rounded-full bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>YouTube</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={onRefreshFeed}
                  disabled={isRefreshing}
                  className="h-9 px-3.5 text-xs sm:text-sm font-medium rounded-full bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheaterWide((prev) => !prev)}
                  aria-label="Toggle Theater Mode"
                  className="hidden lg:inline-flex w-9 h-9 rounded-full bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F] items-center justify-center transition-colors cursor-pointer"
                >
                  {theaterWide ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* YouTube Gray Rounded Description Box */}
            <div
              onClick={() => setDescExpanded((prev) => !prev)}
              className="mt-3 p-3.5 rounded-xl bg-[#F2F2F2] dark:bg-[#272727] hover:bg-neutral-200/80 dark:hover:bg-[#3F3F3F]/80 transition-colors text-xs sm:text-sm text-[#0F0F0F] dark:text-[#F1F1F1] cursor-pointer"
            >
              <div className="flex flex-wrap items-center gap-2 font-bold">
                <span>Published {formatArchiveDate(activeVideo.published)}</span>
                <span>•</span>
                <span>{relativeTime}</span>
                <span className="text-[#3EA6FF] font-medium">
                  #AzadariKopaganj #KopaganjMau #Majlis #Jashn
                </span>
              </div>

              <p className="mt-1.5 leading-relaxed text-[#303030] dark:text-[#E1E1E1]">
                Official broadcast from <strong>Azadari Kopaganj</strong> (Kopaganj, Mau). Enable notifications to receive alerts whenever a new video, live Majlis, or community post is published.
              </p>

              {descExpanded && (
                <div className="mt-3 pt-3 border-t border-neutral-300 dark:border-[#3F3F3F] space-y-1 text-xs text-[#606060] dark:text-[#AAAAAA]">
                  <p>Channel: {config.channel_name}</p>
                  <p>Video ID: {currentVideoId}</p>
                  <p>Direct Watch Link: {watchUrl}</p>
                </div>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDescExpanded((prev) => !prev);
                }}
                className="mt-1.5 font-bold text-[#0F0F0F] dark:text-[#F1F1F1] cursor-pointer"
              >
                {descExpanded ? 'Show less' : '...more'}
              </button>
            </div>
          </div>

          {/* Right Column: YouTube "Up Next" Sidebar (402px wide on desktop) */}
          <aside
            aria-label="Up Next Video Queue"
            className={theaterWide ? 'w-full' : 'w-full lg:w-[402px] shrink-0'}
          >
            {/* Year Filter Chips */}
            <div
              role="group"
              aria-label="Filter queue by year"
              className="flex items-center gap-2 overflow-x-auto pb-3 no-scrollbar"
            >
              <button
                type="button"
                onClick={() => onSelectQueueMonth('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedQueueMonth === 'all'
                    ? 'bg-[#0F0F0F] text-white dark:bg-[#F1F1F1] dark:text-[#0F0F0F]'
                    : 'bg-[#F2F2F2] text-[#0F0F0F] dark:bg-[#272727] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F]'
                }`}
              >
                All ({upNextVideos.length})
              </button>
              {Array.from(new Set(config.available_months.map((m) => m.yyyy)))
                .sort((a, b) => b.localeCompare(a))
                .map((yyyy) => (
                  <button
                    key={yyyy}
                    type="button"
                    onClick={() => onSelectQueueMonth(yyyy)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedQueueMonth === yyyy
                        ? 'bg-[#0F0F0F] text-white dark:bg-[#F1F1F1] dark:text-[#0F0F0F]'
                        : 'bg-[#F2F2F2] text-[#0F0F0F] dark:bg-[#272727] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F]'
                    }`}
                  >
                    {yyyy}
                  </button>
                ))}
            </div>

            {/* Compact YouTube Up Next Video Cards (168x94 thumbnail + right metadata) */}
            <div className="space-y-2">
              {upNextVideos.slice(0, 60).map((vidItem, idx) => {
                const vid = vidItem.youtube_id || vidItem.id;
                const isCurrent = !isPlayingLive && vid === currentVideoId;
                const itemMeta = getYouTubeVideoMeta(vid, vidItem.title);
                const itemRelTime = formatYouTubeRelativeTime(vidItem.published);

                return (
                  <div
                    key={vid}
                    onClick={() => onSelectVideo(vid)}
                    className={`group flex gap-2.5 rounded-xl p-1 transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-[#F2F2F2] dark:bg-[#212121] ring-1 ring-[#FF0000]/40'
                        : 'hover:bg-neutral-100 dark:hover:bg-[#1F1F1F]'
                    }`}
                  >
                    {/* 168x94 Thumbnail */}
                    <div className="relative w-40 sm:w-[168px] aspect-video rounded-lg overflow-hidden bg-black shrink-0">
                      <ResilientThumbnail
                        src={vidItem.thumbnail}
                        alt={vidItem.title}
                        fallbackIndex={idx}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/85 text-[11px] font-medium text-white leading-none">
                        {isCurrent ? 'Playing' : itemMeta.durationBadge}
                      </span>
                    </div>

                    {/* Right Metadata */}
                    <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                      <div>
                        <h3 className="text-xs sm:text-[14px] font-medium text-[#0F0F0F] dark:text-[#F1F1F1] line-clamp-2 leading-[19px]">
                          {vidItem.title}
                        </h3>
                        <p className="mt-1 text-xs text-[#606060] dark:text-[#AAAAAA] flex items-center gap-1">
                          <span className="truncate">{config.channel_name}</span>
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                        </p>
                        <p className="text-xs text-[#606060] dark:text-[#AAAAAA]">
                          {formatArchiveDate(vidItem.published)} • {itemRelTime}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
};
