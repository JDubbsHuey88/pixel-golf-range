'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/client';

interface Rollup {
  week_number: number;
  phase: string;
  start_date: string;
  end_date: string;
  focus_note: string;
  calorie_target: number;
  protein_target_g: number;
  avg_weight_lbs: number | null;
  weight_delta_lbs: number | null;
  weigh_in_days: number;
  workout_adherence: { completed: number; target: number };
  avg_calories: number | null;
  avg_protein_g: number | null;
  cardio_sessions: number;
}

export default function WeekPage() {
  const [current, setCurrent] = useState<number | null>(null);
  const [week, setWeek] = useState<Rollup | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiGet<{ week_number: number }>('/api/today')
      .then((t) => setCurrent(t.week_number))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (current == null) return;
    apiGet<Rollup>(`/api/week/${week?.week_number ?? current}`)
      .then(setWeek)
      .catch((e) => setErr(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const go = (n: number) => {
    if (n < 1 || n > 36) return;
    apiGet<Rollup>(`/api/week/${n}`).then(setWeek).catch((e) => setErr(String(e)));
  };

  if (!week) return <div className="text-slate-400 pt-20 text-center">{err || 'Loading…'}</div>;

  const stat = (label: string, val: string | number | null, sub?: string) => (
    <div className="text-center">
      <div className="text-lg font-bold">{val ?? '—'}</div>
      <div className="text-[11px] text-slate-400 uppercase">{label}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <button className="btn-ghost" onClick={() => go(week.week_number - 1)}>←</button>
        <div className="text-center">
          <h1 className="font-bold">
            Week {week.week_number}
            {current === week.week_number && <span className="text-accent"> ●</span>}
          </h1>
          <div className="text-[11px] text-slate-400">
            {week.start_date} → {week.end_date}
          </div>
        </div>
        <button className="btn-ghost" onClick={() => go(week.week_number + 1)}>→</button>
      </header>

      <section className="card">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5 text-xs font-bold uppercase">
            {week.phase}
          </span>
          <span className="text-sm text-slate-300">{week.focus_note}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Targets: {week.calorie_target} cal · {week.protein_target_g}g protein
        </p>
      </section>

      <section className="card grid grid-cols-2 gap-4">
        {stat('avg weight', week.avg_weight_lbs != null ? `${week.avg_weight_lbs} lb` : null, `${week.weigh_in_days} weigh-ins`)}
        {stat(
          'Δ vs prior wk',
          week.weight_delta_lbs != null
            ? `${week.weight_delta_lbs > 0 ? '+' : ''}${week.weight_delta_lbs} lb`
            : null,
        )}
        {stat('workouts', `${week.workout_adherence.completed}/${week.workout_adherence.target}`)}
        {stat('cardio', `${week.cardio_sessions}×`)}
        {stat('avg cal', week.avg_calories != null ? Math.round(week.avg_calories) : null)}
        {stat('avg protein', week.avg_protein_g != null ? `${Math.round(week.avg_protein_g)}g` : null)}
      </section>
    </div>
  );
}
