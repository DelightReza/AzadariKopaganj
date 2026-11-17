import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Maximize2,
  Play,
  Share2,
} from 'lucide-react';
import type {
  AvailableMonth,
  CommunityPost,
} from '../types/archive';
import {
  extractYouTubeId,
  formatArchiveDate,
  formatYouTubeRelativeTime,
  getPostImages,
} from '../utils/archiveLogic';
import { ChannelAvatar, ResilientThumbnail } from './ResilientThumbnail';
import { PostImageLightbox } from './PostImageLightbox';

interface CommunitySectionProps {
  posts: CommunityPost[];
  availableMonths: AvailableMonth[];
  selectedMonthKey: string;
  onSelectMonthKey: (key: string) => void;
  onPlayLinkedVideo: (youtubeId: string) => void;
}

interface LightboxState {
  images: string[];
  initialIndex: number;
  title: string;
  date: string;
}

interface PostImageCardMediaProps {
  images: string[];
  title: string;
  fallbackIndex: number;
  onOpenFull: (index: number) => void;
}

const PostImageCardMedia: React.FC<PostImageCardMediaProps> = ({
  images,
  title,
  fallbackIndex,
  onOpenFull,
}) => {
  const [slideIndex, setSlideIndex] = useState<number>(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeBlockedClickRef = useRef<boolean>(false);

  const total = images.length;
  const activeIdx = Math.max(0, Math.min(slideIndex, total - 1));
  const activeSrc = images[activeIdx];

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSlideIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSlideIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`View full image for ${title}${total > 1 ? ` (${activeIdx + 1} of ${total})` : ''}`}
      onClick={() => {
        if (swipeBlockedClickRef.current) return;
        onOpenFull(activeIdx);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenFull(activeIdx);
        } else if (e.key === 'ArrowLeft' && total > 1) {
          e.preventDefault();
          setSlideIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
        } else if (e.key === 'ArrowRight' && total > 1) {
          e.preventDefault();
          setSlideIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
        }
      }}
      onTouchStart={(e) => {
        if (e.touches.length === 1 && total > 1) {
          touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
          };
        }
      }}
      onTouchEnd={(e) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start || total <= 1) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          swipeBlockedClickRef.current = true;
          window.setTimeout(() => {
            swipeBlockedClickRef.current = false;
          }, 120);
          if (dx < 0) {
            setSlideIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
          } else {
            setSlideIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
          }
        }
      }}
      className="mt-4 relative w-full rounded-xl overflow-hidden bg-[#121216] ring-1 ring-black/[0.08] dark:ring-white/[0.08] cursor-zoom-in group focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
    >
      <div className="w-full flex items-center justify-center bg-[#0C0C0F]">
        <ResilientThumbnail
          key={activeSrc}
          src={activeSrc}
          alt={total > 1 ? `${title} (${activeIdx + 1} of ${total})` : title}
          fallbackIndex={fallbackIndex}
          fit="natural"
          className="w-full bg-[#0C0C0F]"
        />
      </div>

      {/* Subtle Bottom Gradient on Hover/Multi-Image */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 to-transparent opacity-60 group-hover:opacity-90 transition-opacity" />

      {/* Top-Right Counter & Fullscreen Hint */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
        {total > 1 && (
          <span className="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-white font-mono text-[11px] font-semibold tabular-nums ring-1 ring-white/15 shadow-sm">
            {activeIdx + 1} / {total}
          </span>
        )}
        <span
          aria-hidden="true"
          className="w-8 h-8 rounded-full bg-black/70 backdrop-blur-md text-white ring-1 ring-white/15 flex items-center justify-center opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all shadow-sm"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </span>
      </div>

      {/* Inline Carousel Arrows (Multiple Images) */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous post image"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 text-white ring-1 ring-white/20 flex items-center justify-center shadow-lg transition-all sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next post image"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 text-white ring-1 ring-white/20 flex items-center justify-center shadow-lg transition-all sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Pagination Dots */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-md"
          >
            {images.map((_, dotIdx) => (
              <button
                key={dotIdx}
                type="button"
                aria-label={`Show image ${dotIdx + 1} of ${total}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSlideIndex(dotIdx);
                }}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  dotIdx === activeIdx
                    ? 'w-4 bg-white'
                    : 'w-1.5 bg-white/45 hover:bg-white/75'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const CommunitySection: React.FC<CommunitySectionProps> = ({
  posts,
  availableMonths,
  selectedMonthKey,
  onSelectMonthKey,
  onPlayLinkedVideo,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(25);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const postYears = useMemo(() => {
    const years = new Set<string>();
    for (const m of availableMonths) {
      if (Number(m.yyyy) >= 2022) {
        years.add(m.yyyy);
      }
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [availableMonths]);

  const handleCopyPostLink = async (post: CommunityPost) => {
    const shareUrl = post.link_url || window.location.href;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedId(post.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(post.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const visiblePosts = posts.slice(0, visibleCount);

  return (
    <section id="community" aria-label="YouTube Community Posts" className="py-2">
      <div className="max-w-[760px] mx-auto">
        {/* Year & Month Filter Bar */}
        <div
          role="group"
          aria-label="Filter community posts by year or month"
          className="flex flex-wrap items-center justify-between gap-2.5 pb-5"
        >
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => {
                onSelectMonthKey('all');
                setVisibleCount(25);
              }}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
                selectedMonthKey === 'all'
                  ? 'bg-[#0F0F12] text-white dark:bg-white dark:text-[#0F0F12] font-semibold shadow-xs'
                  : 'bg-white dark:bg-[#17171D] text-[#45454D] dark:text-[#D4D4DC] border border-black/[0.07] dark:border-white/[0.08] hover:bg-[#EFEFF2] dark:hover:bg-[#23232B]'
              }`}
            >
              All Posts ({posts.length})
            </button>

            {postYears.map((yyyy) => {
              const active = selectedMonthKey === yyyy;
              return (
                <button
                  key={yyyy}
                  type="button"
                  onClick={() => {
                    onSelectMonthKey(yyyy);
                    setVisibleCount(25);
                  }}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 tabular-nums cursor-pointer ${
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
            aria-label="Filter community posts by month"
            value={selectedMonthKey.length === 7 ? selectedMonthKey : 'all'}
            onChange={(e) => {
              onSelectMonthKey(e.target.value);
              setVisibleCount(25);
            }}
            className="h-8.5 px-3.5 text-xs font-medium rounded-full bg-white dark:bg-[#17171D] text-[#0F0F12] dark:text-[#F3F3F6] border border-black/[0.08] dark:border-white/[0.1] focus:outline-none cursor-pointer"
          >
            <option value="all">Filter by Month...</option>
            {availableMonths.map((m) => {
              const key = `${m.yyyy}-${m.mm.padStart(2, '0')}`;
              return (
                <option key={key} value={key}>
                  {m.month_year}
                </option>
              );
            })}
          </select>
        </div>

        {/* Single-Column Community Feed Cards */}
        <div className="space-y-5">
          {visiblePosts.map((post, idx) => {
            const linkedYtId = extractYouTubeId(post.link_url || post.image_url || '');
            const postImages = getPostImages(post);
            const isVideoThumbnail = Boolean(
              linkedYtId &&
                postImages.length === 1 &&
                /img\.youtube\.com\/vi\//i.test(postImages[0])
            );
            const isCopied = copiedId === post.id;

            return (
              <article
                key={post.id}
                className="bg-white dark:bg-[#141418] border border-black/[0.07] dark:border-white/[0.08] rounded-2xl p-4 sm:p-6 shadow-xs"
              >
                {/* Channel Author Header */}
                <div className="flex items-center gap-3">
                  <ChannelAvatar size="md" />
                  <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm">
                    <span className="font-bold text-[#0F0F12] dark:text-[#F3F3F6]">
                      Azadari Kopaganj
                    </span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#606068] dark:text-[#9A9AA6]" />
                    <span className="text-xs text-[#606068] dark:text-[#9A9AA6] tabular-nums">
                      · {formatYouTubeRelativeTime(post.date)} · {formatArchiveDate(post.date)}
                    </span>
                  </div>
                </div>

                {/* Post Body Text */}
                <div className="mt-3.5 space-y-1.5">
                  <h3 className="font-display text-base sm:text-lg font-bold text-[#0F0F12] dark:text-[#F3F3F6] leading-snug">
                    {post.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#45454D] dark:text-[#C5C5CE] leading-relaxed whitespace-pre-line">
                    {post.text}
                  </p>
                </div>

                {/* Attached Media: Video Preview OR Full-Open / Multi-Image Swipeable Viewer */}
                {postImages.length > 0 &&
                  (isVideoThumbnail && linkedYtId ? (
                    <div
                      onClick={() => onPlayLinkedVideo(linkedYtId)}
                      className="mt-4 relative aspect-video w-full rounded-xl overflow-hidden bg-black ring-1 ring-black/[0.08] dark:ring-white/[0.08] cursor-pointer group"
                    >
                      <ResilientThumbnail
                        src={postImages[0]}
                        alt={post.title}
                        fallbackIndex={idx}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                        <span className="w-12 h-12 rounded-full bg-black/80 backdrop-blur-md text-white ring-1 ring-white/25 flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform">
                          <Play className="w-5 h-5 fill-white ml-0.5" />
                        </span>
                      </div>
                    </div>
                  ) : (
                    <PostImageCardMedia
                      images={postImages}
                      title={post.title}
                      fallbackIndex={idx}
                      onOpenFull={(index) =>
                        setLightbox({
                          images: postImages,
                          initialIndex: index,
                          title: post.title,
                          date: post.date,
                        })
                      }
                    />
                  ))}

                {/* Action Footer */}
                <div className="mt-4 pt-3 border-t border-black/[0.05] dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyPostLink(post)}
                      className="px-3.5 py-1.5 rounded-full bg-[#EFEFF2] dark:bg-[#1C1C23] text-[#0F0F12] dark:text-[#F3F3F6] hover:bg-[#E4E4E9] dark:hover:bg-[#262630] font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Share</span>
                        </>
                      )}
                    </button>

                    {post.link_url && (
                      <a
                        href={post.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-1.5 rounded-full bg-[#EFEFF2] dark:bg-[#1C1C23] text-[#0F0F12] dark:text-[#F3F3F6] hover:bg-[#E4E4E9] dark:hover:bg-[#262630] font-medium inline-flex items-center gap-1.5 transition-colors"
                      >
                        <span>Open Link</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {linkedYtId && (
                    <button
                      type="button"
                      onClick={() => onPlayLinkedVideo(linkedYtId)}
                      className="px-4 py-1.5 rounded-full bg-[#DC2626] text-white hover:bg-[#B91C1C] font-semibold inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      <span>Watch Video</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {visibleCount < posts.length && (
          <div className="mt-7 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 25)}
              className="px-6 py-2.5 rounded-full bg-white dark:bg-[#19191F] text-[#0F0F12] dark:text-[#F3F3F6] border border-black/[0.08] dark:border-white/[0.1] hover:bg-[#EFEFF2] dark:hover:bg-[#24242C] text-xs sm:text-sm font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Show More Posts ({posts.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>

      {lightbox && (
        <PostImageLightbox
          isOpen={true}
          images={lightbox.images}
          initialIndex={lightbox.initialIndex}
          title={lightbox.title}
          date={lightbox.date}
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  );
};
