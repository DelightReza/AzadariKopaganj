import React, { useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import type { AppConfig, CommunityPost, VideoItem } from '../types/archive';

interface ArchiveAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  videos: VideoItem[];
  posts: CommunityPost[];
}

const SUGGESTED_QUESTIONS = [
  'Summarize all Shab-e-Ashura and Muharram recordings across the monthly archives.',
  'How does the zero-API update_feed.py scraper and @GET("config.json") Retrofit client work together?',
  'What are the latest community notices and Majlis schedules in Kopaganj?',
];

export const ArchiveAssistantModal: React.FC<ArchiveAssistantModalProps> = ({
  isOpen,
  onClose,
  config,
  videos,
  posts,
}) => {
  const [query, setQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [responseState, setResponseState] = useState<{
    model: string;
    thinkingLevel: string;
    answer: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  if (!isOpen) return null;

  const runInquiry = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed) return;

    setLoading(true);
    setErrorMsg('');

    const archiveContext = JSON.stringify(
      {
        channel_name: config.channel_name,
        channel_id: config.channel_id,
        last_updated: config.last_updated,
        available_months: config.available_months,
        videos: videos.map((v) => ({
          id: v.youtube_id,
          title: v.title,
          published: v.published,
          month: v.month_label,
        })),
        posts: posts.map((p) => ({
          id: p.id,
          date: p.date,
          title: p.title,
          text: p.text,
        })),
      },
      null,
      2
    );

    try {
      const resp = await fetch('/api/gemini/think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmed,
          archiveContext,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        setErrorMsg(data.error || 'Failed to complete archive inquiry.');
      } else {
        setResponseState({
          model: data.model || 'gemini-4-argon',
          thinkingLevel: data.thinkingLevel || 'HIGH',
          answer: data.answer || '',
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error while querying archive assistant.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setErrorMsg('Please enter a question to analyze the channel archive.');
      return;
    }
    runInquiry(query);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="assistant-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-2xl bg-[#FBF9F5] dark:bg-[#1C1917] border border-[#D6CEBE] dark:border-[#292524] rounded-lg shadow-xl overflow-hidden">
        <div className="px-6 py-4 bg-[#F3EFE6] dark:bg-[#121110] border-b border-[#E5E0D5] dark:border-[#292524] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#9A3412] dark:text-[#FB923C]" />
            <h2
              id="assistant-modal-title"
              className="font-serif text-xl font-semibold text-[#1C1917] dark:text-[#F5F2EB]"
            >
              Deep Archive &amp; Manifest Reasoning
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Deep Archive Reasoning modal"
            className="p-1.5 text-[#57534E] dark:text-[#A8A29E] hover:text-[#1C1917] dark:hover:text-white rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E] font-mono">
            Engine: gemini-4-argon · ThinkingLevel.HIGH · Grounded in config.json, videos.json &amp; post.json
          </p>

          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setQuery(q);
                  runInquiry(q);
                }}
                className="text-left text-xs px-3 py-1.5 border border-[#D6CEBE] dark:border-[#44403C] rounded bg-[#F3EFE6]/60 dark:bg-[#292524]/60 text-[#1C1917] dark:text-[#F5F2EB] hover:border-[#9A3412] transition-colors cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <label htmlFor="assistant-query-input" className="sr-only">
              Ask a question about Azadari Kopaganj archive or GitHub backend
            </label>
            <input
              id="assistant-query-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask about Majlis recordings, schedules, or config.json endpoints..."
              className="flex-1 px-3.5 py-2 text-sm border border-[#D6CEBE] dark:border-[#44403C] rounded bg-white dark:bg-[#121110] text-[#1C1917] dark:text-[#F5F2EB]"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-medium bg-[#9A3412] text-white rounded hover:bg-[#7C2D12] inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Thinking...' : 'Analyze'}</span>
            </button>
          </form>

          {errorMsg && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {errorMsg}
            </p>
          )}

          {responseState && (
            <div className="p-4 bg-[#F3EFE6] dark:bg-[#121110] border border-[#E5E0D5] dark:border-[#292524] rounded space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#57534E] dark:text-[#A8A29E] pb-2 border-b border-[#E5E0D5] dark:border-[#292524]">
                <span>Model: {responseState.model}</span>
                <span>ThinkingLevel: {responseState.thinkingLevel}</span>
              </div>
              <div className="text-sm text-[#1C1917] dark:text-[#F5F2EB] whitespace-pre-wrap leading-relaxed">
                {responseState.answer}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
