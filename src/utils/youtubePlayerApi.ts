/**
 * Singleton loader for the YouTube IFrame Player API used strictly as a headless
 * playback engine underneath our custom InbuiltVideoPlayer chrome.
 */

export type YouTubeQualityLevel =
  | 'auto'
  | 'highres'
  | 'hd1440'
  | 'hd1080'
  | 'hd720'
  | 'large'
  | 'medium'
  | 'small'
  | 'tiny'
  | string;

export const DEFAULT_QUALITY_LEVELS: YouTubeQualityLevel[] = [
  'auto',
  'hd1080',
  'hd720',
  'large',
  'medium',
  'small',
  'tiny',
];

export interface YTPlayerInstance {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlaybackQuality?: () => string;
  setPlaybackQuality?: (suggestedQuality: string) => void;
  getAvailableQualityLevels?: () => string[];
  getCurrentTime: () => number;
  getDuration: () => number;
  getVideoLoadedFraction: () => number;
  getPlayerState: () => number;
  loadVideoById: (
    videoOrOptions:
      | string
      | { videoId: string; startSeconds?: number; suggestedQuality?: string }
  ) => void;
  destroy: () => void;
}

export interface YTPlayerOptions {
  host?: string;
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (event: { target: YTPlayerInstance }) => void;
    onStateChange?: (event: { data: number; target: YTPlayerInstance }) => void;
    onPlaybackQualityChange?: (event: { data: string; target: YTPlayerInstance }) => void;
    onError?: (event: { data: number }) => void;
  };
}

export interface YTNamespace {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayerInstance;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubePlayerApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube Player API requires a browser environment.'));
  }

  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve(window.YT);
  }

  if (apiPromise) {
    return apiPromise;
  }

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      apiPromise = null;
      reject(new Error('Timed out loading video playback engine.'));
    }, 12000);

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      if (typeof previousCallback === 'function') {
        try {
          previousCallback();
        } catch {
          // ignore prior listener errors
        }
      }
      if (window.YT && typeof window.YT.Player === 'function') {
        resolve(window.YT);
      } else {
        apiPromise = null;
        reject(new Error('Player API ready callback fired without YT.Player.'));
      }
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        apiPromise = null;
        reject(new Error('Failed to load video playback engine.'));
      };
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}

export function formatPlayerTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const secs = Math.floor(totalSeconds);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatQualityLabel(level: YouTubeQualityLevel, compact = false): string {
  switch (level) {
    case 'auto':
      return 'Auto';
    case 'highres':
      return compact ? '4K' : '2160p 4K';
    case 'hd1440':
      return compact ? '1440p' : '1440p HD';
    case 'hd1080':
      return compact ? '1080p' : '1080p HD';
    case 'hd720':
      return compact ? '720p' : '720p HD';
    case 'large':
      return '480p';
    case 'medium':
      return '360p';
    case 'small':
      return '240p';
    case 'tiny':
      return '144p';
    default:
      return level || 'Auto';
  }
}
