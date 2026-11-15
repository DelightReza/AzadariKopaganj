import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEndpointTemplate,
  normalizeRelativeAssetUrl,
  extractYouTubeId,
  validateCommunityPostDraft,
  createCommunityPost,
  mergeCommunityPosts,
  detectFeedUpdates,
  filterVideos,
  filterPosts,
} from './archiveLogic';

test('resolveEndpointTemplate replaces {yyyy} and zero-pads {mm}', () => {
  assert.equal(
    resolveEndpointTemplate('assets/{yyyy}/{mm}/videos.json', '2026', '9'),
    'assets/2026/09/videos.json'
  );
  assert.equal(
    resolveEndpointTemplate('assets/{yyyy}/{mm}/post.json', '2026', '10'),
    'assets/2026/10/post.json'
  );
});

test('normalizeRelativeAssetUrl supports root and GitHub Pages repository subpaths', () => {
  assert.equal(normalizeRelativeAssetUrl('assets/2026/10/videos.json', './'), './assets/2026/10/videos.json');
  assert.equal(
    normalizeRelativeAssetUrl('/assets/livenow.json', '/azadari-kopaganj/'),
    '/azadari-kopaganj/assets/livenow.json'
  );
});

test('extractYouTubeId extracts 11-char IDs from URLs and raw IDs', () => {
  assert.equal(extractYouTubeId('GOOvPNTUmtg'), 'GOOvPNTUmtg');
  assert.equal(extractYouTubeId('https://www.youtube.com/watch?v=GOOvPNTUmtg&t=12s'), 'GOOvPNTUmtg');
  assert.equal(extractYouTubeId('https://youtu.be/9bZkp7q19f0'), '9bZkp7q19f0');
  assert.equal(extractYouTubeId('https://img.youtube.com/vi/M7lc1UVf-VE/hqdefault.jpg'), 'M7lc1UVf-VE');
  assert.equal(extractYouTubeId('invalid-id'), '');
});

test('validateCommunityPostDraft validates required fields and date format', () => {
  const invalid = validateCommunityPostDraft({
    date: '28-10-2026',
    title: 'Hi',
    text: '',
    image_url: '',
    link_url: 'ftp://bad',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.date);
  assert.ok(invalid.errors.title);
  assert.ok(invalid.errors.text);
  assert.ok(invalid.errors.link_url);

  const valid = validateCommunityPostDraft({
    date: '2026-11-03',
    title: 'Weekly Shab-e-Juma Majlis Notice',
    text: 'Majlis starts after Maghribain prayers at Sadar Imambara.',
    image_url: 'https://img.youtube.com/vi/GOOvPNTUmtg/hqdefault.jpg',
    link_url: 'https://www.youtube.com/watch?v=GOOvPNTUmtg',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});

test('createCommunityPost and mergeCommunityPosts produce sorted schema-compliant notices', () => {
  const created = createCommunityPost(
    {
      date: '2026-11-03',
      title: 'New Muharram Archive Release',
      text: 'Uploaded new recordings.',
      image_url: '',
      link_url: 'https://www.youtube.com/watch?v=GOOvPNTUmtg',
    },
    1
  );
  assert.equal(created.id, 'post_2026_11_03_2');
  assert.equal(created.image_url, 'https://img.youtube.com/vi/GOOvPNTUmtg/hqdefault.jpg');
  assert.equal(created.month_key, '2026-11');

  const merged = mergeCommunityPosts(
    [
      {
        id: 'post_2026_10_15',
        date: '2026-10-15',
        title: 'Older Post',
        text: 'Old body',
        image_url: 'https://img.youtube.com/vi/GOOvPNTUmtg/hqdefault.jpg',
        link_url: 'https://www.youtube.com/watch?v=GOOvPNTUmtg',
      },
    ],
    created
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'post_2026_11_03_2');
});

test('detectFeedUpdates identifies new live streams, new video uploads, and new posts', () => {
  const prevSnapshot = {
    latestVideoId: 'GOOvPNTUmtg',
    isLive: false,
    liveVideoId: '',
    knownVideoIds: ['GOOvPNTUmtg'],
    knownPostIds: ['post_2026_10_28'],
  };

  const { notifications, nextSnapshot } = detectFeedUpdates(
    prevSnapshot,
    {
      live: { is_live: true, title: 'Live Shab-e-Juma Majlis', youtube_id: 'LIVE1234567' },
      videos: [
        {
          id: 'NEWVID12345',
          title: 'New Majlis Upload',
          youtube_id: 'NEWVID12345',
          published: '2026-11-03T10:00:00Z',
          thumbnail: 'https://img.youtube.com/vi/NEWVID12345/hqdefault.jpg',
        },
        {
          id: 'GOOvPNTUmtg',
          title: 'Existing Video',
          youtube_id: 'GOOvPNTUmtg',
          published: '2026-10-28T18:30:00Z',
          thumbnail: 'https://img.youtube.com/vi/GOOvPNTUmtg/hqdefault.jpg',
        },
      ],
      posts: [
        {
          id: 'post_2026_11_03',
          date: '2026-11-03',
          title: 'New Community Announcement',
          text: 'Join us tonight.',
          image_url: 'https://img.youtube.com/vi/GOOvPNTUmtg/hqdefault.jpg',
          link_url: 'https://www.youtube.com/watch?v=GOOvPNTUmtg',
        },
      ],
      latestVideoId: 'NEWVID12345',
      latestVideoTitle: 'New Majlis Upload',
    },
    '2026-11-03T10:05:00Z'
  );

  assert.equal(notifications.length, 3);
  assert.equal(notifications[0].kind, 'live');
  assert.equal(notifications[1].kind, 'video');
  assert.equal(notifications[2].kind, 'post');
  assert.equal(nextSnapshot.isLive, true);
  assert.ok(nextSnapshot.knownVideoIds.includes('NEWVID12345'));
});

test('filterVideos and filterPosts filter by month, query, and watchlist', () => {
  const videos = [
    {
      id: 'GOOvPNTUmtg',
      title: 'Shab-e-Ashura Majlis',
      youtube_id: 'GOOvPNTUmtg',
      published: '2026-10-28T18:30:00Z',
      thumbnail: '',
      month_key: '2026-10',
    },
    {
      id: 'aqz-KE-bpKQ',
      title: 'Wafat Bibi Sakina Majlis',
      youtube_id: 'aqz-KE-bpKQ',
      published: '2026-09-24T17:15:00Z',
      thumbnail: '',
      month_key: '2026-09',
    },
  ];

  assert.equal(filterVideos(videos, { monthKey: '2026-09' }).length, 1);
  assert.equal(filterVideos(videos, { searchQuery: 'ashura' }).length, 1);
  assert.equal(
    filterVideos(videos, { watchlistOnly: true, watchlistIds: ['aqz-KE-bpKQ'] })[0].youtube_id,
    'aqz-KE-bpKQ'
  );

  const posts = [
    {
      id: 'post_1',
      date: '2026-10-28',
      title: 'October Notice',
      text: 'Sadar Imambara',
      image_url: '',
      link_url: '',
      month_key: '2026-10',
    },
  ];
  assert.equal(filterPosts(posts, { monthKey: '2026-09' }).length, 0);
  assert.equal(filterPosts(posts, { monthKey: '2026-10', searchQuery: 'imambara' }).length, 1);
});
