import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ExternalLink,
  Maximize2,
  Minimize2,
  Radio,
  Share2,
} from 'lucide-react';
import type { AppConfig, LiveNowState, VideoItem } from '../types/archive';
import {
  formatArchiveDate,
  formatYouTubeRelativeTime,
  getYouTubeVideoMeta,
  isShortVideo,
} from '../utils/archiveLogic';
import { ChannelAvatar, ResilientThumbnail } from './ResilientThumbnail';
import { InbuiltVideoPlayer } from './InbuiltVideoPlayer';

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
  onBack?: () => void;
  backLabel?: string;
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
  onBack,
  backLabel = 'Back',
}) => {
  const [theaterWide, setTheaterWide] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const mobileScrollRef = useRef<HTMLDivElement | null>(null);

  const currentVideoId =
    isPlayingLive && live.youtube_id
      ? live.youtube_id
      : activeVideo.youtube_id || activeVideo.id || config.latest_video_id;

  const currentTitle =
    isPlayingLive && live.title ? live.title : activeVideo.title || config.latest_video_title;

  const activeIsShort = !isPlayingLive && isShortVideo(activeVideo);
  const pinMobileTheatre = !activeIsShort && !theaterWide;

  useEffect(() => {
    mobileScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentVideoId]);

  const watchUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;

  const currentIdx = upNextVideos.findIndex(
    (item) => (item.youtube_id || item.id) === currentVideoId
  );
  const previousVideo = currentIdx > 0 ? upNextVideos[currentIdx - 1] : null;
  const nextVideo =
    currentIdx >= 0 && currentIdx + 1 < upNextVideos.length
      ? upNextVideos[currentIdx + 1]
      : upNextVideos.find((item) => (item.youtube_id || item.id) !== currentVideoId) || null;

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

  const videoDetailsContent = (
    <>
      {/* Video Title */}
      <h1
        id="watch-heading"
        className="font-display text-lg sm:text-[22px] font-bold tracking-tight text-[#0F0F12] dark:text-[#F3F3F6] leading-snug"
      >
        {currentTitle}
      </h1>

      {/* Channel Owner & Action Row */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Channel Avatar + Name */}
        <div className="flex items-center gap-3">
          <a href={config.channel_url} target="_blank" rel="noopener noreferrer">
            <ChannelAvatar size="md" />
          </a>
          <div className="mr-2">
            <div className="flex items-center gap-1.5">
              <a
                href={config.channel_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[15px] font-bold text-[#0F0F12] dark:text-[#F3F3F6] hover:underline leading-tight"
              >
                {config.channel_name}
              </a>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#606068] dark:text-[#9A9AA6] shrink-0" />
            </div>
            <span className="text-xs text-[#606068] dark:text-[#9A9AA6] block">
              @AzadariKopaganj
            </span>
          </div>
        </div>

        {/* Right: Share + YouTube + Theater Mode */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyWatchUrl}
            className="h-9 px-3.5 text-xs sm:text-sm font-medium rounded-full bg-white dark:bg-[#17171D] text-[#0F0F12] dark:text-[#F3F3F6] border border-black/[0.08] dark:border-white/[0.1] hover:bg-[#EFEFF2] dark:hover:bg-[#23232B] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
            className="h-9 px-3.5 text-xs sm:text-sm font-medium rounded-full bg-white dark:bg-[#17171D] text-[#0F0F12] dark:text-[#F3F3F6] border border-black/[0.08] dark:border-white/[0.1] hover:bg-[#EFEFF2] dark:hover:bg-[#23232B] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <span>YouTube</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            type="button"
            onClick={() => setTheaterWide((prev) => !prev)}
            aria-label="Toggle Theater Mode"
            className="hidden lg:inline-flex w-9 h-9 rounded-full bg-white dark:bg-[#17171D] text-[#0F0F12] dark:text-[#F3F3F6] border border-black/[0.08] dark:border-white/[0.1] hover:bg-[#EFEFF2] dark:hover:bg-[#23232B] items-center justify-center transition-colors cursor-pointer"
          >
            {theaterWide ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Published Date Bar */}
      <div className="mt-3.5 px-4 py-2.5 rounded-xl bg-white dark:bg-[#141418] border border-black/[0.07] dark:border-white/[0.08] inline-flex flex-wrap items-center gap-2 text-xs sm:text-sm font-medium text-[#0F0F12] dark:text-[#F3F3F6] tabular-nums">
        <span>Published {formatArchiveDate(activeVideo.published)}</span>
        <span aria-hidden="true" className="text-[#606068] dark:text-[#9A9AA6]">
          ·
        </span>
        <span className="text-[#606068] dark:text-[#9A9AA6]">{relativeTime}</span>
      </div>
    </>
  );

  return (
    <section
      id="watch"
      aria-labelledby="watch-heading"
      className={
        pinMobileTheatre
          ? 'max-lg:[@media(min-height:540px)]:h-[calc(100dvh-3.5rem)] max-lg:[@media(min-height:540px)]:sm:h-[calc(100dvh-60px)] max-lg:[@media(min-height:540px)]:flex max-lg:[@media(min-height:540px)]:flex-col max-lg:[@media(min-height:540px)]:overflow-hidden pb-24 max-lg:[@media(min-height:540px)]:pb-0'
          : 'pb-24'
      }
    >
      {/* Active Live Broadcast Banner */}
      {live.is_live && (
        <div
          role="region"
          aria-label="Active Live Stream"
          className="shrink-0 bg-[#CC0000] text-white px-4 sm:px-6 py-2"
        >
          <div className="max-w-[1650px] mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium min-w-0">
              <Radio className="w-4 h-4 shrink-0 animate-pulse" />
              <span className="shrink-0">LIVE NOW:</span>
              <span className="font-semibold truncate">{live.title || 'Live Majlis Stream'}</span>
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

      {/* Watch Layout */}
      <div
        className={`max-w-[1600px] w-full mx-auto px-3 sm:px-6 pt-2.5 sm:pt-4 ${
          pinMobileTheatre
            ? 'max-lg:[@media(min-height:540px)]:flex-1 max-lg:[@media(min-height:540px)]:min-h-0 max-lg:[@media(min-height:540px)]:flex max-lg:[@media(min-height:540px)]:flex-col'
            : ''
        }`}
      >
        {onBack && (
          <div className="shrink-0 mb-2 flex items-center">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-[#17171D] text-[#0F0F12] dark:text-[#F3F3F6] border border-black/[0.08] dark:border-white/[0.1] hover:bg-[#EFEFF2] dark:hover:bg-[#23232B] text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{backLabel}</span>
            </button>
          </div>
        )}

        <div
          className={
            theaterWide
              ? 'flex flex-col gap-5'
              : `flex flex-col lg:flex-row lg:gap-6 items-start ${
                  pinMobileTheatre
                    ? 'max-lg:[@media(min-height:540px)]:flex-1 max-lg:[@media(min-height:540px)]:min-h-0'
                    : 'gap-5'
                }`
          }
        >
          {/* Pinned Watch Column: Player pinned at top on mobile (<lg) and sticky on desktop (lg:) */}
          <div
            className={
              theaterWide
                ? 'w-full'
                : `w-full lg:flex-1 min-w-0 lg:sticky lg:top-[76px] ${
                    pinMobileTheatre
                      ? 'max-lg:[@media(min-height:540px)]:shrink-0 max-lg:[@media(min-height:540px)]:pb-2.5 max-lg:[@media(min-height:540px)]:border-b max-lg:[@media(min-height:540px)]:border-black/[0.06] max-lg:[@media(min-height:540px)]:dark:border-white/[0.08]'
                      : ''
                  }`
            }
          >
            {/* Custom Inbuilt Video Player (9:16 for Shorts, 16:9 for Videos/Live) */}
            <div
              className={`relative w-full rounded-2xl overflow-hidden bg-black ring-1 ring-black/10 dark:ring-white/10 shadow-2xl ${
                activeIsShort ? 'py-2 flex items-center justify-center' : 'aspect-video'
              }`}
            >
              <InbuiltVideoPlayer
                key={currentVideoId}
                youtubeId={currentVideoId}
                title={currentTitle}
                thumbnailUrl={activeVideo.thumbnail}
                isLive={isPlayingLive}
                isShort={activeIsShort}
                autoplay={true}
                hasPrevious={Boolean(previousVideo) && !isPlayingLive}
                onPrevious={() => {
                  if (previousVideo) {
                    onSelectVideo(previousVideo.youtube_id || previousVideo.id);
                  }
                }}
                hasNext={Boolean(nextVideo) && !isPlayingLive}
                onNext={() => {
                  if (nextVideo) {
                    onSelectVideo(nextVideo.youtube_id || nextVideo.id);
                  }
                }}
                onEnded={() => {
                  if (!isPlayingLive && nextVideo) {
                    onSelectVideo(nextVideo.youtube_id || nextVideo.id);
                  }
                }}
                theaterWide={theaterWide}
                onToggleTheater={() => setTheaterWide((prev) => !prev)}
              />
            </div>

            {/* Desktop Video Metadata (stays with sticky player on desktop !theaterWide) */}
            <div className={theaterWide ? 'mt-4' : 'hidden lg:block mt-4'}>
              {videoDetailsContent}
            </div>
          </div>

          {/* Below-Player Scrollable Zone (Mobile) / Right Column Up Next Sidebar (Desktop) */}
          <div
            ref={mobileScrollRef}
            className={
              theaterWide
                ? 'w-full space-y-5'
                : `w-full lg:w-[400px] shrink-0 space-y-4 ${
                    pinMobileTheatre
                      ? 'max-lg:[@media(min-height:540px)]:flex-1 max-lg:[@media(min-height:540px)]:min-h-0 max-lg:[@media(min-height:540px)]:overflow-y-auto max-lg:[@media(min-height:540px)]:overscroll-contain max-lg:[@media(min-height:540px)]:pt-3 max-lg:[@media(min-height:540px)]:pb-24 max-lg:[@media(max-height:539px)]:mt-4'
                      : 'mt-4 lg:mt-0'
                  }`
            }
          >
            {/* Mobile Video Details (scrolls smoothly beneath the pinned theater player) */}
            {!theaterWide && (
              <div className="lg:hidden">{videoDetailsContent}</div>
            )}

            <aside
              aria-label="Up Next Video Queue"
              className="w-full rounded-2xl bg-white dark:bg-[#141418] border border-black/[0.07] dark:border-white/[0.08] p-3"
            >
              {/* Year Filter Chips */}
              <div
                role="group"
                aria-label="Filter queue by year"
                className="flex items-center gap-1.5 overflow-x-auto pb-3 no-scrollbar"
              >
                <button
                  type="button"
                  onClick={() => onSelectQueueMonth('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                    selectedQueueMonth === 'all'
                      ? 'bg-[#0F0F12] text-white dark:bg-white dark:text-[#0F0F12] font-semibold'
                      : 'bg-[#EFEFF2] text-[#45454D] dark:bg-[#1C1C23] dark:text-[#D4D4DC] hover:bg-[#E4E4E9] dark:hover:bg-[#262630]'
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
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                        selectedQueueMonth === yyyy
                          ? 'bg-[#0F0F12] text-white dark:bg-white dark:text-[#0F0F12] font-semibold'
                          : 'bg-[#EFEFF2] text-[#45454D] dark:bg-[#1C1C23] dark:text-[#D4D4DC] hover:bg-[#E4E4E9] dark:hover:bg-[#262630]'
                      }`}
                    >
                      {yyyy}
                    </button>
                  ))}
              </div>

              {/* Compact Up Next Video Cards */}
              <div className="space-y-2">
                {upNextVideos.slice(0, 60).map((vidItem, idx) => {
                  const vid = vidItem.youtube_id || vidItem.id;
                  const isCurrent = !isPlayingLive && vid === currentVideoId;
                  const itemMeta = getYouTubeVideoMeta(vid, vidItem.title);
                  const itemRelTime = formatYouTubeRelativeTime(vidItem.published);
                  const vidShort = isShortVideo(vidItem);

                  return (
                    <div
                      key={vid}
                      onClick={() => onSelectVideo(vid)}
                      className={`group flex gap-2.5 rounded-xl p-1.5 transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-[#EFEFF2] dark:bg-[#1D1D24] ring-1 ring-[#DC2626]/50'
                          : 'hover:bg-[#F5F5F7] dark:hover:bg-[#1B1B22]'
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className="relative w-36 sm:w-[160px] aspect-video rounded-xl overflow-hidden bg-black shrink-0 flex items-center justify-center">
                        <ResilientThumbnail
                          src={vidItem.thumbnail}
                          alt={vidItem.title}
                          fallbackIndex={idx}
                          className={
                            vidShort
                              ? 'h-full aspect-[9/16] object-cover'
                              : 'w-full h-full object-cover'
                          }
                        />
                        <span
                          className={`absolute bottom-1 right-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-medium text-white leading-none ${
                            isCurrent || vidShort ? 'bg-[#DC2626]' : 'bg-black/80'
                          }`}
                        >
                          {isCurrent ? 'Playing' : vidShort ? 'SHORTS' : itemMeta.durationBadge}
                        </span>
                      </div>

                      {/* Right Metadata */}
                      <div className="min-w-0 flex-1 flex flex-col justify-center py-0.5">
                        <h3 className="text-xs sm:text-[13.5px] font-semibold text-[#0F0F12] dark:text-[#F3F3F6] group-hover:text-[#CC0000] dark:group-hover:text-[#FF5252] transition-colors line-clamp-2 leading-[18px]">
                          {vidItem.title}
                        </h3>
                        <p className="mt-1 text-[11px] text-[#606068] dark:text-[#9A9AA6] flex items-center gap-1">
                          <span className="truncate">{config.channel_name}</span>
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                        </p>
                        <p className="text-[11px] text-[#606068] dark:text-[#9A9AA6] tabular-nums">
                          {formatArchiveDate(vidItem.published)} · {itemRelTime}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
};
