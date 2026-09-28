'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { Conversation, INBOX_PLATFORM_STYLES, InboxMessage, INTENT_STYLES, STAGES } from '@/types';

interface Props {
  conversation: Conversation;
  messages: InboxMessage[];
  now: number; // passed in so render stays pure
  onBack: () => void;
  onReload: () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export default function ThreadView({ conversation, messages, now, onBack, onReload }: Props) {
  const [text, setText] = useState('');
  const [usedAi, setUsedAi] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const platform = INBOX_PLATFORM_STYLES[conversation.platform];
  const intent = INTENT_STYLES[conversation.intent];
  const displayName = conversation.name || (conversation.username ? `@${conversation.username}` : `${platform.label} user`);
  const windowClosed =
    conversation.channelType === 'dm' &&
    (!conversation.lastInboundAt || now - new Date(conversation.lastInboundAt).getTime() > DAY_MS);
  const stageLabel = conversation.lead ? STAGES.find((s) => s.key === conversation.lead!.stage)?.label : null;

  const draft = async () => {
    setError('');
    setDrafting(true);
    try {
      const res = await api.post(`/inbox/conversations/${conversation._id}/draft`);
      setText(res.data.data.text);
      setUsedAi(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not draft a reply'));
    } finally {
      setDrafting(false);
    }
  };

  const send = async () => {
    if (!text.trim()) return;
    setError('');
    setSending(true);
    try {
      await api.post(`/inbox/conversations/${conversation._id}/reply`, { text, sentBy: usedAi ? 'ai' : 'user' });
      setText('');
      setUsedAi(false);
      onReload();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not send'));
    } finally {
      setSending(false);
    }
  };

  const makeLead = async () => {
    setError('');
    setBusy(true);
    try {
      await api.post(`/inbox/conversations/${conversation._id}/lead`);
      onReload();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create lead'));
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    setBusy(true);
    try {
      await api.patch(`/inbox/conversations/${conversation._id}`, {
        status: conversation.status === 'archived' ? 'open' : 'archived',
      });
      onReload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
        <button onClick={onBack} className="text-sm text-slate-500 md:hidden">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${platform.className}`}>
              {platform.label} {conversation.channelType === 'comment' ? 'comment' : 'DM'}
            </span>
            {intent && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${intent.className}`}>{intent.label}</span>}
          </div>
          {conversation.intentSummary && <p className="truncate text-xs text-slate-500">AI: {conversation.intentSummary}</p>}
        </div>
        <div className="flex items-center gap-2">
          {conversation.lead ? (
            <Link
              href={`/dashboard/leads/${conversation.lead._id}`}
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Lead · {stageLabel}
            </Link>
          ) : (
            <button
              onClick={makeLead}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              + Make lead
            </button>
          )}
          <button onClick={toggleArchive} disabled={busy} className="text-xs text-slate-500 hover:text-slate-800">
            {conversation.status === 'archived' ? 'Unarchive' : 'Archive'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4">
        {messages.map((m) => (
          <div key={m._id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.direction === 'outbound' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-800'
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              <p className={`mt-1 text-[10px] ${m.direction === 'outbound' ? 'text-slate-300' : 'text-slate-400'}`}>
                {m.direction === 'outbound' && m.sentBy === 'ai' ? 'AI draft · ' : ''}
                {new Date(m.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white px-4 py-3">
        {windowClosed ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            It&apos;s been over 24 hours since their last message, so {platform.label} won&apos;t allow a reply here.
            {conversation.platform === 'whatsapp'
              ? ' Use an approved WhatsApp template from the lead page.'
              : ' Wait for them to message again.'}
          </p>
        ) : (
          <>
            {conversation.channelType === 'comment' && (
              <p className="mb-2 text-[11px] text-slate-500">This reply is public - it posts under their comment.</p>
            )}
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (!e.target.value) setUsedAi(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
              }}
              rows={3}
              placeholder="Write a reply…"
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={draft}
                disabled={drafting || sending}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {drafting ? 'Drafting…' : '✨ Draft with AI'}
              </button>
              <button
                onClick={send}
                disabled={sending || !text.trim()}
                className="ml-auto rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
