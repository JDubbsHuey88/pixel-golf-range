'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/client';

interface Entry {
  id: number;
  time: string | null;
  food_name: string | null;
  free_text_desc: string | null;
  quantity: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meal_slot: string;
}

interface DayData {
  date: string;
  entries: Entry[];
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
}

const SLOTS = ['breakfast', 'mid_morning', 'lunch', 'afternoon', 'dinner', 'other'];
const SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  mid_morning: 'Mid-morning',
  lunch: 'Lunch',
  afternoon: 'Afternoon',
  dinner: 'Dinner',
  other: 'Other',
};

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function FoodPage() {
  const [date, setDate] = useState<string>('');
  const [data, setData] = useState<DayData | null>(null);
  const [desc, setDesc] = useState('');
  const [slot, setSlot] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (d?: string) => {
    const res = await apiGet<DayData>(`/api/log/food${d ? `?date=${d}` : ''}`);
    setData(res);
    setDate(res.date);
  }, []);

  useEffect(() => {
    load().catch(console.error);
  }, [load]);

  const add = async () => {
    if (!desc.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await apiSend('/api/log/food', {
        desc,
        date,
        ...(slot ? { meal_slot: slot } : {}),
      });
      setDesc('');
      await load(date);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const del = async (id: number) => {
    await apiSend(`/api/log/food?id=${id}`, undefined, 'DELETE');
    await load(date);
  };

  if (!data) return <div className="text-slate-400 pt-20 text-center">Loading…</div>;

  const bySlot = SLOTS.map((s) => ({
    slot: s,
    entries: data.entries.filter((e) => e.meal_slot === s),
  })).filter((g) => g.entries.length);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <button className="btn-ghost" onClick={() => load(shiftDate(date, -1))}>←</button>
        <h1 className="font-bold">{date}</h1>
        <button className="btn-ghost" onClick={() => load(shiftDate(date, 1))}>→</button>
      </header>

      <section className="card">
        <div className="grid grid-cols-4 text-center">
          {(
            [
              ['cal', Math.round(data.totals.calories)],
              ['protein', `${Math.round(data.totals.protein_g)}g`],
              ['carbs', `${Math.round(data.totals.carbs_g)}g`],
              ['fat', `${Math.round(data.totals.fat_g)}g`],
            ] as const
          ).map(([label, val]) => (
            <div key={label}>
              <div className="text-lg font-bold">{val}</div>
              <div className="text-[11px] text-slate-400 uppercase">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-2">
        <label className="label">Add food (natural language)</label>
        <input
          className="input"
          placeholder="2 eggs, english muffin and a fairlife"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <div className="flex gap-2">
          <select className="input" value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="">auto slot</option>
            {SLOTS.map((s) => (
              <option key={s} value={s}>{SLOT_LABEL[s]}</option>
            ))}
          </select>
          <button className="btn whitespace-nowrap" disabled={busy || !desc.trim()} onClick={add}>
            Add
          </button>
        </div>
        {err && <p className="text-xs text-red-400">{err}</p>}
      </section>

      {bySlot.length === 0 && (
        <p className="text-center text-sm text-slate-500 pt-6">Nothing logged this day.</p>
      )}

      {bySlot.map((g) => (
        <section key={g.slot} className="card">
          <h2 className="text-xs uppercase tracking-wide text-slate-400 mb-2">{SLOT_LABEL[g.slot]}</h2>
          <ul className="divide-y divide-edge">
            {g.entries.map((e) => (
              <li key={e.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {e.food_name ?? e.free_text_desc}
                    {e.quantity !== 1 && <span className="text-slate-400"> ×{e.quantity}</span>}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {Math.round(e.calories)} cal · {Math.round(e.protein_g)}g P
                    {e.time ? ` · ${e.time}` : ''}
                  </div>
                </div>
                <button className="text-slate-500 text-lg px-2" onClick={() => del(e.id)} aria-label="delete">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
