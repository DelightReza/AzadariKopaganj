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
  matchesVideoTopic,
  extractVideoViewCount,
  formatCompactViewCount,
  getPopularVideos,
  isShortVideo,
  getPostImages,
  toUncroppedPostImageUrl,
} from './archiveLogic';
import { formatPlayerTime, formatQualityLabel } from './youtubePlayerApi';

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

test('matchesVideoTopic and filterVideos match Jashn, Majlis, Nauha, and Qaseeda variants accurately', () => {
  // Jashn variants
  assert.equal(matchesVideoTopic('Jashn-e-Wiladat Imam Husain', 'jashn'), true);
  assert.equal(matchesVideoTopic('Jashan e Sadeqain Kopaganj', 'jashn'), true);
  assert.equal(matchesVideoTopic('Jashne Bahar Mahfil 2025', 'jashn'), true);

  // Majlis variants (without matching unrelated words like Majboor)
  assert.equal(matchesVideoTopic('Shab-e-Juma Majlis Kopaganj', 'majlis'), true);
  assert.equal(matchesVideoTopic('Majalis e Aza 2024', 'majlis'), true);
  assert.equal(matchesVideoTopic('Majboor Hai Ye Zindagi', 'majlis'), false);

  // Nauha variants (without matching unrelated words like Nahi or Zuljanah)
  assert.equal(matchesVideoTopic('New Nauha 2026 Kopaganj', 'nauha'), true);
  assert.equal(matchesVideoTopic('Mere Bhai Asghar Noha', 'nauha'), true);
  assert.equal(matchesVideoTopic('Main So Nahi Pae | 14 Muharram', 'nauha'), false);
  assert.equal(matchesVideoTopic('Zuljanah Juloos Kopaganj', 'nauha'), false);

  // Qaseeda + Manqabat variants (without matching Qasim)
  assert.equal(matchesVideoTopic('Qaseeda By Hashim Ali', 'qaseeda'), true);
  assert.equal(matchesVideoTopic('Fatima (SA) Aagyi | Qasida', 'qaseeda'), true);
  assert.equal(matchesVideoTopic('17 Rabiul Awwal Manqabat', 'qaseeda'), true);
  assert.equal(matchesVideoTopic('Maulana Manqbat Special', 'qaseeda'), true);
  assert.equal(matchesVideoTopic('Dr Qasim Husain Speech', 'qaseeda'), false);

  const sampleVideos = [
    { id: '1', youtube_id: '1', title: 'Jashan e Maula Ali', published: '2026-01-01T00:00:00Z', thumbnail: '' },
    { id: '2', youtube_id: '2', title: 'Majalis e Muharram', published: '2026-01-02T00:00:00Z', thumbnail: '' },
    { id: '3', youtube_id: '3', title: 'Noha Khwani Kopaganj', published: '2026-01-03T00:00:00Z', thumbnail: '' },
    { id: '4', youtube_id: '4', title: 'Manqbat & Qasida', published: '2026-01-04T00:00:00Z', thumbnail: '' },
  ];

  assert.equal(filterVideos(sampleVideos, { topic: 'jashn' })[0].id, '1');
  assert.equal(filterVideos(sampleVideos, { topic: 'majlis' })[0].id, '2');
  assert.equal(filterVideos(sampleVideos, { topic: 'nauha' })[0].id, '3');
  assert.equal(filterVideos(sampleVideos, { topic: 'qaseeda' })[0].id, '4');
});

test('formatPlayerTime formats seconds into mm:ss and hh:mm:ss cleanly', () => {
  assert.equal(formatPlayerTime(0), '0:00');
  assert.equal(formatPlayerTime(65), '1:05');
  assert.equal(formatPlayerTime(3661), '1:01:01');
  assert.equal(formatPlayerTime(Number.NaN), '0:00');
});

test('formatQualityLabel formats YouTube quality levels cleanly', () => {
  assert.equal(formatQualityLabel('auto'), 'Auto');
  assert.equal(formatQualityLabel('hd1080'), '1080p HD');
  assert.equal(formatQualityLabel('hd1080', true), '1080p');
  assert.equal(formatQualityLabel('hd720'), '720p HD');
  assert.equal(formatQualityLabel('large'), '480p');
  assert.equal(formatQualityLabel('medium'), '360p');
  assert.equal(formatQualityLabel('small'), '240p');
  assert.equal(formatQualityLabel('tiny'), '144p');
});

test('extractVideoViewCount, formatCompactViewCount, and getPopularVideos sort by popularity', () => {
  assert.equal(
    extractVideoViewCount({ title: 'Karbala Ho Gayi Tayyar, 34 thousand views - play Short' }),
    34000
  );
  assert.equal(
    extractVideoViewCount({ title: 'Bik Nahi Sakte Husaini, 9.6 thousand views - play Short' }),
    9600
  );
  assert.equal(extractVideoViewCount({ title: 'Majlis e Aza Kopaganj', views: 18000 }), 18000);
  assert.equal(extractVideoViewCount({ title: 'Majlis e Aza Kopaganj' }), 0);

  assert.equal(formatCompactViewCount(34000), '34K views');
  assert.equal(formatCompactViewCount(9600), '9.6K views');
  assert.equal(formatCompactViewCount(0), '');

  const ranked = getPopularVideos(
    [
      { id: '1', youtube_id: '1', title: 'Short High Views', published: '2026-11-15T00:00:00Z', thumbnail: '', views: 34000, is_short: true },
      { id: '2', youtube_id: '2', title: 'Full Video A', published: '2025-07-01T00:00:00Z', thumbnail: '', views: 12000 },
      { id: '3', youtube_id: '3', title: 'Full Video B', published: '2023-07-18T00:00:00Z', thumbnail: '', views: 18000 },
    ],
    2
  );
  assert.deepEqual(
    ranked.map((v) => v.id),
    ['3', '2']
  );

  const orderedByConfig = getPopularVideos(
    [
      { id: '2', youtube_id: '2', title: 'Full Video A', published: '2025-07-01T00:00:00Z', thumbnail: '', views: 12000 },
      { id: '3', youtube_id: '3', title: 'Full Video B', published: '2023-07-18T00:00:00Z', thumbnail: '', views: 18000 },
    ],
    2,
    ['2', '3']
  );
  assert.deepEqual(
    orderedByConfig.map((v) => v.id),
    ['2', '3']
  );
});

test('isShortVideo detects vertical Shorts via is_short flag or title markers', () => {
  assert.equal(isShortVideo({ title: 'Karbala Ho Gayi Tayyar', is_short: true }), true);
  assert.equal(isShortVideo({ title: 'Ziyarat Roza e Hussain #shorts' }), true);
  assert.equal(isShortVideo({ title: 'Clip, 1.2K views - play Short' }), true);
  assert.equal(isShortVideo({ title: 'Full Majlis Kopaganj 2026', is_short: false }), false);
});

test('getPostImages and toUncroppedPostImageUrl strip 1:1 fcrop64 square crop params and deduplicate URLs', () => {
  assert.equal(
    toUncroppedPostImageUrl(
      'https://yt3.ggpht.com/mwQt8euHJW5_XA084lHu0cUutLuWBw876YiU3uD5Lqkh_MiWs2kiRLCR6gb3uNu66QH0UErDDs3N8g=s1706-c-fcrop64=1,000012afffffbd48-rw-nd-v1'
    ),
    'https://yt3.ggpht.com/mwQt8euHJW5_XA084lHu0cUutLuWBw876YiU3uD5Lqkh_MiWs2kiRLCR6gb3uNu66QH0UErDDs3N8g=s0'
  );

  assert.deepEqual(
    getPostImages({
      image_url:
        'https://yt3.ggpht.com/poster1=s1706-c-fcrop64=1,000012afffffbd48-rw-nd-v1',
      images: [
        '//yt3.ggpht.com/poster1=s1706-c-fcrop64=1,000012afffffbd48-rw-nd-v1',
        'https://yt3.ggpht.com/poster2=s3120-c-fcrop64=1,20000000dfffffff-rw-nd-v1',
        '  ',
        'https://yt3.ggpht.com/poster3=s1080-c-fcrop64=1,00001bd2ffffdbd2-rw-nd-v1',
      ],
    }),
    [
      'https://yt3.ggpht.com/poster1=s0',
      'https://yt3.ggpht.com/poster2=s0',
      'https://yt3.ggpht.com/poster3=s0',
    ]
  );

  assert.deepEqual(getPostImages({ image_url: '' }), []);
});
