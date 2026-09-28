'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { Lead, LeadStage, Stats } from '@/types';
import StatsCards from '@/components/StatsCards';
import PipelineBoard from '@/components/PipelineBoard';
import AddLeadModal from '@/components/AddLeadModal';

export default function DashboardPage() {
  const [pipeline, setPipeline] = useState<Record<string, Lead[]>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadData = useCallback(async () => {
    const [pipelineRes, statsRes] = await Promise.all([
      api.get('/leads/pipeline'),
      api.get('/leads/stats'),
    ]);
    setPipeline(pipelineRes.data.data);
    setStats(statsRes.data.data);
  }, []);

  useEffect(() => {
    // One-time fetch on mount - safe, does not cascade (loadData has no deps that change from this).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const handleStageChange = (leadId: string, newStage: LeadStage) => {
    setPipeline((prev) => {
      const next: Record<string, Lead[]> = {};
      let movedLead: Lead | undefined;

      for (const stage in prev) {
        next[stage] = prev[stage].filter((l) => {
          if (l._id === leadId) {
            movedLead = { ...l, stage: newStage };
            return false;
          }
          return true;
        });
      }
      if (movedLead) {
        next[newStage] = [movedLead, ...(next[newStage] || [])];
      }
      return next;
    });
  };

  const handleCreated = (lead: Lead) => {
    setPipeline((prev) => ({
      ...prev,
      [lead.stage]: [lead, ...(prev[lead.stage] || [])],
    }));
    setStats((prev) =>
      prev ? { ...prev, totalLeads: prev.totalLeads + 1 } : prev
    );
  };

  if (loading) {
    return <p className="text-slate-500">Loading your pipeline...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Lead Pipeline</h1>
          <p className="text-sm text-slate-500">Drag a card to move it between stages</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Add lead
        </button>
      </div>

      <StatsCards stats={stats} />

      <PipelineBoard pipeline={pipeline} onStageChange={handleStageChange} />

      {showAddModal && (
        <AddLeadModal onClose={() => setShowAddModal(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
