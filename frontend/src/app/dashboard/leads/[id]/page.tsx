'use client';

import { use, useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { getErrorMessage } from '@/lib/getErrorMessage';
import { Activity, Lead, LeadStage, STAGES, SOURCE_LABELS } from '@/types';
import AIOutreachPanel from '@/components/AIOutreachPanel';

const CHANNELS = ['manual', 'whatsapp', 'email', 'instagram', 'facebook', 'linkedin'] as const;

export default function LeadDetailPage({ params }: PageProps<'/dashboard/leads/[id]'>) {
  const { id } = use(params);
  const router = useRouter();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [noteText, setNoteText] = useState('');
  const [noteChannel, setNoteChannel] = useState<(typeof CHANNELS)[number]>('manual');
  const [noteDirection, setNoteDirection] = useState<'internal' | 'outbound' | 'inbound'>('internal');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    api
      .get(`/leads/${id}`)
      .then((res) => setLead(res.data.data))
      .catch((err) => setError(getErrorMessage(err, 'Could not load lead')))
      .finally(() => setLoading(false));
  }, [id]);

  const handleStageChange = async (stage: LeadStage) => {
    if (!lead) return;
    const prevStage = lead.stage;
    setLead({ ...lead, stage }); // optimistic
    try {
      const res = await api.patch(`/leads/${lead._id}/stage`, { stage });
      setLead(res.data.data);
    } catch {
      setLead({ ...lead, stage: prevStage });
    }
  };

  const handleAddNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!lead || !noteText.trim()) return;
    setAddingNote(true);
    try {
      const res = await api.post(`/leads/${lead._id}/activity`, {
        type: noteDirection === 'internal' ? 'note' : 'message',
        channel: noteChannel,
        direction: noteDirection,
        message: noteText,
        sentBy: 'user',
      });
      setLead(res.data.data);
      setNoteText('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not add activity'));
    } finally {
      setAddingNote(false);
    }
  };

  const handleDelete = async () => {
    if (!lead) return;
    if (!confirm(`Delete ${lead.name}? This can't be undone.`)) return;
    await api.delete(`/leads/${lead._id}`);
    router.push('/dashboard');
  };

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (error || !lead) return <p className="text-rose-600">{error || 'Lead not found'}</p>;

  return (
    <div className="space-y-6">
      <button onClick={() => router.push('/dashboard')} className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to pipeline
      </button>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{lead.name}</h1>
            {lead.businessName && lead.businessName !== lead.name && (
              <p className="text-sm text-slate-500">{lead.businessName}</p>
            )}
            {lead.address && <p className="text-xs text-slate-500">📍 {lead.address}</p>}
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
              {lead.phone && <span>📞 {lead.phone}</span>}
              {lead.email && (
                <span>
                  ✉️ {lead.email}
                  {lead.emailStatus && lead.emailStatus !== 'unknown' && (
                    <span
                      className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        lead.emailStatus === 'valid'
                          ? 'bg-emerald-50 text-emerald-700'
                          : lead.emailStatus === 'invalid'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {lead.emailStatus === 'valid' ? 'verified' : lead.emailStatus}
                    </span>
                  )}
                </span>
              )}
              {lead.instagramHandle && (
                <a href={`https://instagram.com/${lead.instagramHandle.replace(/^@/, '')}`} target="_blank" rel="noreferrer" className="underline hover:text-slate-900">
                  📷 @{lead.instagramHandle.replace(/^@/, '')}
                </a>
              )}
              {lead.facebookUrl && (
                <a href={lead.facebookUrl} target="_blank" rel="noreferrer" className="underline hover:text-slate-900">
                  📘 Facebook
                </a>
              )}
              {lead.website ? (
                <a href={lead.website} target="_blank" rel="noreferrer" className="underline hover:text-slate-900">
                  🌐 {lead.website.replace(/^https?:\/\//, '').slice(0, 40)}
                </a>
              ) : (
                lead.source === 'google_maps' && <span className="text-rose-600">🌐 No website</span>
              )}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">
                {SOURCE_LABELS[lead.source]}
              </span>
            </div>
          </div>
          <button
            onClick={handleDelete}
            className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            Delete lead
          </button>
        </div>

        {lead.doNotContact && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <span>Opted out - no automatic messages will be sent to this lead.</span>
            <button
              onClick={async () => {
                if (!confirm('Only do this if they asked to hear from you again. Allow contact?')) return;
                const res = await api.put(`/leads/${lead._id}`, { doNotContact: false });
                setLead(res.data.data);
              }}
              className="ml-auto text-xs font-medium underline"
            >
              Allow contact again
            </button>
          </div>
        )}

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700">Pipeline stage</label>
          <select
            value={lead.stage}
            onChange={(e) => handleStageChange(e.target.value as LeadStage)}
            className="mt-1 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none sm:w-auto"
          >
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          <span>
            Follow-ups sent: <span className="font-medium text-slate-700">{lead.followUpCount}</span>
          </span>
          <span>
            Auto follow-up:{' '}
            <span className="font-medium text-slate-700">{lead.autoFollowUp ? 'On' : 'Off'}</span>
          </span>
          {lead.nextFollowUpAt && (
            <span>
              Next follow-up:{' '}
              <span className="font-medium text-slate-700">
                {new Date(lead.nextFollowUpAt).toLocaleDateString()}
              </span>
            </span>
          )}
        </div>
      </div>

      <AIOutreachPanel lead={lead} onSent={(updated) => setLead(updated)} />

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Log an activity</h2>
        <form onSubmit={handleAddNote} className="mt-3 space-y-3">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            placeholder="e.g. Sent WhatsApp follow-up asking if they saw the demo link"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={noteChannel}
              onChange={(e) => setNoteChannel(e.target.value as (typeof CHANNELS)[number])}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={noteDirection}
              onChange={(e) => setNoteDirection(e.target.value as typeof noteDirection)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
            >
              <option value="internal">Internal note</option>
              <option value="outbound">Sent to lead</option>
              <option value="inbound">Received from lead</option>
            </select>
            <button
              type="submit"
              disabled={addingNote || !noteText.trim()}
              className="ml-auto rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {addingNote ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
        <div className="mt-4 space-y-3">
          {[...lead.activity].reverse().map((activity: Activity) => (
            <div key={activity._id} className="border-l-2 border-slate-200 pl-3">
              <p className="text-sm text-slate-800">{activity.message}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {activity.channel} · {activity.direction} · {new Date(activity.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
