import { Stats } from '@/types';

export default function StatsCards({ stats }: { stats: Stats | null }) {
  const cards = [
    { label: 'Total Leads', value: stats?.totalLeads ?? '—' },
    { label: 'Conversion Rate', value: stats ? `${stats.conversionRate}%` : '—' },
    { label: 'Follow-ups Due', value: stats?.followUpsDueToday ?? '—' },
    { label: 'Converted', value: stats?.stageCounts?.converted ?? 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {card.label}
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
