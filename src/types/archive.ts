export interface EndpointsConfig {
  live: string;
  videos_month_template: string;
  post_month_template: string;
}

export interface AvailableMonth {
  month_year: string;
  yyyy: string;
  mm: string;
  video_count: number;
  videos_path: string;
  post_path: string;
}

export interface AppConfig {
  version: number;
  channel_id: string;
  channel_name: string;
  channel_url: string;
  rss_url: string;
  live_url: string;
  last_updated: string;
  endpoints: EndpointsConfig;
  video_json_files: string[];
  post_json_files: string[];
  latest_video_id: string;
  latest_video_title: string;
  popular_video_ids?: string[];
  is_live: boolean;
  available_months: AvailableMonth[];
}

export interface LiveNowState {
  is_live: boolean;
  title: string;
  youtube_id: string;
}

export interface VideoItem {
  id: string;
  title: string;
  youtube_id: string;
  published: string;
  thumbnail: string;
  views?: number;
  is_stream?: boolean;
  is_short?: boolean;
  month_key?: string;
  month_label?: string;
}

export interface CommunityPost {
  id: string;
  date: string;
  title: string;
  text: string;
  image_url: string;
  images?: string[];
  link_url: string;
  month_key?: string;
  month_label?: string;
}

export interface CommunityPostDraft {
  id?: string;
  date: string;
  title: string;
  text: string;
  image_url: string;
  images?: string[];
  link_url: string;
}

export interface FeedSnapshot {
  latestVideoId: string;
  isLive: boolean;
  liveVideoId: string;
  knownVideoIds: string[];
  knownPostIds: string[];
}

export interface FeedNotificationItem {
  id: string;
  kind: 'live' | 'video' | 'post';
  title: string;
  body: string;
  url?: string;
  youtubeId?: string;
  timestamp: string;
}

export interface GitHubRepoSettings {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}
