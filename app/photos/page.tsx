'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiSend } from '@/lib/client';

interface Photo {
  id: number;
  date: string;
  angle: 'front' | 'side' | 'back';
  week_number: number | null;
  notes: string | null;
}
interface ComparePair {
  angle: string;
  week1: Photo | null;
  week2: Photo | null;
}

const ANGLES = ['front', 'side', 'back'] as const;

export default function PhotosPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [angle, setAngle] = useState<(typeof ANGLES)[number]>('front');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    apiGet<{ photos: Photo[] }>('/api/photos').then((r) => setPhotos(r.photos)).catch(console.error);

  useEffect(() => {
    load();
  }, []);

  const upload = async (file: File) => {
    setBusy(true);
    setMsg('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('angle', angle);
      await apiSend('/api/photos', form);
      setMsg(`Uploaded ${angle} photo ✓`);
      await load();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const byWeek = useMemo(() => {
    const g: Record<number, Photo[]> = {};
    for (const p of photos) {
      const w = p.week_number ?? 0;
      (g[w] = g[w] ?? []).push(p);
    }
    return Object.entries(g)
      .map(([w, ps]) => ({ week: Number(w), photos: ps }))
      .sort((a, b) => b.week - a.week);
  }, [photos]);

  const weeksWithPhotos = useMemo(
    () => [...new Set(photos.map((p) => p.week_number ?? 0))].sort((a, b) => a - b),
    [photos],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">Photos</h1>

      <section className="card space-y-2">
        <div className="flex gap-2">
          {ANGLES.map((a) => (
            <button
              key={a}
              className={a === angle ? 'btn flex-1' : 'btn-ghost flex-1'}
              onClick={() => setAngle(a)}
            >
              {a}
            </button>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <button className="btn w-full" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Uploading…' : `📷 Capture ${angle} photo`}
        </button>
        {msg && <p className="text-xs text-slate-400">{msg}</p>}
      </section>

      {weeksWithPhotos.length >= 2 && <CompareCard weeks={weeksWithPhotos} />}

      {byWeek.map((g) => (
        <section key={g.week} className="card">
          <h2 className="font-bold mb-2 text-sm">Week {g.week}</h2>
          <div className="grid grid-cols-3 gap-2">
            {g.photos.map((p) => (
              <figure key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/photos/file/${p.id}`}
                  alt={`${p.angle} ${p.date}`}
                  className="rounded-lg w-full aspect-[3/4] object-cover"
                />
                <figcaption className="text-[10px] text-slate-400 text-center mt-0.5">
                  {p.angle} · {p.date}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      {photos.length === 0 && (
        <p className="text-center text-sm text-slate-500 pt-6">No photos yet — first check-in is week 4.</p>
      )}
    </div>
  );
}

function CompareCard({ weeks }: { weeks: number[] }) {
  const [w1, setW1] = useState(weeks[0]);
  const [w2, setW2] = useState(weeks[weeks.length - 1]);
  const [angle, setAngle] = useState('front');
  const [pairs, setPairs] = useState<ComparePair[]>([]);
  const [slider, setSlider] = useState(50);

  useEffect(() => {
    apiGet<{ pairs: ComparePair[] }>(`/api/photos/compare?w1=${w1}&w2=${w2}`)
      .then((r) => setPairs(r.pairs))
      .catch(console.error);
  }, [w1, w2]);

  const pair = pairs.find((p) => p.angle === angle);

  return (
    <section className="card space-y-2">
      <h2 className="font-bold text-sm">Compare</h2>
      <div className="flex gap-2">
        <select className="input" value={w1} onChange={(e) => setW1(Number(e.target.value))}>
          {weeks.map((w) => (
            <option key={w} value={w}>Week {w}</option>
          ))}
        </select>
        <select className="input" value={w2} onChange={(e) => setW2(Number(e.target.value))}>
          {weeks.map((w) => (
            <option key={w} value={w}>Week {w}</option>
          ))}
        </select>
        <select className="input" value={angle} onChange={(e) => setAngle(e.target.value)}>
          {ANGLES.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>

      {pair?.week1 && pair?.week2 ? (
        <>
          <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/photos/file/${pair.week2.id}`}
              alt={`week ${w2}`}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${slider}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/file/${pair.week1.id}`}
                alt={`week ${w1}`}
                className="w-full h-full object-cover"
                style={{ width: `${10000 / slider}%`, maxWidth: 'none' }}
              />
            </div>
            <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${slider}%` }} />
            <span className="absolute top-1 left-1 text-[10px] bg-black/60 rounded px-1">W{w1}</span>
            <span className="absolute top-1 right-1 text-[10px] bg-black/60 rounded px-1">W{w2}</span>
          </div>
          <input
            type="range"
            min={5}
            max={95}
            value={slider}
            onChange={(e) => setSlider(Number(e.target.value))}
            className="w-full accent-emerald-400"
          />
        </>
      ) : (
        <p className="text-xs text-slate-500">No {angle} photos for both weeks.</p>
      )}
    </section>
  );
}
