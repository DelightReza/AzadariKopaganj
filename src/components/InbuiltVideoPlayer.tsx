import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  FastForward,
  Loader2,
  Maximize,
  Maximize2,
  Minimize,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ResilientThumbnail } from './ResilientThumbnail';
import {
  DEFAULT_QUALITY_LEVELS,
  formatPlayerTime,
  formatQualityLabel,
  loadYouTubePlayerApi,
  type YouTubeQualityLevel,
  type YTPlayerInstance,
} from '../utils/youtubePlayerApi';

const QUALITY_STORAGE_KEY = 'azadari_preferred_quality';
const QUALITY_SYNC_EVENT = 'azadari-quality-change';

function readStoredQuality(): YouTubeQualityLevel {
  try {
    const val = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (val && typeof val === 'string') return val;
  } catch {
    // ignore storage access errors
  }
  return 'auto';
}

function writeStoredQuality(level: YouTubeQualityLevel): void {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, level);
    window.dispatchEvent(new CustomEvent<YouTubeQualityLevel>(QUALITY_SYNC_EVENT, { detail: level }));
  } catch {
    // ignore storage access errors
  }
}

export interface InbuiltVideoPlayerProps {
  youtubeId: string;
  title: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  isLive?: boolean;
  isShort?: boolean;
  autoplay?: boolean;
  onEnded?: () => void;
  onNext?: () => void;
  hasNext?: boolean;
  onPrevious?: () => void;
  hasPrevious?: boolean;
  theaterWide?: boolean;
  onToggleTheater?: () => void;
  className?: string;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

export const InbuiltVideoPlayer: React.FC<InbuiltVideoPlayerProps> = ({
  youtubeId,
  title,
  thumbnailUrl,
  mediaUrl,
  isLive = false,
  isShort = false,
  autoplay = false,
  onEnded,
  onNext,
  hasNext = false,
  onPrevious,
  hasPrevious = false,
  theaterWide = false,
  onToggleTheater,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const nativeVideoRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const hideHudTimerRef = useRef<number | null>(null);
  const onEndedRef = useRef<(() => void) | undefined>(onEnded);
  onEndedRef.current = onEnded;

  const [started, setStarted] = useState<boolean>(autoplay);
  const [hasPlayedOnce, setHasPlayedOnce] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [isEnded, setIsEnded] = useState<boolean>(false);
  const [isAdPlaying, setIsAdPlaying] = useState<boolean>(false);
  const [adSkipCountdown, setAdSkipCountdown] = useState<number>(5);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedRatio, setBufferedRatio] = useState<number>(0);
  const lastMainTimeRef = useRef<number>(0);
  const autoSkipAttemptedForAdRef = useRef<string | null>(null);
  const adStartWallTimeRef = useRef<number | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(100);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState<boolean>(false);
  const [qualityMenuOpen, setQualityMenuOpen] = useState<boolean>(false);
  const [selectedQuality, setSelectedQuality] = useState<YouTubeQualityLevel>(() =>
    readStoredQuality()
  );
  const [actualQuality, setActualQuality] = useState<YouTubeQualityLevel | null>(null);
  const [availableQualities, setAvailableQualities] = useState<YouTubeQualityLevel[]>(
    DEFAULT_QUALITY_LEVELS
  );
  const [hudVisible, setHudVisible] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubRatio, setScrubRatio] = useState<number | null>(null);
  const [seekPreview, setSeekPreview] = useState<{ ratio: number; time: number } | null>(null);
  const [skipFeedback, setSkipFeedback] = useState<'-10s' | '+10s' | 'LIVE' | 'Ad Skipped' | null>(
    null
  );

  const volumeRef = useRef<number>(volume);
  volumeRef.current = volume;
  const isMutedRef = useRef<boolean>(isMuted);
  isMutedRef.current = isMuted;
  const playbackRateRef = useRef<number>(playbackRate);
  playbackRateRef.current = playbackRate;
  const selectedQualityRef = useRef<YouTubeQualityLevel>(selectedQuality);
  selectedQualityRef.current = selectedQuality;

  const resolvedThumb =
    thumbnailUrl || `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

  // Sync preferred quality across player instances and sessions
  useEffect(() => {
    const onQualitySync = (ev: Event) => {
      const next = (ev as CustomEvent<YouTubeQualityLevel>).detail;
      if (next && next !== selectedQualityRef.current) {
        setSelectedQuality(next);
        try {
          ytPlayerRef.current?.setPlaybackQuality?.(next);
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener(QUALITY_SYNC_EVENT, onQualitySync);
    return () => window.removeEventListener(QUALITY_SYNC_EVENT, onQualitySync);
  }, []);

  // Reset per-video counters when source changes (preserving remembered quality)
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setBufferedRatio(0);
    setHasPlayedOnce(false);
    setIsEnded(false);
    setIsAdPlaying(false);
    setAdSkipCountdown(5);
    setPlayerError(null);
    setSpeedMenuOpen(false);
    setQualityMenuOpen(false);
    setActualQuality(null);
    setAvailableQualities(DEFAULT_QUALITY_LEVELS);
    setIsScrubbing(false);
    setScrubRatio(null);
    setSeekPreview(null);
    setStarted(autoplay);
    setIsPlaying(false);
    setIsBuffering(autoplay);
    lastMainTimeRef.current = 0;
    autoSkipAttemptedForAdRef.current = null;
    adStartWallTimeRef.current = null;
  }, [youtubeId, mediaUrl, autoplay]);

  const scheduleHideHud = useCallback(() => {
    if (hideHudTimerRef.current) {
      window.clearTimeout(hideHudTimerRef.current);
    }
    setHudVisible(true);
    if (isPlaying && !speedMenuOpen && !qualityMenuOpen && !isScrubbing) {
      hideHudTimerRef.current = window.setTimeout(() => {
        setHudVisible(false);
      }, 2800);
    }
  }, [isPlaying, speedMenuOpen, qualityMenuOpen, isScrubbing]);

  useEffect(() => {
    scheduleHideHud();
    return () => {
      if (hideHudTimerRef.current) {
        window.clearTimeout(hideHudTimerRef.current);
      }
    };
  }, [isPlaying, speedMenuOpen, qualityMenuOpen, isScrubbing, scheduleHideHud]);

  // Listen to fullscreen state changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const syncAvailableQualities = useCallback((p: YTPlayerInstance) => {
    try {
      const levels = p.getAvailableQualityLevels?.();
      if (Array.isArray(levels) && levels.length > 0) {
        const cleaned = levels.filter((lvl) => lvl && lvl !== 'unknown');
        const merged = ['auto', ...cleaned.filter((lvl) => lvl !== 'auto')];
        setAvailableQualities(merged);
      }
      const activeQ = p.getPlaybackQuality?.();
      if (activeQ && activeQ !== 'unknown') {
        setActualQuality(activeQ);
      }
    } catch {
      // ignore transient API read errors
    }
  }, []);

  // Initialize headless YT.Player when started (and no direct mediaUrl)
  useEffect(() => {
    if (!started || mediaUrl || !youtubeId) return;

    let cancelled = false;
    setIsBuffering(true);
    setPlayerError(null);

    loadYouTubePlayerApi()
      .then((YT) => {
        if (cancelled || !ytHostRef.current) return;

        ytHostRef.current.innerHTML = '';
        const targetEl = document.createElement('div');
        targetEl.className = 'w-full h-full';
        ytHostRef.current.appendChild(targetEl);

        const origin =
          typeof window !== 'undefined' && window.location.origin.startsWith('http')
            ? window.location.origin
            : undefined;

        const playerVars: Record<string, string | number> = {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
        };
        if (selectedQualityRef.current !== 'auto') {
          playerVars.vq = selectedQualityRef.current;
        }
        if (origin) {
          playerVars.origin = origin;
        }

        const instance = new YT.Player(targetEl, {
          host: 'https://www.youtube.com',
          videoId: youtubeId,
          width: '100%',
          height: '100%',
          playerVars,
          events: {
            onReady: (ev) => {
              if (cancelled) return;
              try {
                ev.target.setVolume(volumeRef.current);
                if (isMutedRef.current) ev.target.mute();
                else ev.target.unMute();
                ev.target.setPlaybackRate(playbackRateRef.current);
                if (selectedQualityRef.current !== 'auto') {
                  ev.target.setPlaybackQualityRange?.(
                    selectedQualityRef.current,
                    selectedQualityRef.current
                  );
                  ev.target.setPlaybackQuality?.(selectedQualityRef.current);
                }
                syncAvailableQualities(ev.target);
                ev.target.playVideo();
              } catch {
                // ignore initial play errors
              }
            },
            onStateChange: (ev) => {
              if (cancelled) return;
              const st = ev.data;
              if (st === YT.PlayerState.PLAYING) {
                setHasPlayedOnce(true);
                setIsPlaying(true);
                setIsBuffering(false);
                setIsEnded(false);
                if (selectedQualityRef.current !== 'auto') {
                  try {
                    ev.target.setPlaybackQualityRange?.(
                      selectedQualityRef.current,
                      selectedQualityRef.current
                    );
                    ev.target.setPlaybackQuality?.(selectedQualityRef.current);
                  } catch {
                    // ignore
                  }
                }
                syncAvailableQualities(ev.target);
                try {
                  const d = ev.target.getDuration();
                  if (Number.isFinite(d) && d > 0) setDuration(d);
                } catch {
                  // ignore
                }
              } else if (st === YT.PlayerState.PAUSED) {
                setIsPlaying(false);
                setIsBuffering(false);
                setHudVisible(true);
              } else if (st === YT.PlayerState.BUFFERING) {
                setIsBuffering(true);
              } else if (st === YT.PlayerState.ENDED) {
                setIsPlaying(false);
                setIsBuffering(false);
                setIsEnded(true);
                setHudVisible(true);
                if (onEndedRef.current) {
                  onEndedRef.current();
                }
              }
            },
            onPlaybackQualityChange: (ev) => {
              if (cancelled) return;
              if (ev.data && ev.data !== 'unknown') {
                setActualQuality(ev.data);
              }
              syncAvailableQualities(ev.target);
            },
            onError: () => {
              if (cancelled) return;
              setIsBuffering(false);
              setIsPlaying(false);
              setPlayerError('Video stream unavailable. Check your internet connection or retry.');
            },
          },
        });

        ytPlayerRef.current = instance;
      })
      .catch((err) => {
        if (cancelled) return;
        setIsBuffering(false);
        setPlayerError(err instanceof Error ? err.message : 'Unable to initialize video player.');
      });

    return () => {
      cancelled = true;
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // ignore destroy errors
        }
        ytPlayerRef.current = null;
      }
      if (ytHostRef.current) {
        ytHostRef.current.innerHTML = '';
      }
    };
  }, [started, youtubeId, mediaUrl, syncAvailableQualities]);

  const handleSkipAd = useCallback(() => {
    const p = ytPlayerRef.current;
    if (!p) return;
    try {
      const adDur = p.getDuration();
      if (Number.isFinite(adDur) && adDur > 0) {
        p.seekTo(adDur, true);
      }
      // Verify after 550ms whether seeking ended the ad; if still on ad stream, re-cue main video
      window.setTimeout(() => {
        const curPlayer = ytPlayerRef.current;
        if (!curPlayer) return;
        try {
          const currentLoadedId = curPlayer.getVideoData?.()?.video_id;
          if (currentLoadedId && currentLoadedId !== youtubeId) {
            const resumeAt = Math.max(0, Math.floor(lastMainTimeRef.current || 0));
            curPlayer.loadVideoById({
              videoId: youtubeId,
              startSeconds: isLive ? 0 : resumeAt,
              ...(selectedQualityRef.current !== 'auto'
                ? { suggestedQuality: selectedQualityRef.current }
                : {}),
            });
          }
          if (!isMutedRef.current) {
            curPlayer.unMute();
          }
          curPlayer.setPlaybackRate(playbackRateRef.current);
        } catch {
          // ignore
        }
      }, 550);

      setIsAdPlaying(false);
      adStartWallTimeRef.current = null;
      setSkipFeedback('Ad Skipped');
      window.setTimeout(() => setSkipFeedback(null), 1100);
    } catch {
      // ignore
    }
  }, [youtubeId, isLive]);

  // Poll playback progress cleanly for YT engine (paused while user drags slider)
  useEffect(() => {
    if (!started || mediaUrl) return;
    const AUTO_SKIP_AFTER_SECONDS = 5;

    const timer = window.setInterval(() => {
      const p = ytPlayerRef.current;
      if (!p || isScrubbing) return;
      try {
        const activeVidId = p.getVideoData?.()?.video_id;
        const adDetected = Boolean(activeVidId && activeVidId !== youtubeId);
        setIsAdPlaying(adDetected);

        if (adDetected && activeVidId) {
          if (adStartWallTimeRef.current === null) {
            adStartWallTimeRef.current = Date.now();
          }
          const adCur = p.getCurrentTime();
          const wallElapsed = (Date.now() - adStartWallTimeRef.current) / 1000;
          const elapsedAdSec =
            Number.isFinite(adCur) && adCur > 0 ? Math.max(adCur, wallElapsed) : wallElapsed;
          const remaining = Math.max(0, Math.ceil(AUTO_SKIP_AFTER_SECONDS - elapsedAdSec));
          setAdSkipCountdown(remaining);

          // Once the 5-second skippable window has played, automatically skip the ad
          if (
            elapsedAdSec >= AUTO_SKIP_AFTER_SECONDS &&
            autoSkipAttemptedForAdRef.current !== activeVidId
          ) {
            autoSkipAttemptedForAdRef.current = activeVidId;
            handleSkipAd();
          }
          return;
        }

        adStartWallTimeRef.current = null;

        const cur = p.getCurrentTime();
        const dur = p.getDuration();
        const frac = p.getVideoLoadedFraction();
        if (Number.isFinite(cur)) {
          setCurrentTime(cur);
          if (cur > 0) {
            lastMainTimeRef.current = cur;
          }
        }
        if (Number.isFinite(dur) && dur > 0) {
          setDuration(dur);
          // Seamless loop for Shorts before YouTube's end-screen suggestion wall appears
          if (isShort && !isLive && dur > 2 && dur - cur <= 0.3) {
            p.seekTo(0, true);
            p.playVideo();
          }
        }
        if (Number.isFinite(frac)) setBufferedRatio(Math.max(0, Math.min(1, frac)));
      } catch {
        // ignore transient calls while destroying
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [started, mediaUrl, isScrubbing, youtubeId, isShort, isLive, handleSkipAd]);

  const handleTogglePlay = useCallback(() => {
    if (!started) {
      setStarted(true);
      setIsBuffering(true);
      return;
    }

    if (mediaUrl && nativeVideoRef.current) {
      const el = nativeVideoRef.current;
      if (el.paused) {
        el.play().catch(() => undefined);
      } else {
        el.pause();
      }
      return;
    }

    const p = ytPlayerRef.current;
    if (!p) return;
    try {
      if (isEnded) {
        p.seekTo(0, true);
        p.playVideo();
        setIsEnded(false);
      } else if (isPlaying) {
        p.pauseVideo();
      } else {
        p.playVideo();
      }
    } catch {
      // ignore
    }
  }, [started, mediaUrl, isEnded, isPlaying]);

  const handleSeekToSeconds = useCallback(
    (seconds: number) => {
      const clamped = Math.max(0, duration > 0 ? Math.min(duration, seconds) : seconds);
      setCurrentTime(clamped);
      if (mediaUrl && nativeVideoRef.current) {
        nativeVideoRef.current.currentTime = clamped;
        return;
      }
      const p = ytPlayerRef.current;
      if (p) {
        try {
          p.seekTo(clamped, true);
        } catch {
          // ignore
        }
      }
    },
    [duration, mediaUrl]
  );

  const handleSkipBy = useCallback(
    (deltaSeconds: number) => {
      if (!started) {
        setStarted(true);
        setIsBuffering(true);
        return;
      }
      handleSeekToSeconds(currentTime + deltaSeconds);
      setSkipFeedback(deltaSeconds < 0 ? '-10s' : '+10s');
      window.setTimeout(() => setSkipFeedback(null), 650);
      scheduleHideHud();
    },
    [started, currentTime, handleSeekToSeconds, scheduleHideHud]
  );

  const handleJumpToLive = useCallback(() => {
    if (!isLive) return;
    if (!started) {
      setStarted(true);
      setIsBuffering(true);
      return;
    }
    if (duration > 0) {
      handleSeekToSeconds(Math.max(0, duration - 1));
    }
    const p = ytPlayerRef.current;
    if (p) {
      try {
        p.playVideo();
      } catch {
        // ignore
      }
    }
    setSkipFeedback('LIVE');
    window.setTimeout(() => setSkipFeedback(null), 650);
    scheduleHideHud();
  }, [isLive, started, duration, handleSeekToSeconds, scheduleHideHud]);

  const handleToggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (mediaUrl && nativeVideoRef.current) {
      nativeVideoRef.current.muted = nextMuted;
      return;
    }
    const p = ytPlayerRef.current;
    if (p) {
      try {
        if (nextMuted) p.mute();
        else p.unMute();
      } catch {
        // ignore
      }
    }
  }, [isMuted, mediaUrl]);

  const handleVolumeChange = useCallback(
    (nextVol: number) => {
      const clamped = Math.max(0, Math.min(100, nextVol));
      setVolume(clamped);
      const shouldMute = clamped === 0;
      setIsMuted(shouldMute);
      if (mediaUrl && nativeVideoRef.current) {
        nativeVideoRef.current.volume = clamped / 100;
        nativeVideoRef.current.muted = shouldMute;
        return;
      }
      const p = ytPlayerRef.current;
      if (p) {
        try {
          p.setVolume(clamped);
          if (shouldMute) p.mute();
          else p.unMute();
        } catch {
          // ignore
        }
      }
    },
    [mediaUrl]
  );

  const handleSpeedChange = useCallback(
    (rate: number) => {
      setPlaybackRate(rate);
      setSpeedMenuOpen(false);
      if (mediaUrl && nativeVideoRef.current) {
        nativeVideoRef.current.playbackRate = rate;
        return;
      }
      const p = ytPlayerRef.current;
      if (p) {
        try {
          p.setPlaybackRate(rate);
        } catch {
          // ignore
        }
      }
    },
    [mediaUrl]
  );

  const handleQualityChange = useCallback(
    (level: YouTubeQualityLevel) => {
      setSelectedQuality(level);
      writeStoredQuality(level);
      setQualityMenuOpen(false);
      if (mediaUrl) return;
      const p = ytPlayerRef.current;
      if (p) {
        try {
          if (level === 'auto') {
            p.setPlaybackQualityRange?.('tiny', 'highres');
            p.setPlaybackQuality?.('default');
          } else {
            p.setPlaybackQualityRange?.(level, level);
            p.setPlaybackQuality?.(level);
            if (!isLive && isPlaying) {
              const cur = p.getCurrentTime?.() ?? currentTime;
              p.loadVideoById({
                videoId: youtubeId,
                startSeconds: Number.isFinite(cur) && cur > 0 ? Math.floor(cur) : 0,
                suggestedQuality: level,
              });
            }
          }
          window.setTimeout(() => {
            if (ytPlayerRef.current === p) {
              syncAvailableQualities(p);
            }
          }, 500);
        } catch {
          // ignore unsupported quality switches
        }
      }
    },
    [mediaUrl, isLive, isPlaying, currentTime, youtubeId, syncAvailableQualities]
  );

  const handleToggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore unsupported fullscreen errors in restricted iframes
    }
  }, []);

  const getScrubRatioFromClientX = (clientX: number, target: HTMLDivElement): number => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleScrubPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    const ratio = getScrubRatioFromClientX(e.clientX, e.currentTarget);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer capture issues on synthetic events
    }
    setIsScrubbing(true);
    setScrubRatio(ratio);
    if (duration > 0) {
      setSeekPreview({ ratio, time: ratio * duration });
    }
    if (!started) {
      setStarted(true);
      setIsBuffering(true);
    }
  };

  const handleScrubPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ratio = getScrubRatioFromClientX(e.clientX, e.currentTarget);
    if (duration > 0) {
      setSeekPreview({ ratio, time: ratio * duration });
    }
    if (isScrubbing) {
      setScrubRatio(ratio);
      if (duration > 0) {
        setCurrentTime(ratio * duration);
      }
    }
  };

  const finishScrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    const ratio = getScrubRatioFromClientX(e.clientX, e.currentTarget);
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    setIsScrubbing(false);
    setScrubRatio(null);
    if (duration > 0) {
      handleSeekToSeconds(ratio * duration);
    }
    scheduleHideHud();
  };

  const handleScrubKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      handleSeekToSeconds(currentTime - 5);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      handleSeekToSeconds(currentTime + 5);
    } else if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      handleSeekToSeconds(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      handleSeekToSeconds(duration);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === ' ' || e.key.toLowerCase() === 'k') {
      e.preventDefault();
      handleTogglePlay();
    } else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'j') {
      e.preventDefault();
      handleSkipBy(-10);
    } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'l') {
      e.preventDefault();
      handleSkipBy(10);
    } else if (e.key.toLowerCase() === 'm') {
      e.preventDefault();
      handleToggleMute();
    } else if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      handleToggleFullscreen();
    }
  };

  const displayTime = useMemo(() => {
    if (isScrubbing && scrubRatio !== null && duration > 0) {
      return scrubRatio * duration;
    }
    return currentTime;
  }, [isScrubbing, scrubRatio, duration, currentTime]);

  const progressPercent = useMemo(() => {
    if (isScrubbing && scrubRatio !== null) {
      return Math.max(0, Math.min(100, scrubRatio * 100));
    }
    if (duration > 0) {
      return Math.max(0, Math.min(100, (currentTime / duration) * 100));
    }
    return isLive && started ? 100 : 0;
  }, [isScrubbing, scrubRatio, duration, currentTime, isLive, started]);

  const bufferedPercent = useMemo(() => {
    if (isLive && duration <= 0) return started ? 100 : 0;
    return Math.min(100, Math.max(progressPercent, bufferedRatio * 100));
  }, [isLive, duration, started, progressPercent, bufferedRatio]);

  const isBehindLiveEdge = isLive && duration > 15 && duration - displayTime > 15;

  const qualityButtonLabel = useMemo(() => {
    if (selectedQuality === 'auto') {
      const actualShort =
        actualQuality && actualQuality !== 'auto' && actualQuality !== 'default'
          ? formatQualityLabel(actualQuality, true)
          : null;
      return actualShort ? `Auto (${actualShort})` : 'Auto';
    }
    return formatQualityLabel(selectedQuality, true);
  }, [selectedQuality, actualQuality]);

  const frameSizeClasses = isShort
    ? 'aspect-[9/16] w-full max-w-[360px] sm:max-w-[400px] max-h-[78vh] mx-auto'
    : 'aspect-video w-full';

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="region"
      aria-label={`Inbuilt Video Player: ${title}`}
      onKeyDown={handleKeyDown}
      onMouseMove={scheduleHideHud}
      onMouseLeave={() => {
        if (isPlaying && !speedMenuOpen && !qualityMenuOpen && !isScrubbing) {
          setHudVisible(false);
        }
      }}
      className={`@container group/player relative ${frameSizeClasses} bg-black overflow-hidden select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF0000] ${className}`}
    >
      {/* 1A. Direct HTML5 Media Engine (if stream URL supplied) */}
      {started && mediaUrl && (
        <video
          ref={nativeVideoRef}
          src={mediaUrl}
          autoPlay
          playsInline
          onPlay={() => {
            setIsPlaying(true);
            setIsBuffering(false);
            setIsEnded(false);
          }}
          onPause={() => {
            setIsPlaying(false);
            setHudVisible(true);
          }}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => setIsBuffering(false)}
          onTimeUpdate={(e) => {
            if (isScrubbing) return;
            const el = e.currentTarget;
            setCurrentTime(el.currentTime);
            if (Number.isFinite(el.duration)) setDuration(el.duration);
          }}
          onEnded={() => {
            setIsPlaying(false);
            setIsEnded(true);
            onEndedRef.current?.();
          }}
          onError={() => {
            setIsBuffering(false);
            setPlayerError('Unable to play video stream.');
          }}
          className="w-full h-full object-contain pointer-events-none"
        />
      )}

      {/* 1B. Headless Video Playback Frame (300% vertical overscan pushes YouTube's top title bar & bottom watermark completely outside overflow-hidden on both 9:16 Shorts and 16:9 Videos) */}
      {started && !mediaUrl && (
        <div
          ref={ytHostRef}
          aria-hidden="true"
          className="absolute inset-x-0 -top-[100%] w-full h-[300%] pointer-events-none"
        />
      )}

      {/* 2. Poster / Pre-Play Shield / Paused / Ended Backdrop Overlay (Covers YouTube startup UI until first playing frame) */}
      {(!started || !hasPlayedOnce || (!isPlaying && !isBuffering) || isEnded) && !playerError && (
        <div
          onClick={() => {
            if (speedMenuOpen || qualityMenuOpen) {
              setSpeedMenuOpen(false);
              setQualityMenuOpen(false);
            }
            scheduleHideHud();
          }}
          className="absolute inset-0 z-10"
        >
          {(!started || !hasPlayedOnce || isEnded) && (
            <div className="absolute inset-0">
              <ResilientThumbnail
                src={resolvedThumb}
                alt={title}
                className="w-full h-full"
              />
            </div>
          )}

          <div
            className={`absolute inset-0 transition-opacity ${
              !started || !hasPlayedOnce || isEnded
                ? 'bg-gradient-to-t from-black/80 via-black/30 to-black/35'
                : 'bg-black/65 backdrop-blur-[3px]'
            }`}
          />
        </div>
      )}

      {/* 3. Active HUD Surface (Clicking anywhere wakes HUD & closes menus without pausing) */}
      {started && (isPlaying || isBuffering) && !playerError && (
        <div
          onClick={() => {
            if (speedMenuOpen || qualityMenuOpen) {
              setSpeedMenuOpen(false);
              setQualityMenuOpen(false);
            }
            scheduleHideHud();
          }}
          onDoubleClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const isLeftHalf = e.clientX - rect.left < rect.width / 2;
            handleSkipBy(isLeftHalf ? -10 : 10);
          }}
          className="absolute inset-0 z-10"
        />
      )}

      {/* Center Play / Replay Button (Above HUD Surface) */}
      {(!started || (!isPlaying && !isBuffering)) && !playerError && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={isEnded ? 'Replay video' : 'Play video'}
            className="pointer-events-auto w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full bg-[#FF0000] hover:bg-[#CC0000] text-white shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer ring-4 ring-white/25"
          >
            {isEnded ? (
              <RotateCcw className="w-7 h-7" />
            ) : (
              <Play className="w-7 h-7 fill-white ml-1" />
            )}
          </button>
        </div>
      )}

      {/* 4. Buffering & Error States */}
      {isBuffering && !playerError && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="w-12 h-12 rounded-full bg-black/75 border border-white/15 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        </div>
      )}

      {skipFeedback && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="px-4 py-1.5 rounded-full bg-black/80 text-white text-xs font-bold border border-white/20">
            {skipFeedback}
          </span>
        </div>
      )}

      {/* Ad Countdown & Auto-Skip Pill (Plays ad for 5s then skips automatically) */}
      {isAdPlaying && !playerError && (
        <div className="absolute bottom-14 right-3 sm:right-4 z-30 flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-full bg-black/85 backdrop-blur-md text-white text-[11px] font-semibold border border-white/20 tabular-nums shadow-lg">
            {adSkipCountdown > 0
              ? `Ad · Auto-skipping in ${adSkipCountdown}s`
              : 'Skipping ad...'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSkipAd();
            }}
            className="px-3.5 py-1.5 rounded-full bg-[#FF0000] hover:bg-[#CC0000] text-white text-xs font-bold shadow-2xl ring-1 ring-white/30 flex items-center gap-1.5 cursor-pointer transition-transform hover:scale-105"
          >
            <span>Skip Now</span>
            <FastForward className="w-3.5 h-3.5 fill-white" />
          </button>
        </div>
      )}

      {playerError && (
        <div
          onClick={() => {
            if (speedMenuOpen || qualityMenuOpen) {
              setSpeedMenuOpen(false);
              setQualityMenuOpen(false);
            }
            scheduleHideHud();
          }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center p-3 pb-12 sm:p-4 text-center"
        >
          <div className="absolute inset-0">
            <ResilientThumbnail
              src={resolvedThumb}
              alt={title}
              className="w-full h-full"
            />
          </div>
          <div className="absolute inset-0 bg-[#0F0F0F]/92 backdrop-blur-md" />
          <div className="relative z-10 flex flex-col items-center max-w-sm">
            <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-[#FF0000] mb-1.5 sm:mb-2" />
            <p className="text-xs sm:text-sm text-white font-medium leading-snug">{playerError}</p>
            <div className="mt-2 sm:mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPlayerError(null);
                  setStarted(false);
                  window.setTimeout(() => setStarted(true), 50);
                }}
                className="px-4 py-1.5 rounded-full bg-[#FF0000] hover:bg-[#CC0000] text-white text-xs font-semibold cursor-pointer"
              >
                Retry Playback
              </button>
              <a
                href={`https://www.youtube.com/watch?v=${youtubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-semibold"
              >
                Open on YouTube
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 5. Custom Inbuilt Control Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-8 pb-2.5 px-3 sm:px-4 transition-opacity duration-200 ${
          hudVisible || !isPlaying || !started || isScrubbing
            ? 'opacity-100'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrub / Slide Progress Bar (Enabled on both Live DVR and VOD) */}
        <div
          role="slider"
          aria-label="Video progress"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration || 100)}
          aria-valuenow={Math.floor(displayTime)}
          tabIndex={0}
          onPointerDown={handleScrubPointerDown}
          onPointerMove={handleScrubPointerMove}
          onPointerUp={finishScrub}
          onPointerCancel={finishScrub}
          onPointerLeave={() => {
            if (!isScrubbing) setSeekPreview(null);
          }}
          onKeyDown={handleScrubKeyDown}
          className="relative h-5 flex items-center cursor-pointer group/scrub touch-none"
        >
          {(seekPreview || isScrubbing) && duration > 0 && (
            <div
              style={{
                left: `${
                  isScrubbing && scrubRatio !== null
                    ? scrubRatio * 100
                    : (seekPreview?.ratio ?? 0) * 100
                }%`,
              }}
              className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/90 text-[11px] font-mono text-white border border-white/15 pointer-events-none shadow"
            >
              {formatPlayerTime(
                isScrubbing && scrubRatio !== null
                  ? scrubRatio * duration
                  : (seekPreview?.time ?? 0)
              )}
            </div>
          )}

          <div className="w-full h-1.5 group-hover/scrub:h-2 transition-all rounded-full bg-white/25 overflow-hidden relative">
            <div
              style={{ width: `${bufferedPercent}%` }}
              className="absolute inset-y-0 left-0 bg-white/40"
            />
            <div
              style={{ width: `${progressPercent}%` }}
              className="absolute inset-y-0 left-0 bg-[#FF0000]"
            />
          </div>

          <div
            style={{ left: `${progressPercent}%` }}
            className={`absolute -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#FF0000] ring-2 ring-white/80 shadow transition-transform ${
              isScrubbing
                ? 'scale-110'
                : 'scale-75 sm:scale-0 sm:group-hover/scrub:scale-100'
            }`}
          />
        </div>

        {/* Bottom Controls Row */}
        <div className="mt-0.5 flex items-center justify-between gap-1.5 @[580px]:gap-2 text-white">
          <div className="flex items-center gap-0.5 @[580px]:gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
            {hasPrevious && onPrevious && (
              <button
                type="button"
                onClick={onPrevious}
                aria-label="Previous video"
                title="Previous video"
                className="p-1 @[580px]:p-1.5 rounded-full hover:bg-white/15 cursor-pointer shrink-0"
              >
                <SkipBack className="w-3.5 h-3.5 @[580px]:w-4 @[580px]:h-4 fill-white" />
              </button>
            )}

            <button
              type="button"
              onClick={handleTogglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={isPlaying ? 'Pause (K)' : 'Play (K)'}
              className="p-1 @[580px]:p-1.5 rounded-full hover:bg-white/15 cursor-pointer shrink-0"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 @[580px]:w-5 @[580px]:h-5 fill-white" />
              ) : (
                <Play className="w-4 h-4 @[580px]:w-5 @[580px]:h-5 fill-white" />
              )}
            </button>

            {hasNext && onNext && (
              <button
                type="button"
                onClick={onNext}
                aria-label="Next video"
                title="Next video"
                className="p-1 @[580px]:p-1.5 rounded-full hover:bg-white/15 cursor-pointer shrink-0"
              >
                <SkipForward className="w-3.5 h-3.5 @[580px]:w-4 @[580px]:h-4 fill-white" />
              </button>
            )}

            {/* Rewind / Forward 10s */}
            <button
              type="button"
              onClick={() => handleSkipBy(-10)}
              aria-label="Rewind 10 seconds"
              title="Rewind 10s (J)"
              className="p-1 @[580px]:p-1.5 rounded-full hover:bg-white/15 cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 @[580px]:w-4 @[580px]:h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSkipBy(10)}
              aria-label="Forward 10 seconds"
              title="Forward 10s (L)"
              className="p-1 @[580px]:p-1.5 rounded-full hover:bg-white/15 cursor-pointer shrink-0"
            >
              <RotateCw className="w-3.5 h-3.5 @[580px]:w-4 @[580px]:h-4" />
            </button>

            {/* Volume Controls */}
            <div className="flex items-center gap-1 group/vol shrink-0">
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                className="p-1 @[580px]:p-1.5 rounded-full hover:bg-white/15 cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 @[580px]:w-4 @[580px]:h-4" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 @[580px]:w-4 @[580px]:h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                aria-label="Volume"
                className="hidden @[620px]:block w-14 @[720px]:w-16 accent-[#FF0000] h-1 cursor-pointer"
              />
            </div>

            {/* Timestamp + Live Edge Jump Pill */}
            <div className="ml-0.5 @[580px]:ml-1 flex items-center gap-1 @[580px]:gap-2 shrink-0">
              {isLive && (
                <button
                  type="button"
                  onClick={handleJumpToLive}
                  title={isBehindLiveEdge ? 'Jump to Live edge' : 'Live stream'}
                  aria-label={isBehindLiveEdge ? 'Jump to Live edge' : 'Live stream'}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] @[580px]:text-[10px] font-bold uppercase tracking-wider shrink-0 cursor-pointer transition-colors ${
                    isBehindLiveEdge
                      ? 'bg-white/15 hover:bg-white/25 text-white/80'
                      : 'bg-black/40 text-white'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isBehindLiveEdge ? 'bg-neutral-400' : 'bg-[#FF0000] animate-pulse'
                    }`}
                  />
                  LIVE
                </button>
              )}
              <span className="text-[10px] @[580px]:text-xs font-mono text-white/90 tabular-nums whitespace-nowrap">
                {formatPlayerTime(displayTime)} / {formatPlayerTime(duration)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-0.5 @[580px]:gap-1 relative shrink-0">
            {/* Quality Selector (Persisted across all videos) */}
            {!mediaUrl && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setSpeedMenuOpen(false);
                    setQualityMenuOpen((prev) => !prev);
                  }}
                  aria-label="Video quality"
                  aria-expanded={qualityMenuOpen}
                  title="Video quality"
                  className="inline-flex items-center gap-1 px-1.5 @[580px]:px-2 py-1 rounded-md hover:bg-white/15 text-[10px] @[580px]:text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{qualityButtonLabel}</span>
                </button>

                {qualityMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Quality options"
                    className="absolute right-0 bottom-8 @[580px]:bottom-9 z-40 p-1.5 @[580px]:p-2 w-56 @[580px]:w-60 rounded-lg bg-[#181818]/95 border border-white/15 shadow-xl backdrop-blur-md"
                  >
                    <div className="flex items-center justify-between gap-1.5 pb-1 border-b border-white/10">
                      <span className="px-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                        Quality
                      </span>
                      {actualQuality && actualQuality !== 'auto' && actualQuality !== 'default' && (
                        <span className="px-1 text-[10px] text-neutral-300">
                          Stream: {formatQualityLabel(actualQuality, true)}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 grid grid-cols-3 gap-1">
                      {availableQualities.map((level) => {
                        const isActive = selectedQuality === level;
                        const label =
                          level === 'auto' && actualQuality && actualQuality !== 'auto'
                            ? `Auto (${formatQualityLabel(actualQuality, true)})`
                            : formatQualityLabel(level, true);
                        return (
                          <button
                            key={level}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isActive}
                            onClick={() => handleQualityChange(level)}
                            className={`px-1.5 py-1 rounded text-left text-[11px] flex items-center justify-between gap-1 hover:bg-white/15 cursor-pointer ${
                              level === 'auto' ? 'col-span-3' : ''
                            } ${
                              isActive
                                ? 'bg-[#FF0000]/20 text-[#FF0000] font-bold ring-1 ring-[#FF0000]/50'
                                : 'bg-white/5 text-white'
                            }`}
                          >
                            <span className="truncate">{label}</span>
                            {isActive && <Check className="w-3 h-3 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Speed Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setQualityMenuOpen(false);
                  setSpeedMenuOpen((prev) => !prev);
                }}
                aria-label="Playback speed"
                aria-expanded={speedMenuOpen}
                title="Playback speed"
                className="px-1.5 @[580px]:px-2 py-1 rounded-md hover:bg-white/15 text-[10px] @[580px]:text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                {playbackRate}x
              </button>

              {speedMenuOpen && (
                <div
                  role="menu"
                  aria-label="Playback speed options"
                  className="absolute right-0 bottom-9 z-40 py-1 w-28 rounded-lg bg-[#181818]/95 border border-white/15 shadow-xl backdrop-blur-md"
                >
                  {SPEED_OPTIONS.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      role="menuitemradio"
                      aria-checked={playbackRate === rate}
                      onClick={() => handleSpeedChange(rate)}
                      className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between hover:bg-white/10 cursor-pointer ${
                        playbackRate === rate ? 'text-[#FF0000] font-bold' : 'text-white'
                      }`}
                    >
                      <span>{rate === 1 ? 'Normal (1x)' : `${rate}x`}</span>
                      {playbackRate === rate && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Optional Theater Toggle */}
            {onToggleTheater && (
              <button
                type="button"
                onClick={onToggleTheater}
                aria-label={theaterWide ? 'Exit theater mode' : 'Theater mode'}
                title={theaterWide ? 'Exit theater mode' : 'Theater mode'}
                className="hidden @[580px]:inline-flex p-1.5 rounded-full hover:bg-white/15 cursor-pointer"
              >
                {theaterWide ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              title={isFullscreen ? 'Fullscreen (F)' : 'Fullscreen (F)'}
              className="p-1 @[580px]:p-1.5 rounded-full hover:bg-white/15 cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4 @[580px]:w-5 @[580px]:h-5" />
              ) : (
                <Maximize className="w-4 h-4 @[580px]:w-5 @[580px]:h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
