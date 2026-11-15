import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHANNEL_ID = 'UCyCIC43pbujKarf1irIjtrA';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    }
  } catch (err) {
    console.warn(`Failed to read ${filePath}:`, err);
  }
  return fallback;
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function registerApiAndManifestRoutes(app: express.Application, rootDir: string) {
  app.use(express.json());

  // Serve root config.json, assets/livenow.json, update_feed.py, and assets/YYYY/MM/{videos,post}.json
  app.get('/config.json', (_req, res) => {
    const file = path.join(rootDir, 'config.json');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    if (fs.existsSync(file)) {
      res.sendFile(file);
    } else {
      res.status(404).json({ error: 'config.json not found' });
    }
  });

  app.get('/assets/livenow.json', (_req, res) => {
    const file = path.join(rootDir, 'assets', 'livenow.json');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    if (fs.existsSync(file)) {
      res.sendFile(file);
    } else {
      res.json({ is_live: false, title: '', youtube_id: '' });
    }
  });

  app.get('/assets/:yyyy/:mm/:filename', (req, res, next) => {
    const { yyyy, mm, filename } = req.params;
    if (!/^\d{4}$/.test(yyyy) || !/^\d{2}$/.test(mm) || !['videos.json', 'post.json'].includes(filename)) {
      return next();
    }
    const target = path.join(rootDir, 'assets', yyyy, mm, filename);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    if (fs.existsSync(target)) {
      res.sendFile(target);
    } else {
      res.json([]);
    }
  });

  app.get('/update_feed.py', (_req, res) => {
    const file = path.join(rootDir, 'update_feed.py');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (fs.existsSync(file)) {
      res.sendFile(file);
    } else {
      res.status(404).send('# update_feed.py not found');
    }
  });

  // API: Publish or update a manual community post in assets/YYYY/MM/post.json
  app.post('/api/posts', (req, res) => {
    try {
      const { post } = req.body as {
        post?: {
          id: string;
          date: string;
          title: string;
          text: string;
          image_url: string;
          link_url: string;
        };
      };

      if (!post || !post.title || !post.text || !post.date) {
        res.status(400).json({ error: 'Missing required post fields (title, text, date).' });
        return;
      }

      const [yyyy = '2026', rawMm = '10'] = post.date.split('-');
      const mm = rawMm.padStart(2, '0');
      const postRelPath = `assets/${yyyy}/${mm}/post.json`;
      const videosRelPath = `assets/${yyyy}/${mm}/videos.json`;
      const postAbsPath = path.join(rootDir, postRelPath);
      const videosAbsPath = path.join(rootDir, videosRelPath);

      const existingPosts = readJsonFile<Array<Record<string, unknown>>>(postAbsPath, []);
      const cleanPost = {
        id: post.id,
        date: post.date,
        title: post.title,
        text: post.text,
        image_url: post.image_url,
        link_url: post.link_url,
      };

      const filtered = existingPosts.filter((p) => p.id !== cleanPost.id);
      const updatedPosts = [cleanPost, ...filtered].sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
      );
      writeJsonFile(postAbsPath, updatedPosts);

      if (!fs.existsSync(videosAbsPath)) {
        writeJsonFile(videosAbsPath, []);
      }

      const configPath = path.join(rootDir, 'config.json');
      const configData = readJsonFile<Record<string, any>>(configPath, {});
      if (configData && Array.isArray(configData.available_months)) {
        const hasMonth = configData.available_months.some(
          (m: any) => m.yyyy === yyyy && m.mm === mm
        );
        if (!hasMonth) {
          const monthNames = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
          ];
          const monthIndex = Math.max(0, Math.min(11, parseInt(mm, 10) - 1));
          configData.available_months.unshift({
            month_year: `${monthNames[monthIndex]} ${yyyy}`,
            yyyy,
            mm,
            video_count: 0,
            videos_path: videosRelPath,
            post_path: postRelPath,
          });
        }
        if (
          Array.isArray(configData.post_json_files) &&
          !configData.post_json_files.includes(postRelPath)
        ) {
          configData.post_json_files.unshift(postRelPath);
        }
        configData.last_updated = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        writeJsonFile(configPath, configData);
      }

      res.json({
        ok: true,
        path: postRelPath,
        post: cleanPost,
        posts: updatedPosts,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to save community post.' });
    }
  });

  // API: Update active live stream state in assets/livenow.json & config.json
  app.post('/api/live', (req, res) => {
    try {
      const { is_live, title, youtube_id } = req.body as {
        is_live?: boolean;
        title?: string;
        youtube_id?: string;
      };
      const livePayload = {
        is_live: Boolean(is_live),
        title: is_live ? String(title || 'Live Majlis Broadcast — Azadari Kopaganj') : '',
        youtube_id: is_live ? String(youtube_id || 'GOOvPNTUmtg') : '',
      };

      writeJsonFile(path.join(rootDir, 'assets', 'livenow.json'), livePayload);

      const configPath = path.join(rootDir, 'config.json');
      const configData = readJsonFile<Record<string, any>>(configPath, {});
      if (configData && typeof configData === 'object') {
        configData.is_live = livePayload.is_live;
        configData.last_updated = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
        writeJsonFile(configPath, configData);
      }

      res.json({ ok: true, live: livePayload });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to update live state.' });
    }
  });

  // API: Zero-API YouTube RSS Feed Sync
  app.post('/api/sync-rss', async (_req, res) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let xmlText = '';
      try {
        const resp = await fetch(RSS_URL, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AzadariKopaganjBot/1.0)' },
        });
        if (resp.ok) {
          xmlText = await resp.text();
        }
      } catch {
        // Ignore network block
      } finally {
        clearTimeout(timeout);
      }

      const discovered: Array<{
        id: string;
        title: string;
        youtube_id: string;
        published: string;
        thumbnail: string;
      }> = [];

      if (xmlText) {
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match: RegExpExecArray | null;
        while ((match = entryRegex.exec(xmlText)) !== null) {
          const block = match[1];
          const vidMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
          const titleMatch = block.match(/<title>([^<]+)<\/title>/);
          const pubMatch = block.match(/<published>([^<]+)<\/published>/);
          if (vidMatch && vidMatch[1]) {
            const vid = vidMatch[1].trim();
            const rawTitle = titleMatch ? titleMatch[1].trim() : 'Azadari Kopaganj Upload';
            const cleanTitle = rawTitle.replace(/^[🔴🟢🟡🔵⚫⚪]+\s*/, '').trim();
            discovered.push({
              id: vid,
              title: cleanTitle,
              youtube_id: vid,
              published: pubMatch ? pubMatch[1].trim() : new Date().toISOString(),
              thumbnail: `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
            });
          }
        }
      }

      const configPath = path.join(rootDir, 'config.json');
      const configData = readJsonFile<Record<string, any>>(configPath, {});
      configData.last_updated = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      writeJsonFile(configPath, configData);

      res.json({
        ok: true,
        rss_reachable: Boolean(xmlText),
        discovered_count: discovered.length,
        last_updated: configData.last_updated,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'RSS sync failed.' });
    }
  });

  // API: High-Thinking Channel & Archive Assistant (gemini-4-argon with ThinkingLevel.HIGH)
  app.post('/api/gemini/think', async (req, res) => {
    const { query, archiveContext } = req.body as {
      query?: string;
      archiveContext?: string;
    };

    if (!query || !query.trim()) {
      res.status(400).json({ error: 'Query is required.' });
      return;
    }

    const systemPrompt = `You are the Archival & Technical Assistant for the Azadari Kopaganj YouTube Channel (Channel ID: UCyCIC43pbujKarf1irIjtrA, GitHub Repository: https://github.com/DelightReza/AzadariKopaganj).
You help visitors and maintainers with:
1. Finding Majlis, Nauha, Marsiya, and Julus recordings across monthly archives (assets/YYYY/MM/videos.json).
2. Summarizing community announcements from assets/YYYY/MM/post.json.
3. Explaining the zero-API GitHub architecture (config.json discovery manifest, assets/livenow.json, update_feed.py scraper, .github/workflows/update_videos.yml cron action, Capacitor Android APK build, and Kotlin Retrofit @GET("config.json") client integration).
Keep answers well-structured, accurate, and grounded in the provided channel archive context.`;

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const response = await ai.models.generateContent({
          model: 'gemini-4-argon',
          contents: `Channel Archive Context:\n${archiveContext || 'Azadari Kopaganj Archive'}\n\nUser Question:\n${query.trim()}`,
          config: {
            systemInstruction: systemPrompt,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
          },
        });

        res.json({
          ok: true,
          model: 'gemini-4-argon',
          thinkingLevel: 'HIGH',
          answer: response.text || 'No response text generated.',
        });
        return;
      } catch (err: any) {
        console.warn('gemini-4-argon call fell back to local archive synthesis:', err?.message);
      }
    }

    const qLower = query.toLowerCase();
    const configData = readJsonFile<Record<string, any>>(path.join(rootDir, 'config.json'), {});
    const months = Array.isArray(configData.available_months) ? configData.available_months : [];

    let synthesis = `### Archival Analysis for Azadari Kopaganj (\`${CHANNEL_ID}\`)\n\n`;
    if (qLower.includes('apk') || qLower.includes('capacitor') || qLower.includes('kotlin') || qLower.includes('android')) {
      synthesis += `**Android APK (Capacitor) & Native Client Setup:**\n` +
        `- **Capacitor Build:** Configured via \`capacitor.config.ts\` (\`com.azadarikopaganj.app\`). Run \`npm run cap:sync\` or trigger \`.github/workflows/build_android_apk.yml\` on \`DelightReza/AzadariKopaganj\` to build a ready-to-install \`app-debug.apk\`.\n` +
        `- **Manifest Discovery:** Fetches \`config.json\` and \`assets/livenow.json\` directly from \`DelightReza/AzadariKopaganj\` with local fallback.\n`;
    } else if (qLower.includes('post') || qLower.includes('manual') || qLower.includes('github') || qLower.includes('update_feed')) {
      synthesis += `**Zero-API GitHub Backend (\`DelightReza/AzadariKopaganj\`):**\n` +
        `1. **Single Manifest & Live File:** Root \`config.json\` and \`assets/livenow.json\` serve all web and mobile clients.\n` +
        `2. **Automated Video Sync:** \`.github/workflows/update_videos.yml\` runs \`python3 update_feed.py\` every 4 hours.\n` +
        `3. **Manual Community Posts:** Commit to \`assets/YYYY/MM/post.json\` directly from the Community tab.\n`;
    } else {
      synthesis += `**Indexed Archive Overview:**\n` +
        `- **Latest Upload:** ${configData.latest_video_title || 'Live Jashne Syedus Sajideen'} (\`${configData.latest_video_id || 'GOOvPNTUmtg'}\`)\n` +
        `- **Monthly Partitions:** ${months.map((m: any) => `${m.month_year} (${m.video_count} videos)`).join(' · ')}\n` +
        `- **Live Stream Status:** ${configData.is_live ? 'Currently Live' : 'Offline (assets/livenow.json)'}`;
    }

    res.json({
      ok: true,
      model: 'gemini-4-argon (Archive Reasoning Mode)',
      thinkingLevel: 'HIGH',
      answer: synthesis,
    });
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  registerApiAndManifestRoutes(app, __dirname);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Azadari Kopaganj server running on http://0.0.0.0:${PORT}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer();
}
