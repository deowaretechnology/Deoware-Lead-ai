'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { Platform, PLATFORM_LABELS, Post, POST_STATUS_STYLES } from '@/types';

interface Props {
  post: Post;
  onChange: (post: Post) => void;
  onDelete: (id: string) => void;
}

// Date -> value for <input type="datetime-local"> in the browser's local time
function toLocalInput(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fullCaption(caption: string, hashtags: string[]) {
  const tags = hashtags.filter(Boolean).map((t) => `#${t.replace(/^#/, '')}`).join(' ');
  return tags ? `${caption}\n\n${tags}` : caption;
}

export default function PostCard({ post, onChange, onDelete }: Props) {
  const editable = !['publishing', 'published'].includes(post.status);

  const [caption, setCaption] = useState(post.caption);
  const [hashtags, setHashtags] = useState(post.hashtags.join(', '));
  const [imageUrl, setImageUrl] = useState(post.imageUrl);
  const [platforms, setPlatforms] = useState<Platform[]>(post.platforms);
  // Lazy initializer: runs once on mount, so reading the clock here is fine
  const [scheduleAt, setScheduleAt] = useState(() =>
    toLocalInput(post.scheduledAt ? new Date(post.scheduledAt) : new Date(Date.now() + 60 * 60 * 1000))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const parsedHashtags = hashtags.split(',').map((h) => h.trim().replace(/^#/, '')).filter(Boolean);
  const dirty =
    caption !== post.caption ||
    parsedHashtags.join(',') !== post.hashtags.join(',') ||
    imageUrl !== post.imageUrl ||
    platforms.join(',') !== post.platforms.join(',');

  const needsImage = platforms.includes('instagram') && !imageUrl.trim();

  async function run(label: string, fn: () => Promise<Post | void>) {
    setError('');
    setBusy(label);
    try {
      const result = await fn();
      if (result) onChange(result);
    } catch (err) {
      setError(getErrorMessage(err, `Could not ${label}`));
    } finally {
      setBusy(null);
    }
  }

  // Save pending edits first so schedule/publish always use what's on screen
  async function saveIfDirty(): Promise<Post> {
    if (!dirty) return post;
    const res = await api.put(`/content/${post._id}`, {
      caption,
      hashtags: parsedHashtags,
      imageUrl: imageUrl.trim(),
      platforms,
    });
    return res.data.data;
  }

  const save = () => run('save', saveIfDirty);

  const schedule = (useNextSlot: boolean) =>
    run('schedule', async () => {
      await saveIfDirty();
      const res = await api.post(`/content/${post._id}/schedule`, useNextSlot ? {} : { scheduledAt: new Date(scheduleAt).toISOString() });
      return res.data.data;
    });

  const unschedule = () =>
    run('unschedule', async () => (await api.post(`/content/${post._id}/unschedule`)).data.data);

  const publish = () =>
    run('publish', async () => {
      await saveIfDirty();
      return (await api.post(`/content/${post._id}/publish`)).data.data;
    });

  const refreshMetrics = () =>
    run('refresh stats', async () => (await api.post(`/content/${post._id}/metrics`)).data.data);

  const remove = () => {
    if (!confirm('Delete this post from the CRM? (It will not be removed from Facebook/Instagram if already posted.)')) return;
    run('delete', async () => {
      await api.delete(`/content/${post._id}`);
      onDelete(post._id);
    });
  };

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const togglePlatform = (p: Platform) =>
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const status = POST_STATUS_STYLES[post.status];
  const publishedPlatforms = post.platforms.filter((p) => post.results?.[p]?.status === 'published');
  const hasMetrics = publishedPlatforms.length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
            {post.generatedBy === 'ai' && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">AI</span>
            )}
            {post.pillar && <span className="text-xs text-slate-400">{post.pillar}</span>}
          </div>
          {post.topic && <p className="mt-1 text-sm font-medium text-slate-900">{post.topic}</p>}
          {post.status === 'scheduled' && post.scheduledAt && (
            <p className="mt-0.5 text-xs text-blue-700">Goes out {new Date(post.scheduledAt).toLocaleString()}</p>
          )}
          {post.publishedAt && (
            <p className="mt-0.5 text-xs text-slate-500">Published {new Date(post.publishedAt).toLocaleString()}</p>
          )}
        </div>
        <button onClick={remove} disabled={!!busy} className="text-xs text-slate-400 hover:text-rose-600">
          Delete
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_180px]">
        <div className="space-y-3">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            disabled={!editable}
            rows={6}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none disabled:bg-slate-50 disabled:text-slate-600"
          />
          <input
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            disabled={!editable}
            placeholder="hashtags, comma separated"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none disabled:bg-slate-50"
          />
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            disabled={!editable}
            placeholder="Public image URL (required for Instagram) - e.g. from Cloudinary/Imgur"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none disabled:bg-slate-50"
          />
          {post.imagePrompt && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="font-medium text-slate-700">Image idea: </span>
              {post.imagePrompt}{' '}
              <button onClick={() => copy('prompt', post.imagePrompt)} className="font-medium text-slate-900 underline">
                {copied === 'prompt' ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 md:h-full">
          {imageUrl.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-provided URLs; next/image would need every host whitelisted
            <img src={imageUrl} alt="Post image preview" className="h-full w-full object-cover" />
          ) : (
            <span className="px-3 text-center text-xs text-slate-400">No image yet</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(Object.keys(PLATFORM_LABELS) as Platform[]).map((p) => {
          const r = post.results?.[p];
          const on = platforms.includes(p);
          return (
            <button
              key={p}
              type="button"
              disabled={!editable}
              onClick={() => togglePlatform(p)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-500'
              } disabled:cursor-default`}
            >
              {PLATFORM_LABELS[p]}
              {r?.status === 'published' && ' ✓'}
              {r?.status === 'failed' && ' ✕'}
            </button>
          );
        })}
      </div>

      {post.platforms.map((p) =>
        post.results?.[p]?.status === 'failed' ? (
          <p key={p} className="mt-2 text-xs text-rose-600">
            {PLATFORM_LABELS[p]}: {post.results[p].error}
          </p>
        ) : null
      )}

      {needsImage && editable && (
        <p className="mt-2 text-xs text-amber-700">Add an image URL to post on Instagram, or deselect Instagram.</p>
      )}

      {hasMetrics && (
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {publishedPlatforms.map((p) => (
            <span key={p}>
              <span className="font-medium text-slate-800">{PLATFORM_LABELS[p]}</span> ♥ {post.results[p].likes} · 💬 {post.results[p].comments}
            </span>
          ))}
          <button onClick={refreshMetrics} disabled={!!busy} className="ml-auto font-medium text-slate-900 underline">
            {busy === 'refresh stats' ? 'Refreshing…' : 'Refresh stats'}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {editable && dirty && (
          <button onClick={save} disabled={!!busy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {busy === 'save' ? 'Saving…' : 'Save changes'}
          </button>
        )}

        {editable && !['scheduled', 'partially_published'].includes(post.status) && (
          <>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
            <button onClick={() => schedule(false)} disabled={!!busy || needsImage || !scheduleAt} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {busy === 'schedule' ? 'Scheduling…' : 'Schedule'}
            </button>
            <button onClick={() => schedule(true)} disabled={!!busy || needsImage} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Next slot
            </button>
          </>
        )}

        {post.status === 'scheduled' && (
          <button onClick={unschedule} disabled={!!busy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {busy === 'unschedule' ? '…' : 'Unschedule'}
          </button>
        )}

        {editable && (
          <button onClick={publish} disabled={!!busy || needsImage || platforms.length === 0} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {busy === 'publish'
              ? 'Publishing…'
              : ['failed', 'partially_published'].includes(post.status)
                ? 'Retry failed'
                : 'Publish now'}
          </button>
        )}

        {platforms.includes('linkedin') && (
          <button
            onClick={() => copy('linkedin', fullCaption(caption, parsedHashtags))}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            title="LinkedIn doesn't allow auto-posting to personal profiles - copy and paste it there"
          >
            {copied === 'linkedin' ? 'Copied!' : 'Copy for LinkedIn'}
          </button>
        )}
      </div>
    </div>
  );
}
