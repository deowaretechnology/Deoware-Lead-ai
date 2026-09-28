'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { Conversation, INBOX_PLATFORM_STYLES, InboxMessage, INTENT_STYLES } from '@/types';
import ThreadView from '@/components/ThreadView';
import SimulateMessagePanel from '@/components/SimulateMessagePanel';

type Filter = 'open' | 'unread' | 'leads' | 'archived';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'leads', label: 'Leads' },
  { key: 'archived', label: 'Archived' },
];

const POLL_MS = 15000;

function timeAgo(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function InboxPage() {
  const [filter, setFilter] = useState<Filter>('open');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ conversation: Conversation; messages: InboxMessage[] } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tick, setTick] = useState(0); // bump to force a refresh

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Conversation list: load on filter change / refresh, then poll
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .get('/inbox/conversations', { params: { filter } })
        .then((res) => {
          if (cancelled) return;
          setConversations(res.data.data);
          setNow(Date.now());
          setError('');
        })
        .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load inbox')))
        .finally(() => !cancelled && setLoading(false));
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [filter, tick]);

  // Open thread: load on select / refresh, then poll
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const load = () =>
      api
        .get(`/inbox/conversations/${selectedId}`)
        .then((res) => {
          if (cancelled) return;
          setThread(res.data.data);
          // Opening marks it read - reflect that in the list immediately
          setConversations((prev) => prev.map((c) => (c._id === selectedId ? { ...c, unreadCount: 0 } : c)));
        })
        .catch(() => {});
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedId, tick]);

  const openConversation = (id: string) => {
    setThread(null);
    setSelectedId(id);
  };

  const activeThread = thread && thread.conversation._id === selectedId ? thread : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Inbox</h1>
          <p className="text-sm text-slate-500">Instagram, Facebook and WhatsApp messages + comments in one place</p>
        </div>
        <SimulateMessagePanel
          onSimulated={(id) => {
            setFilter('open');
            setSelectedId(id);
            refresh();
          }}
        />
      </div>

      <div className="grid h-[calc(100vh-12rem)] min-h-[480px] overflow-hidden rounded-2xl border border-slate-200 bg-white md:grid-cols-[320px_1fr]">
        {/* List */}
        <div className={`flex min-h-0 flex-col border-slate-200 md:border-r ${selectedId ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex gap-1 border-b border-slate-200 p-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  filter === f.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
            {error && <p className="p-4 text-sm text-rose-600">{error}</p>}
            {!loading && !error && conversations.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-400">
                {filter === 'open' ? 'No messages yet. Once Meta webhooks are connected, DMs and comments show up here.' : 'Nothing here.'}
              </p>
            )}
            {conversations.map((c) => {
              const p = INBOX_PLATFORM_STYLES[c.platform];
              const intent = INTENT_STYLES[c.intent];
              const name = c.name || (c.username ? `@${c.username}` : `${p.label} user`);
              return (
                <button
                  key={c._id}
                  onClick={() => openConversation(c._id)}
                  className={`flex w-full gap-3 border-b border-slate-100 px-3 py-3 text-left transition hover:bg-slate-50 ${
                    selectedId === c._id ? 'bg-slate-50' : ''
                  }`}
                >
                  <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${p.className}`}>
                    {p.short}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`truncate text-sm ${c.unreadCount ? 'font-semibold text-slate-900' : 'text-slate-800'}`}>{name}</span>
                      {c.channelType === 'comment' && <span className="text-[10px] text-slate-400">comment</span>}
                      <span className="ml-auto flex-shrink-0 text-[11px] text-slate-400">{timeAgo(c.lastMessageAt, now)}</span>
                    </span>
                    <span className={`block truncate text-xs ${c.unreadCount ? 'text-slate-700' : 'text-slate-500'}`}>{c.lastMessagePreview}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {intent && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${intent.className}`}>{intent.label}</span>}
                      {c.lead && <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white">Lead</span>}
                      {c.unreadCount > 0 && (
                        <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{c.unreadCount}</span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread */}
        <div className={`min-h-0 ${selectedId ? 'flex flex-col' : 'hidden md:flex md:flex-col'}`}>
          {activeThread ? (
            <ThreadView
              conversation={activeThread.conversation}
              messages={activeThread.messages}
              now={now}
              onBack={() => setSelectedId(null)}
              onReload={refresh}
            />
          ) : selectedId ? (
            <p className="p-6 text-sm text-slate-500">Loading conversation…</p>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-400">
              Select a conversation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
