'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/client';

interface ProgramWeek {
  week_number: number;
  phase: string;
  start_date: string;
  calorie_target: number;
  protein_target_g: number;
  focus_note: string;
}
interface Measurement {
  id: number;
  date: string;
  waist_in: number | null;
  chest_in: number | null;
  arm_in: number | null;
  shoulders_in: number | null;
  thigh_in: number | null;
}

const PHASE_COLOR: Record<string, string> = {
  cut: 'text-accent',
  transition: 'text-warn',
  build: 'text-accent2',
};

export default function ProgramPage() {
  const [weeks, setWeeks] = useState<ProgramWeek[]>([]);
  const [current, setCurrent] = useState<number>(0);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [form, setForm] = useState({ waist_in: '', chest_in: '', arm_in: '', shoulders_in: '', thigh_in: '' });
  const [busy, setBusy] = useState(false);

  const loadMeasurements = () =>
    apiGet<{ measurements: Measurement[] }>('/api/measurements')
      .then((r) => setMeasurements(r.measurements))
      .catch(console.error);

  useEffect(() => {
    apiGet<{ week_number: number; program: ProgramWeek[] }>('/api/program')
      .then((r) => {
        setWeeks(r.program);
        setCurrent(r.week_number);
      })
      .catch(console.error);
    loadMeasurements();
  }, []);

  const saveMeasurements = async () => {
    const payload = Object.fromEntries(
      Object.entries(form)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => [k, Number(v)]),
    );
    if (!Object.keys(payload).length) return;
    setBusy(true);
    try {
      await apiSend('/api/measurements', payload);
      setForm({ waist_in: '', chest_in: '', arm_in: '', shoulders_in: '', thigh_in: '' });
      await loadMeasurements();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Program</h1>

      <section className="card space-y-2">
        <h2 className="font-bold">Measurements (inches)</h2>
        <div className="grid grid-cols-5 gap-1">
          {(['waist_in', 'chest_in', 'arm_in', 'shoulders_in', 'thigh_in'] as const).map((k) => (
            <input
              key={k}
              className="input px-1 text-center text-sm"
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder={k.replace('_in', '')}
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          ))}
        </div>
        <button className="btn w-full" disabled={busy} onClick={saveMeasurements}>Save today</button>
        {measurements.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-300">
              <thead>
                <tr className="text-slate-500 text-left">
                  <th className="py-1">date</th><th>waist</th><th>chest</th><th>arm</th><th>shldr</th><th>thigh</th>
                </tr>
              </thead>
              <tbody>
                {measurements.slice(0, 8).map((m) => (
                  <tr key={m.id} className="border-t border-edge">
                    <td className="py-1">{m.date}</td>
                    <td>{m.waist_in ?? '—'}</td><td>{m.chest_in ?? '—'}</td>
                    <td>{m.arm_in ?? '—'}</td><td>{m.shoulders_in ?? '—'}</td><td>{m.thigh_in ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        {weeks.map((w) => (
          <div
            key={w.week_number}
            className={`card py-2.5 ${w.week_number === current ? 'border-accent' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-sm">W{w.week_number}</span>
                <span className={`ml-2 text-xs font-bold uppercase ${PHASE_COLOR[w.phase]}`}>{w.phase}</span>
                <span className="ml-2 text-[11px] text-slate-500">{w.start_date}</span>
              </div>
              <div className="text-[11px] text-slate-400">
                {w.calorie_target} cal · {w.protein_target_g}g
              </div>
            </div>
            <p className="text-[11px] text-slate-500">{w.focus_note}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
