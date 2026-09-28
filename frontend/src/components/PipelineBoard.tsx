'use client';

import { useState } from 'react';
import { Lead, LeadStage, STAGES } from '@/types';
import LeadCard from './LeadCard';
import api from '@/lib/api';

interface Props {
  pipeline: Record<string, Lead[]>;
  onStageChange: (leadId: string, newStage: LeadStage) => void;
}

export default function PipelineBoard({ pipeline, onStageChange }: Props) {
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const handleDrop = async (e: React.DragEvent, stage: LeadStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const leadId = e.dataTransfer.getData('text/plain');
    if (!leadId) return;

    // Optimistic update
    onStageChange(leadId, stage);

    try {
      await api.patch(`/leads/${leadId}/stage`, { stage });
    } catch {
      // If it fails, a page refresh will resync - keeping this simple for Phase 1
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STAGES.map((s) => {
        const leads = pipeline[s.key] || [];
        return (
          <div
            key={s.key}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStage(s.key);
            }}
            onDragLeave={() => setDragOverStage(null)}
            onDrop={(e) => handleDrop(e, s.key)}
            className={`w-64 flex-shrink-0 rounded-xl border p-3 transition ${
              dragOverStage === s.key ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-slate-50/50'
            }`}
          >
            <div className={`mb-3 flex items-center justify-between rounded-lg border px-2 py-1 ${s.color}`}>
              <span className="text-sm font-medium">{s.label}</span>
              <span className="text-xs font-semibold">{leads.length}</span>
            </div>
            <div className="space-y-2">
              {leads.map((lead) => (
                <LeadCard key={lead._id} lead={lead} />
              ))}
              {leads.length === 0 && (
                <p className="py-4 text-center text-xs text-slate-400">No leads here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
