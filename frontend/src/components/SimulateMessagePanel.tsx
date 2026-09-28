'use client';

import { useState, FormEvent } from 'react';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { INBOX_PLATFORM_STYLES, InboxPlatform } from '@/types';

interface Props {
  onSimulated: (conversationId: string) => void;
}

const EXAMPLES = [
  { platform: 'instagram', channelType: 'dm', name: 'Riya Salon', text: 'Hi! Mere salon ke liye website ka demo dikha sakte ho?' },
  { platform: 'facebook', channelType: 'comment', name: 'Amit Kumar', text: 'Kitna charge hai bakery website ka?' },
  { platform: 'whatsapp', channelType: 'dm', name: 'Priya', text: 'Hello, I need WhatsApp automation for my boutique' },
  { platform: 'instagram', channelType: 'comment', name: 'random_fan', text: 'Nice post 🔥🔥' },
] as const;

// Lets you try the whole inbox flow (AI triage, auto lead, replies) before
// Meta webhooks are connected. The backend disables this in production.
export default function SimulateMessagePanel({ onSimulated }: Props) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<InboxPlatform>('instagram');
  const [channelType, setChannelType] = useState<'dm' | 'comment'>('dm');
  const [name, setName] = useState('Riya Salon');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setResult('');
    setBusy(true);
    try {
      const res = await api.post('/inbox/simulate', { platform, channelType, name, text });
      const d = res.data.data;
      setResult(
        `AI read it as "${d.classification.intent}"${d.leadCreated ? ' → new lead created' : d.leadId ? ' → added to existing lead' : ' → not a lead'}.`
      );
      setText('');
      onSimulated(d.conversationId);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not simulate message'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-slate-500 underline hover:text-slate-800">
        Send a test message
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-dashed border-slate-300 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-800">Test message (pretend a customer wrote in)</p>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
          ✕
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.text}
            type="button"
            onClick={() => {
              setPlatform(ex.platform);
              setChannelType(ex.channelType);
              setName(ex.name);
              setText(ex.text);
            }}
            className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
          >
            {INBOX_PLATFORM_STYLES[ex.platform].short} {ex.channelType}: {ex.text.slice(0, 22)}…
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          value={platform}
          onChange={(e) => {
            const p = e.target.value as InboxPlatform;
            setPlatform(p);
            if (p === 'whatsapp') setChannelType('dm');
          }}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <select
          value={channelType}
          onChange={(e) => setChannelType(e.target.value as 'dm' | 'comment')}
          disabled={platform === 'whatsapp'}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="dm">DM</option>
          <option value="comment">Comment</option>
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sender name"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Their message"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? '…' : 'Send'}
        </button>
      </div>
      {result && <p className="mt-2 text-xs text-emerald-700">{result}</p>}
      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
    </form>
  );
}
