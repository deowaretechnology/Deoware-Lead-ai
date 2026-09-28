'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { FinderUsage, Prospect } from '@/types';
import AutoFinderPanel from '@/components/AutoFinderPanel';
import CsvImportButton from '@/components/CsvImportButton';

type Tab = 'new' | 'imported' | 'dismissed';

const BUSINESS_TYPES = ['beauty parlour', 'salon', 'bakery', 'boutique', 'gym', 'dental clinic', 'restaurant', 'coaching centre', 'real estate agent'];
const AREAS = ['Salt Lake Kolkata', 'New Town Kolkata', 'Park Street Kolkata', 'Howrah', 'Haldia'];
const SOCIAL = /(instagram\.com|facebook\.com|fb\.com|wa\.me|whatsapp\.com|linktr\.ee|business\.site|justdial\.com|sulekha\.com|indiamart\.com)/i;

function scoreClass(score: number) {
  if (score >= 70) return 'bg-emerald-600 text-white';
  if (score >= 45) return 'bg-amber-400 text-amber-950';
  return 'bg-slate-200 text-slate-700';
}

function WebsiteBadge({ website }: { website: string }) {
  if (!website) return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">No website</span>;
  if (SOCIAL.test(website))
    return (
      <a href={website} target="_blank" rel="noreferrer" className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 underline">
        Social page only
      </a>
    );
  return (
    <a href={website} target="_blank" rel="noreferrer" className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 underline">
      Has website
    </a>
  );
}

const SOCIAL_LABELS: [keyof Prospect['socials'], string][] = [
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['whatsapp', 'WhatsApp'],
  ['linkedin', 'LinkedIn'],
  ['youtube', 'YouTube'],
];

function Contacts({ prospect: p }: { prospect: Prospect }) {
  const socials = SOCIAL_LABELS.filter(([k]) => p.socials?.[k]);
  const hasAny = p.emails?.length || p.extraPhones?.length || socials.length;
  if (!hasAny && !p.enrichError) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
      {p.emails?.map((e) => (
        <a key={e} href={`mailto:${e}`} className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 hover:underline">
          ✉️ {e}
        </a>
      ))}
      {p.extraPhones?.map((ph) => (
        <span key={ph} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
          📞 {ph}
        </span>
      ))}
      {socials.map(([k, label]) => (
        <a key={k} href={p.socials[k]} target="_blank" rel="noreferrer" className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700 hover:underline">
          {label}
        </a>
      ))}
      {p.enrichError && <span className="text-slate-400">{p.enrichError}</span>}
      {p.enrichedAt && !hasAny && !p.enrichError && <span className="text-slate-400">No contacts found on their site</span>}
    </div>
  );
}

export default function FinderPage() {
  const [businessType, setBusinessType] = useState('');
  const [area, setArea] = useState('');
  const [pages, setPages] = useState(1);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const [searchError, setSearchError] = useState('');
  const [usage, setUsage] = useState<FinderUsage | null>(null);

  const [tab, setTab] = useState<Tab>('new');
  const [noWebsiteOnly, setNoWebsiteOnly] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reload, setReload] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [enriching, setEnriching] = useState<Set<string>>(new Set());
  const [enrichMsg, setEnrichMsg] = useState('');

  useEffect(() => {
    api.get('/finder/usage').then((res) => setUsage(res.data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/finder/prospects', { params: { status: tab } })
      .then((res) => {
        if (cancelled) return;
        setProspects(res.data.data);
        setListError('');
      })
      .catch((err) => !cancelled && setListError(getErrorMessage(err, 'Could not load prospects')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, reload]);

  const visible = useMemo(() => {
    const t = filterText.trim().toLowerCase();
    return prospects.filter(
      (p) =>
        (!noWebsiteOnly || !p.website || SOCIAL.test(p.website)) &&
        p.score >= minScore &&
        (!t || `${p.name} ${p.category} ${p.address} ${p.searchQuery}`.toLowerCase().includes(t))
    );
  }, [prospects, noWebsiteOnly, minScore, filterText]);

  const query = [businessType.trim(), area.trim()].filter(Boolean).join(' in ');

  const runSearch = async (e: FormEvent) => {
    e.preventDefault();
    setSearchError('');
    setSearchMsg('');
    setImportMsg('');
    setSearching(true);
    try {
      const res = await api.post('/finder/search', { query, pages });
      const { data, added, calls, usage: u } = res.data;
      setUsage(u);
      const noSite = data.filter((p: Prospect) => !p.website || SOCIAL.test(p.website)).length;
      setSearchMsg(
        data.length
          ? `Found ${data.length} businesses for "${query}" - ${added} new, ${noSite} without a proper website. (${calls} Google call${calls === 1 ? '' : 's'} used)`
          : `Google found nothing for "${query}". Try a broader area or different wording.`
      );
      setSelected(new Set());
      setTab('new');
      setReload((r) => r + 1);
    } catch (err) {
      setSearchError(getErrorMessage(err, 'Search failed'));
    } finally {
      setSearching(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectableVisible = visible.filter((p) => p.status === 'new');
  const allSelected = selectableVisible.length > 0 && selectableVisible.every((p) => selected.has(p._id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableVisible.map((p) => p._id)));

  // "Find contacts": scrape each business's own website for email / socials / phones
  const enrichIds = async (ids: string[]) => {
    const withSite = ids
      .filter((id) => {
        const w = prospects.find((p) => p._id === id)?.website;
        return w && !SOCIAL.test(w); // a social link isn't a site to scan
      })
      .slice(0, 25);
    if (!withSite.length) {
      setEnrichMsg('None of these have their own website to scan (social-page links are already shown).');
      return;
    }
    setEnrichMsg('');
    setEnriching(new Set(withSite));
    try {
      const res = await api.post('/finder/enrich', { ids: withSite });
      const s = res.data.data;
      const updated = new Map<string, Prospect>(s.prospects.map((p: Prospect) => [p._id, p]));
      setProspects((cur) => cur.map((p) => updated.get(p._id) || p));
      setEnrichMsg(
        `Scanned ${s.scanned} website${s.scanned === 1 ? '' : 's'}: ${s.withEmail} with email, ${s.withSocial} with social links${s.failed ? `, ${s.failed} couldn't be opened` : ''}.` +
          (ids.length > withSite.length ? ' (Skipped ones without a website.)' : '')
      );
    } catch (err) {
      setEnrichMsg(getErrorMessage(err, 'Could not scan websites'));
    } finally {
      setEnriching(new Set());
    }
  };

  const importIds = async (ids: string[]) => {
    if (!ids.length) return;
    setImportMsg('');
    setImporting(true);
    try {
      const res = await api.post('/finder/import', { ids });
      const s = res.data.data;
      setImportMsg(
        `Added ${s.imported} to your pipeline${s.linked ? `, ${s.linked} already there (linked)` : ''}. Open a lead and use AI Outreach to message them.`
      );
      setSelected(new Set());
      setReload((r) => r + 1);
    } catch (err) {
      setImportMsg(getErrorMessage(err, 'Import failed'));
    } finally {
      setImporting(false);
    }
  };

  const setStatus = async (id: string, action: 'dismiss' | 'restore') => {
    setRowBusy(id);
    try {
      await api.post(`/finder/prospects/${id}/${action}`);
      setProspects((cur) => cur.filter((p) => p._id !== id));
      setSelected((cur) => {
        const next = new Set(cur);
        next.delete(id);
        return next;
      });
    } finally {
      setRowBusy(null);
    }
  };

  const usagePct = usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Lead Finder</h1>
          <p className="text-sm text-slate-500">Find local businesses on Google, ranked by how much they need you</p>
        </div>
        <CsvImportButton
          onImported={() => {
            setTab('new');
            setReload((r) => r + 1);
          }}
        />
      </div>

      <AutoFinderPanel
        onRan={() => {
          setTab('imported');
          setReload((r) => r + 1);
          api.get('/finder/usage').then((res) => setUsage(res.data.data)).catch(() => {});
        }}
      />

      {/* Search */}
      <form onSubmit={runSearch} className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
          <div>
            <label className="block text-xs font-medium text-slate-600">Business type</label>
            <input
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              placeholder="beauty parlour"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Area</label>
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Salt Lake Kolkata"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Results</label>
            <select
              value={pages}
              onChange={(e) => setPages(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value={1}>Up to 20</option>
              <option value={2}>Up to 40</option>
              <option value={3}>Up to 60</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={searching || query.length < 3}
              className="w-full rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {searching ? 'Searching…' : 'Find'}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {BUSINESS_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setBusinessType(t)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${businessType === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {AREAS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArea(a)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${area === a ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              📍 {a}
            </button>
          ))}
        </div>

        {usage && (
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Google searches this month (free-tier guard)</span>
              <span>
                {usage.used} / {usage.limit} · each search of 20 = 1
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full ${usagePct > 85 ? 'bg-rose-500' : 'bg-slate-900'}`} style={{ width: `${usagePct}%` }} />
            </div>
          </div>
        )}

        {searchMsg && <p className="mt-3 text-sm text-emerald-700">{searchMsg}</p>}
        {searchError && <p className="mt-3 text-sm text-rose-600">{searchError}</p>}
      </form>

      {/* Filters + bulk actions */}
      <div className="flex flex-wrap items-center gap-2">
        {(['new', 'imported', 'dismissed'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setSelected(new Set());
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {t === 'new' ? 'To review' : t}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-slate-600">
            <input type="checkbox" checked={noWebsiteOnly} onChange={(e) => setNoWebsiteOnly(e.target.checked)} />
            No proper website
          </label>
          <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
            <option value={0}>Any score</option>
            <option value={45}>Score 45+</option>
            <option value={70}>Score 70+</option>
          </select>
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter…"
            className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
      </div>

      {tab === 'new' && selectableVisible.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            Select all {selectableVisible.length}
          </label>
          <span className="text-slate-300">{selected.size} selected</span>
          <button
            onClick={() => enrichIds([...selected])}
            disabled={enriching.size > 0 || selected.size === 0}
            className="ml-auto rounded-lg border border-slate-500 px-3 py-1 font-medium text-white disabled:opacity-40"
            title="Scan their own websites for email, Instagram, WhatsApp (max 25 at a time)"
          >
            {enriching.size > 0 ? 'Scanning…' : 'Find contacts'}
          </button>
          <button
            onClick={() => importIds([...selected])}
            disabled={importing || selected.size === 0}
            className="rounded-lg bg-white px-3 py-1 font-medium text-slate-900 disabled:opacity-40"
          >
            {importing ? 'Importing…' : `Add ${selected.size || ''} to pipeline`}
          </button>
        </div>
      )}
      {importMsg && <p className="text-sm text-emerald-700">{importMsg}</p>}
      {enrichMsg && <p className="text-sm text-slate-700">{enrichMsg}</p>}

      {/* Results */}
      <div className="space-y-2">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {listError && <p className="text-sm text-rose-600">{listError}</p>}
        {!loading && !listError && visible.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">
            {prospects.length === 0
              ? tab === 'new'
                ? 'Search for a business type + area above to find prospects.'
                : 'Nothing here yet.'
              : 'No results match these filters.'}
          </p>
        )}
        {visible.map((p) => (
          <div key={p._id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
            {p.status === 'new' && (
              <input type="checkbox" className="mt-1.5" checked={selected.has(p._id)} onChange={() => toggle(p._id)} aria-label={`Select ${p.name}`} />
            )}
            <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${scoreClass(p.score)}`} title="Prospect score">
              {p.score}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-slate-900">{p.name}</p>
                {p.category && <span className="text-xs text-slate-500">{p.category}</span>}
                <WebsiteBadge website={p.website} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {p.rating !== null && (
                  <span>
                    ★ {p.rating} <span className="text-slate-400">({p.reviewCount})</span>
                  </span>
                )}
                {p.phone ? <span>📞 {p.phone}</span> : <span className="text-slate-400">No phone</span>}
                {p.address && <span className="truncate">📍 {p.address}</span>}
              </div>
              {p.scoreReasons.length > 0 && <p className="mt-1 text-[11px] text-slate-500">{p.scoreReasons.join(' · ')}</p>}
              <Contacts prospect={p} />
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
              {p.website && !SOCIAL.test(p.website) && !p.enrichedAt && p.status !== 'dismissed' && (
                <button
                  onClick={() => enrichIds([p._id])}
                  disabled={enriching.size > 0}
                  className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {enriching.has(p._id) ? 'Scanning…' : 'Find contacts'}
                </button>
              )}
              {p.status === 'new' && (
                <>
                  <button
                    onClick={() => importIds([p._id])}
                    disabled={importing}
                    className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    + Pipeline
                  </button>
                  <button onClick={() => setStatus(p._id, 'dismiss')} disabled={rowBusy === p._id} className="text-xs text-slate-400 hover:text-slate-700">
                    Dismiss
                  </button>
                </>
              )}
              {p.status === 'imported' && p.lead && (
                <Link href={`/dashboard/leads/${p.lead}`} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  Open lead
                </Link>
              )}
              {p.status === 'dismissed' && (
                <button onClick={() => setStatus(p._id, 'restore')} disabled={rowBusy === p._id} className="text-xs font-medium text-slate-700 underline">
                  Restore
                </button>
              )}
              {p.mapsUrl && (
                <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="text-xs text-slate-500 underline">
                  Maps
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
