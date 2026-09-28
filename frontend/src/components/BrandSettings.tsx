'use client';

import { useState, FormEvent } from 'react';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { BrandProfile, Platform, PLATFORM_LABELS } from '@/types';

interface Props {
  brand: BrandProfile;
  onSaved: (brand: BrandProfile) => void;
}

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none';

function formatHour(h: number) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${suffix}`;
}

export default function BrandSettings({ brand, onSaved }: Props) {
  const [open, setOpen] = useState(!brand.description); // open by default until filled in
  const [form, setForm] = useState({
    brandName: brand.brandName,
    description: brand.description,
    targetAudience: brand.targetAudience,
    tone: brand.tone,
    language: brand.language,
    contentPillars: brand.contentPillars.join(', '),
    callToAction: brand.callToAction,
    defaultPlatforms: brand.defaultPlatforms,
    autoGenerate: brand.autoGenerate,
    autoPublish: brand.autoPublish,
    postingHour: brand.postingHour,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const togglePlatform = (p: Platform) => {
    const has = form.defaultPlatforms.includes(p);
    set('defaultPlatforms', has ? form.defaultPlatforms.filter((x) => x !== p) : [...form.defaultPlatforms, p]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await api.put('/content/brand', {
        ...form,
        contentPillars: form.contentPillars
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      onSaved(res.data.data);
      setSaved(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save brand settings'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Brand & automation settings</h2>
          <p className="text-xs text-slate-500">
            {brand.autoGenerate
              ? `Auto-generating 1 post daily${brand.autoPublish ? `, auto-publishing at ${formatHour(brand.postingHour)}` : ' for your approval'}`
              : 'The AI writes every post from this - fill it in well'}
          </p>
        </div>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="space-y-4 border-t border-slate-100 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Brand name</label>
              <input value={form.brandName} onChange={(e) => set('brandName', e.target.value)} className={inputClass} placeholder="Deoware AI" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Language</label>
              <select value={form.language} onChange={(e) => set('language', e.target.value)} className={inputClass}>
                <option>English</option>
                <option>Hinglish</option>
                <option>Hindi</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">What you do</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className={inputClass}
              placeholder="We build AI agents, WhatsApp automation and websites that help small businesses get and convert more leads."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Target audience</label>
            <input
              value={form.targetAudience}
              onChange={(e) => set('targetAudience', e.target.value)}
              className={inputClass}
              placeholder="Salon, bakery, boutique and real-estate owners who get enquiries on WhatsApp/Instagram"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Tone</label>
              <input value={form.tone} onChange={(e) => set('tone', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Call to action</label>
              <input
                value={form.callToAction}
                onChange={(e) => set('callToAction', e.target.value)}
                className={inputClass}
                placeholder="DM 'AI' for a free demo"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Content pillars (comma separated)</label>
            <input
              value={form.contentPillars}
              onChange={(e) => set('contentPillars', e.target.value)}
              className={inputClass}
              placeholder="AI automation tips, client results, behind the scenes, myth vs fact"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700">Default platforms</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
                <label
                  key={p}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
                    form.defaultPlatforms.includes(p) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700'
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={form.defaultPlatforms.includes(p)} onChange={() => togglePlatform(p)} />
                  {PLATFORM_LABELS[p]}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">Daily automation</p>
            <p className="text-xs text-slate-500">
              Runs only when the backend has ENABLE_CONTENT_AGENT=true.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.autoGenerate} onChange={(e) => set('autoGenerate', e.target.checked)} />
              Generate one new post with AI every day
            </label>
            <label className={`mt-2 flex items-center gap-2 text-sm ${form.autoGenerate ? 'text-slate-700' : 'text-slate-400'}`}>
              <input
                type="checkbox"
                disabled={!form.autoGenerate}
                checked={form.autoPublish}
                onChange={(e) => set('autoPublish', e.target.checked)}
              />
              Auto-publish it without waiting for my approval
            </label>
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <span>Post at</span>
              <select
                value={form.postingHour}
                onChange={(e) => set('postingHour', Number(e.target.value))}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">(IST)</span>
            </div>
            {form.autoPublish && form.defaultPlatforms.includes('instagram') && (
              <p className="mt-3 text-xs text-amber-700">
                Instagram needs an image, which the AI can&apos;t make. Auto posts that include Instagram stay as drafts until you add an image URL - Facebook-only posts go out on their own.
              </p>
            )}
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save settings'}
            </button>
            {saved && <span className="text-sm text-emerald-600">Saved</span>}
          </div>
        </form>
      )}
    </div>
  );
}
