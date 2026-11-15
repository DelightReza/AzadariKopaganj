import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  FolderTree,
  Radio,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import type { AppConfig, LiveNowState } from '../types/archive';

interface GitHubBackendSectionProps {
  config: AppConfig;
  live: LiveNowState;
  onUpdateLiveState: (nextLive: LiveNowState) => Promise<void>;
  onTriggerRssSync: () => Promise<void>;
  isSyncingRss: boolean;
}

const CAPACITOR_CONFIG_SOURCE = `import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.azadarikopaganj.app',
  appName: 'Azadari Kopaganj',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    allowNavigation: [
      '*.youtube.com',
      '*.youtube-nocookie.com',
      '*.ytimg.com',
      'raw.githubusercontent.com',
      'github.com',
    ],
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#FF0000',
    },
  },
};

export default config;`;

const BUILD_APK_YML_SOURCE = `name: Build Android APK (Capacitor)

on:
  workflow_dispatch:
  push:
    branches: [ main ]

jobs:
  build-android-apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - uses: actions/setup-java@v4
        with:
          distribution: "temurin"
          java-version: "21"
      - name: Build Web Bundle & Sync Capacitor Android
        run: |
          npm install
          npm run build
          if [ ! -d "android" ]; then npx cap add android; fi
          npx cap sync android
      - name: Assemble Debug APK
        working-directory: android
        run: |
          chmod +x gradlew
          ./gradlew assembleDebug
      - uses: actions/upload-artifact@v4
        with:
          name: AzadariKopaganj-debug-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk`;

const UPDATE_VIDEOS_YML_SOURCE = `name: Update Azadari Kopaganj YouTube Feed & Manifests

on:
  schedule:
    - cron: "0 */4 * * *"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  sync-youtube-feed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: python3 update_feed.py
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add config.json assets/
          if ! git diff --cached --quiet; then
            git commit -m "chore(feed): sync YouTube videos, assets/livenow.json, and config.json [skip ci]"
            git push
          fi`;

const DEPLOY_PAGES_YML_SOURCE = `name: Deploy Azadari Kopaganj to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_run:
    workflows: ["Update Azadari Kopaganj YouTube Feed & Manifests"]
    types: [ completed ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: python3 update_feed.py
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm install
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4`;

const KOTLIN_RETROFIT_CLIENT_SOURCE = `interface AzadariArchiveApi {
    @GET("config.json")
    suspend fun getConfig(): AppConfig

    @GET("assets/livenow.json")
    suspend fun getLiveNow(): LiveNowState

    @GET
    suspend fun getMonthVideos(@Url videosPath: String): List<VideoDto>

    @GET
    suspend fun getMonthPosts(@Url postPath: String): List<CommunityPostDto>
}`;

type ArtifactTab = 'pages' | 'apk' | 'config' | 'livenow' | 'workflow' | 'kotlin';

export const GitHubBackendSection: React.FC<GitHubBackendSectionProps> = ({
  config,
  live,
  onUpdateLiveState,
  onTriggerRssSync,
  isSyncingRss,
}) => {
  const [activeTab, setActiveTab] = useState<ArtifactTab>('pages');
  const [copied, setCopied] = useState<boolean>(false);
  const [liveForm, setLiveForm] = useState<{
    is_live: boolean;
    title: string;
    youtube_id: string;
  }>({
    is_live: live.is_live,
    title: live.title || 'Shab-e-Juma Live Majlis — Sadar Imambara Kopaganj',
    youtube_id: live.youtube_id || config.latest_video_id || 'GOOvPNTUmtg',
  });
  const [savingLive, setSavingLive] = useState<boolean>(false);

  const getTabContent = (): { filename: string; content: string } => {
    switch (activeTab) {
      case 'pages':
        return {
          filename: '.github/workflows/deploy_pages.yml',
          content: DEPLOY_PAGES_YML_SOURCE,
        };
      case 'apk':
        return {
          filename: 'capacitor.config.ts + .github/workflows/build_android_apk.yml',
          content: `${CAPACITOR_CONFIG_SOURCE}\n\n# --- .github/workflows/build_android_apk.yml ---\n${BUILD_APK_YML_SOURCE}`,
        };
      case 'config':
        return {
          filename: 'config.json',
          content: JSON.stringify(config, null, 2),
        };
      case 'livenow':
        return {
          filename: 'assets/livenow.json',
          content: JSON.stringify(live, null, 2),
        };
      case 'workflow':
        return {
          filename: '.github/workflows/update_videos.yml',
          content: UPDATE_VIDEOS_YML_SOURCE,
        };
      case 'kotlin':
        return {
          filename: 'AzadariArchiveApi.kt',
          content: KOTLIN_RETROFIT_CLIENT_SOURCE,
        };
    }
  };

  const currentArtifact = getTabContent();

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(currentArtifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadArtifact = () => {
    const blob = new Blob([currentArtifact.content + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentArtifact.filename.split(' ')[0].split('/').pop() || 'config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveLiveToggle = async (nextIsLive: boolean) => {
    setSavingLive(true);
    setLiveForm((prev) => ({ ...prev, is_live: nextIsLive }));
    try {
      await onUpdateLiveState({
        is_live: nextIsLive,
        title: nextIsLive ? liveForm.title : '',
        youtube_id: nextIsLive ? liveForm.youtube_id : '',
      });
    } finally {
      setSavingLive(false);
    }
  };

  return (
    <section
      id="android-apk"
      aria-labelledby="backend-heading"
      className="py-6 scroll-mt-16"
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6">
          <div>
            <h2
              id="backend-heading"
              className="font-display text-xl sm:text-2xl font-bold text-[#0F0F0F] dark:text-[#F1F1F1]"
            >
              GitHub Pages, Android APK (Capacitor) &amp; Backend
            </h2>
            <p className="text-xs text-[#606060] dark:text-[#AAAAAA] font-mono mt-0.5">
              https://github.com/DelightReza/AzadariKopaganj · Single config.json &amp; assets/livenow.json
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href="https://github.com/DelightReza/AzadariKopaganj/actions"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 text-xs font-medium rounded-full bg-[#F2F2F2] dark:bg-[#272727] text-[#0F0F0F] dark:text-[#F1F1F1] hover:bg-neutral-200 dark:hover:bg-[#3F3F3F] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Open GitHub Actions</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={onTriggerRssSync}
              disabled={isSyncingRss}
              className="px-4 py-2 text-xs font-semibold rounded-full bg-[#FF0000] text-white hover:bg-[#CC0000] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingRss ? 'animate-spin' : ''}`} />
              <span>{isSyncingRss ? 'Syncing RSS...' : 'Run update_feed.py Sync'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 5 Columns: Capacitor APK Build Steps + Single Manifest Tree + Live Controller */}
          <div className="lg:col-span-5 space-y-5">
            {/* Capacitor Android APK & GitHub Pages Card */}
            <div className="bg-[#F8F8F8] dark:bg-[#181818] border border-neutral-200 dark:border-[#272727] rounded-2xl p-5">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-[#272727]">
                <h3 className="font-display text-base font-bold text-[#0F0F0F] dark:text-[#F1F1F1] inline-flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#FF0000]" />
                  <span>GitHub Pages &amp; Android APK (Capacitor)</span>
                </h3>
                <span className="text-xs font-mono text-[#606060] dark:text-[#AAAAAA]">
                  com.azadarikopaganj.app
                </span>
              </div>

              <div className="mt-3 space-y-2.5 text-xs text-[#303030] dark:text-[#CCCCCC]">
                <p>
                  <strong>1. GitHub Pages Auto-Deploy (<code className="font-mono">deploy_pages.yml</code>):</strong> In{' '}
                  <code className="font-mono">DelightReza/AzadariKopaganj</code> Settings → Pages → Build and deployment, select{' '}
                  <strong>GitHub Actions</strong> as the Source. Every push or 4-hour feed sync builds <code className="font-mono">dist/</code> (including <code className="font-mono">config.json</code> and <code className="font-mono">assets/</code>) and deploys automatically.
                </p>
                <p>
                  <strong>2. Cloud Android APK (<code className="font-mono">build_android_apk.yml</code>):</strong> Run the workflow in GitHub Actions to download <code className="font-mono">app-debug.apk</code>, or build locally:
                </p>
                <pre className="p-3 rounded-xl bg-[#0F0F0F] text-neutral-200 font-mono text-[11px] overflow-x-auto leading-relaxed">
{`npm install
npm run cap:add:android
npm run cap:sync
cd android && ./gradlew assembleDebug`}
                </pre>
              </div>
            </div>

            {/* Clean Single-File Repository Layout */}
            <div className="bg-[#F8F8F8] dark:bg-[#181818] border border-neutral-200 dark:border-[#272727] rounded-2xl p-5">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-[#272727]">
                <h3 className="font-display text-base font-bold text-[#0F0F0F] dark:text-[#F1F1F1] inline-flex items-center gap-2">
                  <FolderTree className="w-4 h-4 text-[#FF0000]" />
                  <span>Streamlined Repository Endpoints</span>
                </h3>
                <span className="text-xs font-mono text-[#606060] dark:text-[#AAAAAA]">
                  Zero Duplicates
                </span>
              </div>

              <pre className="mt-3 font-mono text-xs leading-relaxed text-[#303030] dark:text-[#CCCCCC] overflow-x-auto">
{`├── config.json              # Single base discovery manifest
├── capacitor.config.ts      # Capacitor Android APK configuration
├── update_feed.py           # Python 3 RSS & /live scraper
├── .github/workflows/
│   ├── deploy_pages.yml     # GitHub Pages auto-deploy Action
│   ├── update_videos.yml    # Cron (every 4h) + manual trigger
│   └── build_android_apk.yml # Cloud Android APK builder
└── assets/
    ├── livenow.json         # Single active live stream state
    └── YYYY/MM/
        ├── videos.json      # Monthly uploads & past streams
        └── post.json        # Community notices`}
              </pre>
            </div>

            {/* Live Stream State Controller (assets/livenow.json) */}
            <div className="bg-[#F8F8F8] dark:bg-[#181818] border border-neutral-200 dark:border-[#272727] rounded-2xl p-5">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-[#272727]">
                <h3 className="font-display text-base font-bold text-[#0F0F0F] dark:text-[#F1F1F1] inline-flex items-center gap-2">
                  <Radio className="w-4 h-4 text-[#FF0000]" />
                  <span>Live Broadcast State (assets/livenow.json)</span>
                </h3>
                <span className="text-xs font-mono text-[#606060] dark:text-[#AAAAAA]">
                  {live.is_live ? 'LIVE' : 'OFFLINE'}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="live-title-input"
                    className="block text-xs font-medium text-[#0F0F0F] dark:text-[#F1F1F1] mb-1"
                  >
                    Live Stream Title
                  </label>
                  <input
                    id="live-title-input"
                    type="text"
                    value={liveForm.title}
                    onChange={(e) => setLiveForm({ ...liveForm, title: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-neutral-300 dark:border-[#303030] rounded-lg bg-white dark:bg-[#0F0F0F] text-[#0F0F0F] dark:text-[#F1F1F1]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="live-vid-input"
                    className="block text-xs font-medium text-[#0F0F0F] dark:text-[#F1F1F1] mb-1"
                  >
                    Live YouTube Video ID
                  </label>
                  <input
                    id="live-vid-input"
                    type="text"
                    value={liveForm.youtube_id}
                    onChange={(e) => setLiveForm({ ...liveForm, youtube_id: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs font-mono border border-neutral-300 dark:border-[#303030] rounded-lg bg-white dark:bg-[#0F0F0F] text-[#0F0F0F] dark:text-[#F1F1F1]"
                  />
                </div>

                <button
                  type="button"
                  disabled={savingLive}
                  onClick={() => handleSaveLiveToggle(!live.is_live)}
                  className={`px-4 py-2 text-xs font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    live.is_live
                      ? 'bg-[#272727] text-white hover:bg-[#3F3F3F]'
                      : 'bg-[#FF0000] text-white hover:bg-[#CC0000]'
                  }`}
                >
                  {live.is_live
                    ? 'End Live Stream (is_live: false)'
                    : 'Simulate Live Stream (is_live: true)'}
                </button>
              </div>
            </div>
          </div>

          {/* Right 7 Columns: Interactive Manifest & APK Config Inspector */}
          <div className="lg:col-span-7 bg-[#181818] text-[#F1F1F1] rounded-2xl border border-[#272727] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#0F0F0F] border-b border-[#272727]">
              <div
                role="tablist"
                aria-label="Repository manifest and Capacitor APK files"
                className="flex flex-wrap items-center gap-1.5"
              >
                {(
                  [
                    { id: 'pages', label: 'deploy_pages.yml' },
                    { id: 'apk', label: 'Capacitor APK' },
                    { id: 'config', label: 'config.json' },
                    { id: 'livenow', label: 'assets/livenow.json' },
                    { id: 'workflow', label: 'update_videos.yml' },
                    { id: 'kotlin', label: '@GET("config.json") Kotlin' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    role="tab"
                    type="button"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-[#FF0000] text-white'
                        : 'text-[#AAAAAA] hover:text-white hover:bg-[#272727]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-2.5 py-1 text-xs font-mono border border-[#3F3F3F] rounded-lg text-neutral-300 hover:bg-[#272727] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadArtifact}
                  className="px-2.5 py-1 text-xs font-mono border border-[#3F3F3F] rounded-lg text-neutral-300 hover:bg-[#272727] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            <div className="px-5 py-2.5 bg-[#181818] border-b border-[#272727] flex items-center justify-between text-xs font-mono text-[#AAAAAA]">
              <span className="inline-flex items-center gap-1.5">
                {currentArtifact.filename.endsWith('.json') ? (
                  <FileJson className="w-3.5 h-3.5 text-[#FF0000]" />
                ) : (
                  <FileCode2 className="w-3.5 h-3.5 text-[#FF0000]" />
                )}
                <span>{currentArtifact.filename}</span>
              </span>
              <span>DelightReza/AzadariKopaganj</span>
            </div>

            <pre className="p-5 font-mono text-xs leading-relaxed text-neutral-200 overflow-x-auto max-h-[520px]">
              {currentArtifact.content}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
};
