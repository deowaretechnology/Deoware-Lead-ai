'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { TodayLead } from '@/types';

interface Props {
  lead: TodayLead;
  channel: 'instagram' | 'facebook';
  onSent: (id: string) => void;
}

function profileUrl(lead: TodayLead, channel: 'instagram' | 'facebook') {
  if (channel === 'instagram') return `https://instagram.com/${lead.instagramHandle.replace(/^@/, '')}`;
  return lead.facebookUrl;
}

// One row of the Today send list: draft with AI -> copy & open their profile
// -> paste & send there -> "Mark sent" (logs it + schedules the follow-up).
export default function SendListItem({ lead, channel, onSent }: Props) {
  const [message, setMessage] = useState('');
  const [usedAi, setUsedAi] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const draft = async () => {
    setError('');
    setBusy('draft');
    try {
      const res = await api.post(`/outreach/${lead._id}/draft`, { channel, type: 'first_touch' });
      setMessage(res.data.data.message);
      setUsedAi(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not draft'));
    } finally {
      setBusy(null);
    }
  };

  const copyAndOpen = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked - they can still select the text by hand
    }
    window.open(profileUrl(lead, channel), '_blank', 'noopener,noreferrer');
  };

  const markSent = async () => {
    setError('');
    setBusy('send');
    try {
      await api.post(`/outreach/${lead._id}/send`, {
        channel,
        message: message.trim() || '(sent by hand)',
        type: 'first_touch',
        sentBy: usedAi ? 'ai' : 'user',
      });
      onSent(lead._id);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not mark as sent'));
      setBusy(null);
    }
  };

  const handle = channel === 'instagram' ? `@${lead.instagramHandle.replace(/^@/, '')}` : lead.facebookUrl.replace(/^https?:\/\/(www\.)?/, '');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/dashboard/leads/${lead._id}`} className="text-sm font-medium text-slate-900 hover:underline">
            {lead.businessName || lead.name}
          </Link>
          <p className="truncate text-xs text-slate-500">
            {handle}
            {lead.tags?.[0] ? ` · ${lead.tags[0]}` : ''}
            {!lead.website ? ' · no website' : ''}
          </p>
        </div>
        {!message && (
          <button
            onClick={draft}
            disabled={busy !== null}
            className="flex-shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy === 'draft' ? 'Drafting…' : '✨ Draft'}
          </button>
        )}
      </div>

      {message && (
        <>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={copyAndOpen} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
              {copied ? 'Copied - paste it there' : `Copy & open ${channel === 'instagram' ? 'Instagram' : 'Facebook'}`}
            </button>
            <button
              onClick={markSent}
              disabled={busy !== null}
              className="ml-auto rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy === 'send' ? 'Saving…' : 'Mark sent'}
            </button>
          </div>
        </>
      )}
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
