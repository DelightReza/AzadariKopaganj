import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ExternalLink,
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
} from '../utils/archiveLogic';
import { ChannelAvatar, ResilientThumbnail } from './ResilientThumbnail';

interface CommunitySectionProps {
  posts: CommunityPost[];
  availableMonths: AvailableMonth[];
  selectedMonthKey: string;
  onSelectMonthKey: (key: string) => void;
  onPlayLinkedVideo: (youtubeId: string) => void;
}

export const CommunitySection: React.FC<CommunitySectionProps> = ({
  posts,
  availableMonths,
  selectedMonthKey,
  onSelectMonthKey,
  onPlayLinkedVideo,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(25);

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
    <section id="community" aria-label="YouTube Community Posts" className="py-4">
      <div className="max-w-[740px] mx-auto px-3 sm:px-6">
        {/* YouTube Year & Month Filter Bar */}
        <div
          role="group"
          aria-label="Filter community posts by year or month"
          className="flex flex-wrap items-center justify-between gap-2 pb-4"
        >
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => {
                onSelectMonthKey('all');
                setVisibleCount(25);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedMonthKey === 'all'
                  ? 'bg-[#0F0F0F] text-white dark:bg-[#F1F1F1] dark:text-[#0F0F0F]'
                  : 'bg-[#F2F2F2] text-[#0F0F0F] dark:bg-[#272727] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F]'
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
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
            aria-label="Filter community posts by month"
            value={selectedMonthKey.length === 7 ? selectedMonthKey : 'all'}
            onChange={(e) => {
              onSelectMonthKey(e.target.value);
              setVisibleCount(25);
            }}
            className="h-8 px-2.5 text-xs font-medium rounded-lg bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] border border-neutral-300 dark:border-[#3F3F3F] focus:outline-none cursor-pointer"
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

        {/* Single-Column YouTube Community Feed Cards (Read-Only from GitHub post.json, Zero Login Required) */}
        <div className="space-y-4">
          {visiblePosts.map((post, idx) => {
            const linkedYtId = extractYouTubeId(post.link_url || post.image_url || '');
            const isCopied = copiedId === post.id;

            return (
              <article
                key={post.id}
                className="bg-white dark:bg-[#181818] border border-neutral-200 dark:border-[#272727] rounded-2xl p-4 sm:p-5"
              >
                {/* Channel Author Header */}
                <div className="flex items-center gap-3">
                  <ChannelAvatar size="md" />
                  <div>
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                      <span className="font-bold text-[#0F0F0F] dark:text-[#F1F1F1]">
                        Azadari Kopaganj
                      </span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#AAAAAA]" />
                      <span className="text-[#606060] dark:text-[#AAAAAA]">
                        • {formatYouTubeRelativeTime(post.date)} ({formatArchiveDate(post.date)})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Post Body Text */}
                <div className="mt-3 space-y-1.5">
                  <h3 className="text-sm sm:text-base font-bold text-[#0F0F0F] dark:text-[#F1F1F1]">
                    {post.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#303030] dark:text-[#E1E1E1] leading-relaxed whitespace-pre-line">
                    {post.text}
                  </p>
                </div>

                {/* Attached 16:9 Media / Video Preview Card */}
                {post.image_url && (
                  <div
                    onClick={() => {
                      if (linkedYtId) onPlayLinkedVideo(linkedYtId);
                    }}
                    className={`mt-3 relative aspect-video w-full rounded-xl overflow-hidden bg-black border border-neutral-200 dark:border-[#272727] ${
                      linkedYtId ? 'cursor-pointer group' : ''
                    }`}
                  >
                    <ResilientThumbnail
                      src={post.image_url}
                      alt={post.title}
                      fallbackIndex={idx}
                      className="w-full h-full object-cover"
                    />
                    {linkedYtId && (
                      <div className="absolute inset-0 bg-black/15 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="w-12 h-12 rounded-full bg-black/80 text-white flex items-center justify-center shadow-lg">
                          <Play className="w-5 h-5 fill-white ml-0.5" />
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Zero-Login Action Footer: Share Link & Watch Video */}
                <div className="mt-3.5 pt-2 flex items-center justify-between text-xs text-[#606060] dark:text-[#AAAAAA]">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleCopyPostLink(post)}
                      className="px-3 py-1.5 rounded-full bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F] font-medium inline-flex items-center gap-1.5 cursor-pointer"
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
                        className="px-3 py-1.5 rounded-full bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F] font-medium inline-flex items-center gap-1.5"
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
                      className="px-3.5 py-1.5 rounded-full bg-[#FF0000] text-white hover:bg-[#CC0000] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
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
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 25)}
              className="px-5 py-2.5 rounded-full bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F] text-xs sm:text-sm font-semibold cursor-pointer"
            >
              Show More Posts ({posts.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
