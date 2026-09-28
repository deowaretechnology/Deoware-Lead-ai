'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { TodaySummary } from '@/types';
import SendListItem from '@/components/SendListItem';

function Tile({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${warn ? 'text-amber-700' : 'text-slate-500'}`}>{sub}</p>}
    </div>
  );
}

export default function TodayPage() {
  const [data, setData] = useState<TodaySummary | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/outreach/today')
      .then((res) => !cancelled && setData(res.data.data))
      .catch((err) => !cancelled && setError(getErrorMessage(err, 'Could not load today')));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const runNow = async () => {
    setRunMsg('');
    setRunning(true);
    try {
      const res = await api.post('/outreach/run-daily');
      const s = res.data.data;
      setRunMsg(
        `Sent ${s.email ?? 0} email${s.email === 1 ? '' : 's'} and ${s.whatsapp ?? 0} WhatsApp message${s.whatsapp === 1 ? '' : 's'}.` +
          (s.notes?.length ? ` Notes: ${s.notes.slice(0, 3).join(' · ')}` : '')
      );
      setReload((r) => r + 1);
    } catch (err) {
      setRunMsg(getErrorMessage(err, 'Could not run outreach'));
    } finally {
      setRunning(false);
    }
  };

  const removeFrom = (channel: 'instagram' | 'facebook') => (id: string) =>
    setData((d) =>
      d
        ? {
            ...d,
            sent: { ...d.sent, [channel]: d.sent[channel] + 1 },
            queues: { ...d.queues, [channel]: d.queues[channel].filter((l) => l._id !== id) },
          }
        : d
    );

  if (error) return <p className="text-rose-600">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading today…</p>;

  const { limits, sent, ready } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Today</h1>
          <p className="text-sm text-slate-500">
            Email and WhatsApp go out automatically. Instagram and Facebook: send these by hand (~15 min).
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={running || (!ready.email && !ready.whatsapp)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          title={!ready.email && !ready.whatsapp ? 'Set up cold email or a WhatsApp template first' : ''}
        >
          {running ? 'Sending…' : 'Run auto-outreach now'}
        </button>
      </div>
      {runMsg && <p className="text-sm text-slate-700">{runMsg}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="New leads today" value={data.newLeadsToday} sub="added to pipeline" />
        <Tile label="Waiting 1st msg" value={data.awaitingFirstMessage} sub="not contacted yet" />
        <Tile label="Email" value={`${sent.email}/${limits.email}`} sub={ready.email ? 'automatic' : 'not set up'} warn={!ready.email} />
        <Tile label="WhatsApp" value={`${sent.whatsapp}/${limits.whatsapp}`} sub={ready.whatsapp ? 'automatic' : 'no template set'} warn={!ready.whatsapp} />
        <Tile label="Instagram" value={`${sent.instagram}/${limits.instagram}`} sub="by hand" />
        <Tile label="Facebook" value={`${sent.facebook}/${limits.facebook}`} sub="by hand" />
      </div>

      {(!ready.email || !ready.whatsapp) && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {!ready.email && <p>• Cold email is off - add your Zoho/Google mailbox (COLD_EMAIL_SMTP_*) in the backend .env.</p>}
          {!ready.whatsapp && <p>• WhatsApp outreach is off - get a template approved by Meta and set WHATSAPP_OUTREACH_TEMPLATE.</p>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {(['instagram', 'facebook'] as const).map((channel) => {
          const list = data.queues[channel];
          return (
            <div key={channel} className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900">
                {channel === 'instagram' ? 'Instagram' : 'Facebook'} send list{' '}
                <span className="font-normal text-slate-500">({list.length} left today)</span>
              </h2>
              {list.map((lead) => (
                <SendListItem key={lead._id} lead={lead} channel={channel} onSent={removeFrom(channel)} />
              ))}
              {list.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
                  {sent[channel] >= limits[channel] ? (
                    'Done for today 🎉'
                  ) : (
                    <>
                      No leads with {channel === 'instagram' ? 'an Instagram handle' : 'a Facebook page'} yet.{' '}
                      <Link href="/dashboard/finder" className="underline">
                        Find more
                      </Link>{' '}
                      and use &quot;Find contacts&quot;.
                    </>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
