'use client';

import { useEffect, useState, FormEvent } from 'react';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { BrandProfile, Platform, PLATFORM_LABELS, Post, PostStatus } from '@/types';
import BrandSettings from '@/components/BrandSettings';
import PostCard from '@/components/PostCard';

const FILTERS: { key: 'all' | PostStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'failed', label: 'Failed' },
];

export default function ContentPage() {
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [topic, setTopic] = useState('');
  const [genPlatforms, setGenPlatforms] = useState<Platform[] | null>(null); // null = use brand defaults
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  const [filter, setFilter] = useState<'all' | PostStatus>('all');

  useEffect(() => {
    // One-time load on mount.
    Promise.all([api.get('/content/brand'), api.get('/content')])
      .then(([brandRes, postsRes]) => {
        setBrand(brandRes.data.data);
        setPosts(postsRes.data.data);
      })
      .catch((err) => setLoadError(getErrorMessage(err, 'Could not load content')))
      .finally(() => setLoading(false));
  }, []);

  const activePlatforms = genPlatforms ?? brand?.defaultPlatforms ?? ['facebook', 'instagram'];

  const togglePlatform = (p: Platform) => {
    const cur = activePlatforms;
    setGenPlatforms(cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);
  };

  const handleGenerate = async (e: FormEvent) => {
    e.preventDefault();
    setGenError('');
    setGenerating(true);
    try {
      const res = await api.post('/content/generate', {
        topic: topic.trim() || undefined,
        platforms: activePlatforms,
      });
      setPosts((prev) => [res.data.data, ...prev]);
      setTopic('');
      setFilter('all');
    } catch (err) {
      setGenError(getErrorMessage(err, 'Could not generate a post'));
    } finally {
      setGenerating(false);
    }
  };

  const updatePost = (updated: Post) =>
    setPosts((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));

  const removePost = (id: string) => setPosts((prev) => prev.filter((p) => p._id !== id));

  const matchesFilter = (p: Post) => {
    if (filter === 'all') return true;
    if (filter === 'published') return p.status === 'published' || p.status === 'partially_published';
    return p.status === filter;
  };
  const visible = posts.filter(matchesFilter);

  const counts = {
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    published: posts.filter((p) => ['published', 'partially_published'].includes(p.status)).length,
    drafts: posts.filter((p) => p.status === 'draft').length,
  };

  if (loading) return <p className="text-slate-500">Loading content...</p>;
  if (loadError || !brand) return <p className="text-rose-600">{loadError || 'Could not load content'}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Content Agent</h1>
        <p className="text-sm text-slate-500">
          {counts.drafts} drafts · {counts.scheduled} scheduled · {counts.published} published
        </p>
      </div>

      <BrandSettings brand={brand} onSaved={setBrand} />

      <form onSubmit={handleGenerate} className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Generate a post with AI</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Topic (optional) - leave empty and the AI picks one from your pillars"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={generating || activePlatforms.length === 0}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {generating ? 'Writing…' : '✨ Generate'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">For:</span>
          {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                activePlatforms.includes(p) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-500'
              }`}
            >
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
        {genError && <p className="mt-3 text-sm text-rose-600">{genError}</p>}
      </form>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filter === f.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {visible.map((post) => (
          <PostCard key={`${post._id}-${post.updatedAt}`} post={post} onChange={updatePost} onDelete={removePost} />
        ))}
        {visible.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-400">
            {posts.length === 0 ? 'No posts yet - fill in your brand settings, then hit Generate.' : 'Nothing here.'}
          </p>
        )}
      </div>
    </div>
  );
}
