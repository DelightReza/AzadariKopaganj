import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { formatArchiveDate, toUncroppedPostImageUrl } from '../utils/archiveLogic';

interface PostImageLightboxProps {
  isOpen: boolean;
  images: string[];
  initialIndex?: number;
  title: string;
  date?: string;
  onClose: () => void;
}

function toThumbPreviewUrl(url: string): string {
  const uncropped = toUncroppedPostImageUrl(url);
  if (/(?:yt3\.ggpht\.com|googleusercontent\.com)\//i.test(uncropped)) {
    return uncropped.replace(/=s\d+[^/]*$/i, '=s240');
  }
  return uncropped;
}

export const PostImageLightbox: React.FC<PostImageLightboxProps> = ({
  isOpen,
  images,
  initialIndex = 0,
  title,
  date,
  onClose,
}) => {
  const safeImages: string[] = images.map(toUncroppedPostImageUrl).filter(Boolean);
  const total = safeImages.length;

  const [currentIndex, setCurrentIndex] = useState<number>(() =>
    Math.max(0, Math.min(initialIndex, Math.max(0, total - 1)))
  );
  const [zoomed, setZoomed] = useState<boolean>(false);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [swipeDeltaX, setSwipeDeltaX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number; active: boolean; moved: boolean } | null>(null);
  const panOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const ignoreBackdropClickRef = useRef<boolean>(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    setCurrentIndex(Math.max(0, Math.min(initialIndex, Math.max(0, total - 1))));
    setZoomed(false);
    setPanOffset({ x: 0, y: 0 });
    setSwipeDeltaX(0);
  }, [isOpen, initialIndex, total]);

  const goPrev = useCallback(() => {
    if (total <= 1) return;
    setZoomed(false);
    setPanOffset({ x: 0, y: 0 });
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
  }, [total]);

  const goNext = useCallback(() => {
    if (total <= 1) return;
    setZoomed(false);
    setPanOffset({ x: 0, y: 0 });
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
  }, [total]);

  const handleToggleZoom = useCallback(() => {
    setZoomed((prev) => {
      if (prev) {
        setPanOffset({ x: 0, y: 0 });
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let closedByPopState = false;
    let pushedEntry = false;
    try {
      window.history.pushState(
        { ...(typeof window.history.state === 'object' && window.history.state ? window.history.state : {}), azadariLightbox: true },
        '',
        window.location.href
      );
      pushedEntry = true;
    } catch {
      // ignore history errors
    }

    const onPopState = () => {
      if (pushedEntry) {
        closedByPopState = true;
        pushedEntry = false;
        onCloseRef.current();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setZoomed(true);
      } else if (e.key === '-' || e.key === '0') {
        e.preventDefault();
        setZoomed(false);
        setPanOffset({ x: 0, y: 0 });
      }
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown);
      if (
        pushedEntry &&
        !closedByPopState &&
        typeof window.history.state === 'object' &&
        window.history.state?.azadariLightbox
      ) {
        window.history.back();
      }
    };
  }, [isOpen, goPrev, goNext]);

  if (!isOpen || total === 0) return null;

  const activeUrl = safeImages[Math.min(currentIndex, total - 1)];

  const startDrag = (clientX: number, clientY: number) => {
    dragStartRef.current = { x: clientX, y: clientY, active: true, moved: false };
    panOriginRef.current = { ...panOffset };
    setIsDragging(true);
  };

  const moveDrag = (clientX: number, clientY: number) => {
    const start = dragStartRef.current;
    if (!start || !start.active) return;
    const dx = clientX - start.x;
    const dy = clientY - start.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      start.moved = true;
    }
    if (zoomed) {
      setPanOffset({
        x: panOriginRef.current.x + dx,
        y: panOriginRef.current.y + dy,
      });
    } else if (total > 1 && Math.abs(dx) >= Math.abs(dy) * 0.75) {
      setSwipeDeltaX(dx);
    }
  };

  const endDrag = (clientX: number) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    setIsDragging(false);

    if (!start || !start.active) {
      setSwipeDeltaX(0);
      return;
    }

    if (start.moved) {
      ignoreBackdropClickRef.current = true;
      window.setTimeout(() => {
        ignoreBackdropClickRef.current = false;
      }, 80);
    }

    if (!zoomed && total > 1) {
      const dx = clientX - start.x;
      if (dx <= -45) {
        goNext();
      } else if (dx >= 45) {
        goPrev();
      }
    }
    setSwipeDeltaX(0);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Full image viewer: ${title}`}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col select-none animate-fade-in"
    >
      {/* Top Bar */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-3 sm:px-6 py-3 bg-gradient-to-b from-black/80 to-transparent border-b border-white/[0.08]">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm sm:text-base font-semibold text-white truncate">
            {title}
          </h2>
          {date && (
            <p className="text-[11px] text-neutral-400 tabular-nums">
              {formatArchiveDate(date)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {total > 1 && (
            <span className="px-2.5 py-1 rounded-full bg-white/10 text-white font-mono text-xs font-medium tabular-nums border border-white/15">
              {currentIndex + 1} / {total}
            </span>
          )}

          <button
            type="button"
            onClick={handleToggleZoom}
            aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
            title={zoomed ? 'Reset zoom (1x)' : 'Zoom in (2x)'}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/15 flex items-center justify-center transition-colors cursor-pointer"
          >
            {zoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
          </button>

          <a
            href={activeUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open original image"
            title="Open original image in browser"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/15 flex items-center justify-center transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close image viewer"
            className="w-9 h-9 rounded-full bg-white/15 hover:bg-[#DC2626] text-white border border-white/20 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Image Stage with Touch Swipe & Drag */}
      <div
        onClick={(e) => {
          if (ignoreBackdropClickRef.current) return;
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            startDrag(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 1) {
            moveDrag(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchEnd={(e) => {
          const touch = e.changedTouches[0];
          endDrag(touch ? touch.clientX : 0);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button === 0) {
            startDrag(e.clientX, e.clientY);
          }
        }}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' && dragStartRef.current?.active) {
            moveDrag(e.clientX, e.clientY);
          }
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse') {
            endDrag(e.clientX);
          }
        }}
        onPointerCancel={() => {
          dragStartRef.current = null;
          setIsDragging(false);
          setSwipeDeltaX(0);
        }}
        className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden px-2 sm:px-14 py-3 touch-pan-y"
      >
        {/* Left Arrow Button (Multiple Images) */}
        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            aria-label="Previous image"
            className="absolute left-2.5 sm:left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/20 shadow-xl flex items-center justify-center transition-transform hover:scale-105 cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Active Full Uncropped Image */}
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            handleToggleZoom();
          }}
          style={{
            transform: zoomed
              ? `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(2)`
              : `translate3d(${swipeDeltaX}px, 0, 0)`,
            transition: isDragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          className={`max-w-full max-h-full flex items-center justify-center ${
            zoomed ? 'cursor-grab active:cursor-grabbing' : total > 1 ? 'cursor-grab' : 'cursor-zoom-in'
          }`}
        >
          <img
            src={activeUrl}
            alt={`${title} (${currentIndex + 1} of ${total})`}
            referrerPolicy="no-referrer"
            draggable={false}
            className="max-w-[94vw] max-h-[76vh] sm:max-h-[80vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
          />
        </div>

        {/* Right Arrow Button (Multiple Images) */}
        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            aria-label="Next image"
            className="absolute right-2.5 sm:right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-black/70 hover:bg-black/90 text-white border border-white/20 shadow-xl flex items-center justify-center transition-transform hover:scale-105 cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail & Dot Navigation Strip (When Multiple Images Exist) */}
      {total > 1 && (
        <div className="shrink-0 px-4 py-3 bg-gradient-to-t from-black/85 to-transparent flex flex-col items-center gap-2.5">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full py-0.5">
            {safeImages.map((imgUrl, idx) => {
              const active = idx === currentIndex;
              return (
                <button
                  key={`${imgUrl}-${idx}`}
                  type="button"
                  onClick={() => {
                    setZoomed(false);
                    setPanOffset({ x: 0, y: 0 });
                    setCurrentIndex(idx);
                  }}
                  aria-label={`View image ${idx + 1} of ${total}`}
                  className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden shrink-0 border-2 bg-neutral-900 transition-all cursor-pointer ${
                    active
                      ? 'border-[#DC2626] scale-105 shadow-lg'
                      : 'border-white/20 opacity-65 hover:opacity-95'
                  }`}
                >
                  <img
                    src={toThumbPreviewUrl(imgUrl)}
                    alt=""
                    referrerPolicy="no-referrer"
                    loading="eager"
                    draggable={false}
                    onError={(e) => {
                      if (e.currentTarget.src !== imgUrl) {
                        e.currentTarget.src = imgUrl;
                      }
                    }}
                    className="w-full h-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
