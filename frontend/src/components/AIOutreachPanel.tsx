'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { Lead } from '@/types';

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp', autoSend: true },
  { value: 'email', label: 'Email', autoSend: true },
  { value: 'instagram', label: 'Instagram DM', autoSend: false },
  { value: 'facebook', label: 'Facebook', autoSend: false },
  { value: 'linkedin', label: 'LinkedIn', autoSend: false },
] as const;

interface Props {
  lead: Lead;
  onSent: (updatedLead: Lead) => void;
}

export default function AIOutreachPanel({ lead, onSent }: Props) {
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]['value']>('whatsapp');
  const [messageType, setMessageType] = useState<'first_touch' | 'follow_up'>(
    lead.lastContactedAt ? 'follow_up' : 'first_touch'
  );
  const [draft, setDraft] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<'sent' | 'manual' | null>(null);

  const selectedChannel = CHANNELS.find((c) => c.value === channel)!;

  const handleDraft = async () => {
    setError('');
    setLastResult(null);
    setDrafting(true);
    try {
      const res = await api.post(`/outreach/${lead._id}/draft`, { channel, type: messageType });
      setDraft(res.data.data.message);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not generate a draft'));
    } finally {
      setDrafting(false);
    }
  };

  const handleSend = async () => {
    if (!draft.trim()) return;
    setError('');
    setSending(true);
    try {
      const res = await api.post(`/outreach/${lead._id}/send`, {
        channel,
        message: draft,
        type: messageType,
      });
      onSent(res.data.data);
      setLastResult(res.data.sentAutomatically ? 'sent' : 'manual');
      setDraft('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not send message'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">AI Outreach</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Draft a personalized message with AI, review it, then send.
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as typeof channel)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={messageType}
          onChange={(e) => setMessageType(e.target.value as typeof messageType)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
        >
          <option value="first_touch">First touch</option>
          <option value="follow_up">Follow-up</option>
        </select>
        <button
          onClick={handleDraft}
          disabled={drafting}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {drafting ? 'Drafting...' : '✨ Draft with AI'}
        </button>
      </div>

      {lead.doNotContact && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          This lead opted out - sending is blocked.
        </p>
      )}
      {channel === 'whatsapp' && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          WhatsApp rule: unless they messaged you in the last 24 hours, your approved template
          (WHATSAPP_OUTREACH_TEMPLATE) is sent instead of this text.
        </p>
      )}
      {channel === 'email' && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Sent from your own mailbox with an unsubscribe link. The address is verified first; invalid ones are blocked.
        </p>
      )}
      {!selectedChannel.autoSend && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {selectedChannel.label} isn&apos;t auto-send yet - sending here will log the message and
          mark the lead as contacted, but you&apos;ll need to copy-paste it there yourself.
        </p>
      )}

      {draft && (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || !draft.trim() || lead.doNotContact}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {sending
              ? 'Sending...'
              : selectedChannel.autoSend
                ? `Send via ${selectedChannel.label}`
                : `Log as sent on ${selectedChannel.label}`}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {lastResult === 'sent' && (
        <p className="mt-3 text-sm text-emerald-600">
          Sent automatically. Next follow-up is scheduled if there&apos;s no reply.
        </p>
      )}
      {lastResult === 'manual' && (
        <p className="mt-3 text-sm text-emerald-600">
          Logged. Don&apos;t forget to actually paste and send it on {selectedChannel.label}.
        </p>
      )}
    </div>
  );
}
