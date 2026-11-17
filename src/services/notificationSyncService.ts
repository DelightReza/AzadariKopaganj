import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { FeedNotificationItem, FeedSnapshot } from '../types/archive';
import { detectFeedUpdates } from '../utils/archiveLogic';
import type { LoadedArchiveBundle } from './archiveService';

export interface AzadariBackgroundSyncPlugin {
  ensureScheduled(): Promise<{
    scheduled: boolean;
    intervalMinutes: number;
    notificationsEnabled: boolean;
    alertsEnabled: boolean;
  }>;
  checkNotificationStatus(): Promise<{
    allowed: boolean;
    alertsEnabled: boolean;
  }>;
  openNotificationSettings(): Promise<{ opened: boolean }>;
  syncBaseline(options: {
    isLive: boolean;
    liveVideoId: string;
    latestVideoId: string;
    knownVideoIds: string[];
    knownPostIds: string[];
  }): Promise<{ ok: boolean }>;
  setAlertsEnabled(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  triggerImmediateCheck(): Promise<{ queued: boolean }>;
  consumePendingRoute(): Promise<{ route: string | null }>;
  addListener(
    eventName: 'notificationRoute',
    listenerFunc: (data: { route: string }) => void
  ): Promise<PluginListenerHandle>;
}

const AzadariBackgroundSync = registerPlugin<AzadariBackgroundSyncPlugin>('AzadariBackgroundSync');

const SNAPSHOT_STORAGE_KEY = 'azadari_feed_snapshot_v1';
const MAX_SNAPSHOT_IDS = 1500;

export const CHANNEL_LIVE = 'azadari_live_alerts';
export const CHANNEL_VIDEO = 'azadari_video_alerts';
export const CHANNEL_POST = 'azadari_post_alerts';

function readStoredSnapshot(): FeedSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeedSnapshot;
    if (!parsed || !Array.isArray(parsed.knownVideoIds) || !Array.isArray(parsed.knownPostIds)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSnapshot(snapshot: FeedSnapshot): void {
  try {
    const trimmed: FeedSnapshot = {
      ...snapshot,
      knownVideoIds: snapshot.knownVideoIds.slice(0, MAX_SNAPSHOT_IDS),
      knownPostIds: snapshot.knownPostIds.slice(0, MAX_SNAPSHOT_IDS),
    };
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage quota errors
  }
}

export async function isNativeNotificationAllowed(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return true;
  }
  try {
    const [perm, nativeStatus] = await Promise.all([
      LocalNotifications.checkPermissions(),
      AzadariBackgroundSync.checkNotificationStatus().catch(() => ({
        allowed: true,
        alertsEnabled: true,
      })),
    ]);
    return perm.display === 'granted' && Boolean(nativeStatus.allowed);
  } catch {
    return false;
  }
}

export async function ensureNotificationChannelsAndSchedule(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_LIVE,
      name: 'Live Broadcasts',
      description: 'Instant alerts when Azadari Kopaganj goes Live',
      importance: 4,
      visibility: 1,
      lights: true,
      lightColor: '#FF0000',
      vibration: true,
    });
    await LocalNotifications.createChannel({
      id: CHANNEL_VIDEO,
      name: 'New Videos',
      description: 'Alerts when new Majlis, Nauha, Jashn, or Qaseeda videos are uploaded',
      importance: 3,
      visibility: 1,
      vibration: true,
    });
    await LocalNotifications.createChannel({
      id: CHANNEL_POST,
      name: 'Community Posts',
      description: 'Alerts when new community notices and announcements are posted',
      importance: 3,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // ignore channel creation errors on older Android versions
  }

  try {
    await AzadariBackgroundSync.setAlertsEnabled({ enabled: true });
    await AzadariBackgroundSync.ensureScheduled();
  } catch {
    // ignore if running in web fallback
  }
}

/**
 * Prompts Android notification permission dialog if possible, and if the OS
 * blocks the dialog (permanently denied or disabled in Settings), opens the
 * app's Android Notification Settings screen.
 */
export async function promptToAllowNativeNotifications(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return true;
  }

  await ensureNotificationChannelsAndSchedule();

  try {
    await LocalNotifications.requestPermissions();
  } catch {
    // ignore request error
  }

  const allowed = await isNativeNotificationAllowed();
  if (allowed) {
    return true;
  }

  try {
    await AzadariBackgroundSync.openNotificationSettings();
  } catch {
    // ignore settings launch error
  }
  return false;
}

/**
 * Always checks on APK startup whether notifications are allowed; if not allowed,
 * asks Android permission first and reports status to display an in-app Allow prompt
 * when notifications remain blocked/denied.
 */
export async function initBackgroundNotificationSync(
  onNavigateRoute: (routeHash: string) => void,
  onPermissionStatusChange?: (allowed: boolean) => void
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) {
    onPermissionStatusChange?.(true);
    return () => {};
  }

  await ensureNotificationChannelsAndSchedule();

  let allowed = await isNativeNotificationAllowed();
  if (!allowed) {
    try {
      await LocalNotifications.requestPermissions();
    } catch {
      // ignore request error
    }
    allowed = await isNativeNotificationAllowed();
  }
  onPermissionStatusChange?.(allowed);

  const handles: PluginListenerHandle[] = [];

  try {
    const routeHandle = await AzadariBackgroundSync.addListener('notificationRoute', (data) => {
      if (data?.route) {
        onNavigateRoute(data.route);
      }
    });
    handles.push(routeHandle);
  } catch {
    // ignore listener error
  }

  try {
    const localActionHandle = await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action) => {
        const route = (action?.notification?.extra as { route?: string } | undefined)?.route;
        if (route) {
          onNavigateRoute(route);
        }
      }
    );
    handles.push(localActionHandle);
  } catch {
    // ignore listener error
  }

  try {
    const pending = await AzadariBackgroundSync.consumePendingRoute();
    if (pending?.route) {
      onNavigateRoute(pending.route);
    }
  } catch {
    // ignore pending route errors
  }

  const onVisibilityChange = () => {
    if (!document.hidden) {
      void isNativeNotificationAllowed().then((nowAllowed) => {
        onPermissionStatusChange?.(nowAllowed);
      });
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    for (const h of handles) {
      h.remove().catch(() => {});
    }
  };
}

function resolveNotificationRoute(item: FeedNotificationItem): string {
  if (item.kind === 'live') {
    return '#/watch/live?from=live';
  }
  if (item.kind === 'video' && item.youtubeId) {
    return `#/watch/${encodeURIComponent(item.youtubeId)}?from=videos`;
  }
  return '#/posts';
}

function stableNotificationId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.max(1, Math.abs(hash));
}

function dispatchNativeNotification(item: FeedNotificationItem): void {
  if (!Capacitor.isNativePlatform()) {
    return;
  }
  const route = resolveNotificationRoute(item);
  const channelId =
    item.kind === 'live'
      ? CHANNEL_LIVE
      : item.kind === 'video'
        ? CHANNEL_VIDEO
        : CHANNEL_POST;

  LocalNotifications.schedule({
    notifications: [
      {
        id: stableNotificationId(item.id),
        title: item.title,
        body: item.body,
        channelId,
        smallIcon: 'ic_stat_azadari',
        iconColor: '#FF0000',
        extra: { route },
        schedule: { at: new Date(Date.now() + 200) },
      },
    ],
  }).catch(() => {});
}

/**
 * Compares newly loaded archive state against stored snapshot, syncs the native
 * Android WorkManager baseline so background & foreground stay deduplicated,
 * and dispatches APK notifications for new Live streams, videos, or community posts.
 */
export async function processFeedSyncNotifications(loaded: LoadedArchiveBundle): Promise<void> {
  const prevSnapshot = readStoredSnapshot();
  const { notifications, nextSnapshot } = detectFeedUpdates(prevSnapshot, {
    live: loaded.live,
    videos: loaded.videos,
    posts: loaded.posts,
    latestVideoId: loaded.config.latest_video_id,
    latestVideoTitle: loaded.config.latest_video_title,
  });

  // Retain prior known IDs alongside current ones to prevent churn across months
  const mergedSnapshot: FeedSnapshot = prevSnapshot
    ? {
        ...nextSnapshot,
        knownVideoIds: Array.from(
          new Set([...nextSnapshot.knownVideoIds, ...prevSnapshot.knownVideoIds])
        ).slice(0, MAX_SNAPSHOT_IDS),
        knownPostIds: Array.from(
          new Set([...nextSnapshot.knownPostIds, ...prevSnapshot.knownPostIds])
        ).slice(0, MAX_SNAPSHOT_IDS),
      }
    : nextSnapshot;

  writeStoredSnapshot(mergedSnapshot);

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  AzadariBackgroundSync.syncBaseline({
    isLive: mergedSnapshot.isLive,
    liveVideoId: mergedSnapshot.liveVideoId,
    latestVideoId: mergedSnapshot.latestVideoId,
    knownVideoIds: mergedSnapshot.knownVideoIds,
    knownPostIds: mergedSnapshot.knownPostIds,
  }).catch(() => {});

  if (!prevSnapshot || notifications.length === 0) {
    return;
  }

  const allowed = await isNativeNotificationAllowed();
  if (!allowed) {
    return;
  }

  const liveAlerts = notifications.filter((n) => n.kind === 'live');
  const videoAlerts = notifications.filter((n) => n.kind === 'video');
  const postAlerts = notifications.filter((n) => n.kind === 'post');

  for (const item of liveAlerts) {
    dispatchNativeNotification(item);
  }

  if (videoAlerts.length <= 3) {
    for (const item of videoAlerts) {
      dispatchNativeNotification(item);
    }
  } else {
    dispatchNativeNotification({
      id: `notif_videos_batch_${videoAlerts[0].youtubeId || Date.now()}`,
      kind: 'video',
      title: `${videoAlerts.length} New Videos — Azadari Kopaganj`,
      body: `${videoAlerts[0].body} and ${videoAlerts.length - 1} more uploads.`,
      timestamp: videoAlerts[0].timestamp,
    });
  }

  if (postAlerts.length <= 3) {
    for (const item of postAlerts) {
      dispatchNativeNotification(item);
    }
  } else {
    dispatchNativeNotification({
      id: `notif_posts_batch_${Date.now()}`,
      kind: 'post',
      title: `${postAlerts.length} New Community Posts`,
      body: postAlerts[0].title,
      timestamp: postAlerts[0].timestamp,
    });
  }
}
