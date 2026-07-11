'use client';

import { useCallback, useEffect, useState } from 'react';
import Ring from '@/components/Ring';
import { apiGet, apiSend } from '@/lib/client';

interface TodayData {
  date: string;
  pre_program: boolean;
  week_number: number;
  phase: string | null;
  focus_note: string | null;
  targets: { calories: number | null; protein_g: number | null };
  totals: { calories: number; protein_g: number };
  weight_7day_avg: number | null;
  metrics: { weight_lbs: number | null } | null;
  workout: {
    id: number;
    name: string;
    day_number: number;
    exercises: {
      exercise_id: number;
      name: string;
      sets: number;
      rep_range: string;
      progression_rule: string;
      last_session_date: string | null;
      last_session: { weight_lbs: number; reps: number }[];
    }[];
  } | null;
  todays_session: { id: number; sets: { exercise_id: number; weight_lbs: number; reps: number }[] } | null;
  suggestions: { id: number; message: string; rule_key: string }[];
}

interface Staple {
  id: number;
  name: string;
  calories: number;
  protein_g: number;
}

const QUICK_ADD = [
  'Fairlife Core Power Elite',
  'FitCrunch Bar (snack)',
  'Whole Egg',
  'Chicken Breast',
  'White Rice',
  'Greek Yogurt 0%',
];

export default function TodayPage() {
  const [data, setData] = useState<TodayData | null>(null);
  const [staples, setStaples] = useState<Staple[]>([]);
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    const d = await apiGet<TodayData>('/api/today');
    setData(d);
  }, []);

  useEffect(() => {
    load().catch(console.error);
    apiGet<{ items: Staple[] }>('/api/food/search?staples=1')
      .then((r) => setStaples(r.items.filter((i) => QUICK_ADD.includes(i.name))))
      .catch(console.error);
  }, [load]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const quickAdd = async (item: Staple) => {
    setBusy(true);
    try {
      await apiSend('/api/log/food', { food_item_id: item.id });
      flash(`Logged ${item.name} (+${item.calories} cal)`);
      await load();
    } catch (e) {
      flash(String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveWeight = async () => {
    if (!weight) return;
    setBusy(true);
    try {
      await apiSend('/api/metrics', { weight_lbs: Number(weight) });
      flash(`Weight ${weight} lb saved`);
      setWeight('');
      await load();
    } catch (e) {
      flash(String(e));
    } finally {
      setBusy(false);
    }
  };

  const actSuggestion = async (id: number, status: 'accepted' | 'dismissed') => {
    await apiSend(`/api/suggestions/${id}`, { status });
    await load();
  };

  if (!data) return <div className="text-slate-400 pt-20 text-center">Loading…</div>;

  return (
    <div className="space-y-4">
      <header className="card bg-gradient-to-br from-card to-bg">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-extrabold tracking-tight">TRANSFORM</h1>
          <span className="text-xs text-slate-400">{data.date}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-full bg-accent/15 text-accent px-2 py-0.5 text-xs font-bold uppercase">
            {data.pre_program ? 'starts mon' : data.phase}
          </span>
          <span className="text-sm text-slate-300">Week {data.week_number} / 36</span>
        </div>
        {data.focus_note && <p className="mt-1 text-xs text-slate-400">{data.focus_note}</p>}
      </header>

      {toast && (
        <div className="fixed top-3 inset-x-4 z-50 mx-auto max-w-lg rounded-xl bg-accent text-black text-sm font-semibold px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}

      {data.suggestions.map((s) => (
        <div key={s.id} className="card border-warn/50">
          <p className="text-sm">{s.message}</p>
          <div className="mt-2 flex gap-2">
            <button className="btn" onClick={() => actSuggestion(s.id, 'accepted')}>Accept</button>
            <button className="btn-ghost" onClick={() => actSuggestion(s.id, 'dismissed')}>Dismiss</button>
          </div>
        </div>
      ))}

      <section className="card flex justify-around">
        <Ring value={data.totals.calories} target={data.targets.calories} label="Calories" unit="cal" color="#34d399" />
        <Ring value={data.totals.protein_g} target={data.targets.protein_g} label="Protein" unit="g" color="#60a5fa" />
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Weight</h2>
          {data.weight_7day_avg != null && (
            <span className="text-xs text-slate-400">7d avg {data.weight_7day_avg} lb</span>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder={data.metrics?.weight_lbs ? `today: ${data.metrics.weight_lbs} lb` : 'lbs'}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <button className="btn" disabled={busy || !weight} onClick={saveWeight}>Save</button>
        </div>
      </section>

      <section className="card">
        <h2 className="font-bold mb-2">Quick add</h2>
        <div className="grid grid-cols-2 gap-2">
          {staples.map((s) => (
            <button key={s.id} className="btn-ghost text-left" disabled={busy} onClick={() => quickAdd(s)}>
              <div className="truncate">{s.name}</div>
              <div className="text-[11px] text-slate-400">{s.calories} cal · {s.protein_g}g P</div>
            </button>
          ))}
        </div>
      </section>

      {data.workout ? (
        <WorkoutCard workout={data.workout} session={data.todays_session} onLogged={load} />
      ) : (
        <section className="card text-center text-slate-400 text-sm">
          Rest day — no scheduled lift. Get steps in. 🚶
        </section>
      )}
    </div>
  );
}

function WorkoutCard({
  workout,
  session,
  onLogged,
}: {
  workout: NonNullable<TodayData['workout']>;
  session: TodayData['todays_session'];
  onLogged: () => Promise<void>;
}) {
  const loggedCount = (exerciseId: number) =>
    session?.sets.filter((s) => s.exercise_id === exerciseId).length ?? 0;

  return (
    <section className="card">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Day {workout.day_number} — {workout.name}</h2>
        <span className="text-xs text-slate-400">tap an exercise to log</span>
      </div>
      <div className="mt-2 divide-y divide-edge">
        {workout.exercises.map((ex) => (
          <ExerciseRow key={ex.exercise_id} ex={ex} logged={loggedCount(ex.exercise_id)} onLogged={onLogged} />
        ))}
      </div>
    </section>
  );
}

function ExerciseRow({
  ex,
  logged,
  onLogged,
}: {
  ex: NonNullable<TodayData['workout']>['exercises'][number];
  logged: number;
  onLogged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const lastWeight = ex.last_session[0]?.weight_lbs;
  const [w, setW] = useState(lastWeight != null ? String(lastWeight) : '');
  const [r, setR] = useState('');
  const [busy, setBusy] = useState(false);

  const logSet = async () => {
    if (!r) return;
    setBusy(true);
    try {
      await apiSend('/api/log/workout', {
        sets: [{ exercise: ex.name, weight: Number(w || 0), reps: Number(r) }],
      });
      setR('');
      await onLogged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-2">
      <button className="w-full text-left" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{ex.name}</span>
          <span className="text-xs text-slate-400">
            {logged > 0 && <span className="text-accent font-bold">{logged}✓ </span>}
            {ex.sets}×{ex.rep_range}
          </span>
        </div>
        <div className="text-[11px] text-slate-500">
          {ex.last_session.length
            ? `last: ${ex.last_session.map((s) => `${s.weight_lbs}×${s.reps}`).join(', ')}`
            : 'no history yet'}
        </div>
      </button>
      {open && (
        <div className="mt-2 flex gap-2">
          <input className="input" type="number" inputMode="decimal" placeholder="lbs" value={w} onChange={(e) => setW(e.target.value)} />
          <input className="input" type="number" inputMode="numeric" placeholder="reps" value={r} onChange={(e) => setR(e.target.value)} />
          <button className="btn whitespace-nowrap" disabled={busy || !r} onClick={logSet}>
            Log set
          </button>
        </div>
      )}
    </div>
  );
}
