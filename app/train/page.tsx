'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { apiGet } from '@/lib/client';

interface SetLog {
  id: number;
  exercise_name: string;
  weight_lbs: number;
  reps: number;
  set_number: number;
}
interface Session {
  id: number;
  date: string;
  template_name: string | null;
  notes: string | null;
  sets: SetLog[];
}
interface Progress {
  e1rm: Record<string, { date: string; e1rm: number }[]>;
}

const LIFT_COLORS: Record<string, string> = {
  'Flat Bench': '#34d399',
  'Back Squat': '#60a5fa',
  'Deadlift': '#f472b6',
  'Weighted Pull-Ups': '#fbbf24',
};

export default function TrainPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [exercise, setExercise] = useState('');

  useEffect(() => {
    apiGet<{ sessions: Session[] }>('/api/log/workout?limit=60')
      .then((r) => setSessions(r.sessions))
      .catch(console.error);
    apiGet<Progress>('/api/progress').then(setProgress).catch(console.error);
  }, []);

  const exerciseNames = useMemo(() => {
    const names = new Set<string>();
    sessions.forEach((s) => s.sets.forEach((x) => names.add(x.exercise_name)));
    return [...names].sort();
  }, [sessions]);

  // top-set weight per date for the selected exercise
  const exerciseSeries = useMemo(() => {
    if (!exercise) return [];
    const byDate: Record<string, number> = {};
    for (const s of sessions) {
      for (const set of s.sets) {
        if (set.exercise_name !== exercise) continue;
        byDate[s.date] = Math.max(byDate[s.date] ?? 0, set.weight_lbs);
      }
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, weight]) => ({ date: date.slice(5), weight }));
  }, [sessions, exercise]);

  const e1rmData = useMemo(() => {
    if (!progress) return [];
    const byDate: Record<string, Record<string, number | string>> = {};
    for (const [lift, series] of Object.entries(progress.e1rm)) {
      for (const p of series) {
        byDate[p.date] = byDate[p.date] ?? { date: p.date.slice(5) };
        byDate[p.date][lift] = p.e1rm;
      }
    }
    return Object.keys(byDate).sort().map((d) => byDate[d]);
  }, [progress]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Training</h1>

      <section className="card">
        <h2 className="font-bold mb-2">Est. 1RM — main lifts</h2>
        {e1rmData.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={e1rmData}>
              <CartesianGrid stroke="#232c37" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={38} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: '#151b23', border: '1px solid #232c37' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {Object.entries(LIFT_COLORS).map(([lift, color]) => (
                <Line key={lift} type="monotone" dataKey={lift} stroke={color} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-slate-500">Log the main lifts to see trends.</p>
        )}
      </section>

      <section className="card">
        <h2 className="font-bold mb-2">Exercise progression</h2>
        <select className="input" value={exercise} onChange={(e) => setExercise(e.target.value)}>
          <option value="">Pick an exercise…</option>
          {exerciseNames.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        {exercise && exerciseSeries.length > 0 && (
          <div className="mt-3">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={exerciseSeries}>
                <CartesianGrid stroke="#232c37" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} width={38} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#151b23', border: '1px solid #232c37' }} />
                <Line type="monotone" dataKey="weight" stroke="#34d399" dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">History</h2>
        {sessions.length === 0 && <p className="text-sm text-slate-500">No sessions logged yet.</p>}
        {sessions.map((s) => (
          <SessionCard key={s.id} session={s} />
        ))}
      </section>
    </div>
  );
}

function SessionCard({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => {
    const g: Record<string, SetLog[]> = {};
    for (const set of session.sets) (g[set.exercise_name] = g[set.exercise_name] ?? []).push(set);
    return g;
  }, [session]);

  return (
    <div className="card">
      <button className="w-full text-left flex items-center justify-between" onClick={() => setOpen(!open)}>
        <div>
          <div className="text-sm font-semibold">{session.template_name ?? 'Session'}</div>
          <div className="text-[11px] text-slate-400">
            {session.date} · {session.sets.length} sets
          </div>
        </div>
        <span className="text-slate-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {Object.entries(grouped).map(([name, sets]) => (
            <div key={name} className="text-sm">
              <span className="font-medium">{name}: </span>
              <span className="text-slate-300">
                {sets.map((s) => `${s.weight_lbs || 'bw'}×${s.reps}`).join(', ')}
              </span>
            </div>
          ))}
          {session.notes && <p className="text-xs text-slate-400 pt-1">{session.notes}</p>}
        </div>
      )}
    </div>
  );
}
