'use client';

import { Lead, SOURCE_LABELS } from '@/types';
import { useRouter } from 'next/navigation';

export default function LeadCard({ lead }: { lead: Lead }) {
  const router = useRouter();

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', lead._id)}
      onClick={() => router.push(`/dashboard/leads/${lead._id}`)}
      className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-400 active:cursor-grabbing"
    >
      <p className="text-sm font-medium text-slate-900">{lead.name}</p>
      {lead.businessName && (
        <p className="text-xs text-slate-500">{lead.businessName}</p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {SOURCE_LABELS[lead.source]}
        </span>
        {lead.dealValue > 0 && (
          <span className="text-xs font-medium text-slate-700">₹{lead.dealValue}</span>
        )}
      </div>
    </div>
  );
}
