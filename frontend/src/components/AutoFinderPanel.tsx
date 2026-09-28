'use client';

import { useEffect, useState, FormEvent } from 'react';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { AutoFinderStatus } from '@/types';

const COUNTRIES: [string, string][] = [
  ['IN', 'India'],
  ['AE', 'UAE'],
  ['SA', 'Saudi Arabia'],
  ['QA', 'Qatar'],
  ['GB', 'United Kingdom'],
  ['US', 'United States'],
  ['AU', 'Australia'],
  ['SG', 'Singapore'],
  ['NP', 'Nepal'],
  ['BD', 'Bangladesh'],
  ['CA', 'Canada'],
];

interface Props {
  onRan: () => void;
}

// Saved searches the system runs by itself every day (areas rotate, so a
// city gives hundreds of leads over time), plus a "Run now" button.
export default function AutoFinderPanel({ onRan }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AutoFinderStatus | null>(null);
  const [reload, setReload] = useState(0);
  const [businessType, setBusinessType] = useState('');
  const [areas, setAreas] = useState('');
  const [country, setCountry] = useState('IN');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/finder/auto')
      .then((res) => !cancelled && setStatus(res.data.data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/finder/auto/searches', { businessType, areas, country });
      setBusinessType('');
      setAreas('');
      setReload((r) => r + 1);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: string, active: boolean) => {
    await api.put(`/finder/auto/searches/${id}`, { active });
    setReload((r) => r + 1);
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this saved search?')) return;
    await api.delete(`/finder/auto/searches/${id}`);
    setReload((r) => r + 1);
  };

  const runNow = async () => {
    setMsg('');
    setError('');
    setRunning(true);
    try {
      const res = await api.post('/finder/auto/run');
      const s = res.data.data;
      setMsg(
        `Searched ${s.searches ?? 0} area${s.searches === 1 ? '' : 's'}, found ${s.found ?? 0} new, scanned ${s.enriched ?? 0} websites, added ${s.imported ?? 0} to the pipeline${s.linked ? ` (+${s.linked} already there)` : ''}.` +
          (s.stoppedBecause ? ` Stopped: ${s.stoppedBecause}.` : '')
      );
      setReload((r) => r + 1);
      onRan();
    } catch (err) {
      setError(getErrorMessage(err, 'Auto-Finder failed'));
    } finally {
      setRunning(false);
    }
  };

  const active = status?.searches.filter((s) => s.active).length ?? 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-6 py-4 text-left">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Daily Auto-Finder</h2>
          <p className="text-xs text-slate-500">
            {status
              ? `${active} active search${active === 1 ? '' : 'es'} · ${status.importedToday}/${status.settings.dailyTarget} added today · min score ${status.settings.minScore}`
              : 'Finds new leads every day by itself'}
          </p>
        </div>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && status && (
        <div className="space-y-4 border-t border-slate-100 px-6 py-5">
          <p className="text-xs text-slate-500">
            Every day it runs one area per search (rotating), keeps businesses scoring {status.settings.minScore}+,
            {status.settings.enrich ? ' scans their websites for email/Instagram,' : ''} and adds up to {status.settings.dailyTarget} to your
            pipeline. Runs with the daily job (cron URL <code>/api/cron/daily</code>) or the button below.
          </p>

          <div className="space-y-2">
            {status.searches.map((s) => (
              <div key={s._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={s.active} onChange={(e) => toggle(s._id, e.target.checked)} />
                  <span className={s.active ? 'font-medium text-slate-900' : 'text-slate-400'}>{s.businessType}</span>
                </label>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{s.country}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                  {s.areas.map((a, i) => (i === s.nextAreaIndex ? `▸${a}` : a)).join(', ')}
                </span>
                <span className="text-[11px] text-slate-400">{s.totalFound} found</span>
                <button onClick={() => remove(s._id)} className="text-xs text-slate-400 hover:text-rose-600">
                  Delete
                </button>
              </div>
            ))}
            {status.searches.length === 0 && <p className="text-sm text-slate-400">No saved searches yet - add one below.</p>}
          </div>

          <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
            <input
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              placeholder="Business type (e.g. beauty salon)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={areas}
              onChange={(e) => setAreas(e.target.value)}
              placeholder="Areas, comma separated (e.g. Salt Lake Kolkata, New Town Kolkata, Behala Kolkata)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={saving || businessType.trim().length < 2 || !areas.trim()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? '…' : '+ Add'}
            </button>
          </form>
          {country === 'CA' && (
            <p className="text-xs text-amber-700">Canada&apos;s anti-spam law (CASL) needs consent before emailing - prefer phone/WhatsApp there.</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={runNow}
              disabled={running || active === 0}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {running ? 'Finding… (can take a minute)' : 'Run now'}
            </button>
            <span className="text-xs text-slate-500">
              Google calls this month: {status.usage.used}/{status.usage.limit}
            </span>
          </div>
          {msg && <p className="text-sm text-emerald-700">{msg}</p>}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
