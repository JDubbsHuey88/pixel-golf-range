'use client';

export default function Ring({
  value,
  target,
  label,
  unit,
  color,
}: {
  value: number;
  target: number | null;
  label: string;
  unit: string;
  color: string;
}) {
  const pct = target ? Math.min(1, value / target) : 0;
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 100" className="w-28 h-28 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#232c37" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <div className="-mt-[4.7rem] mb-8 text-center rotate-0">
        <div className="text-lg font-bold leading-tight">{Math.round(value)}</div>
        <div className="text-[10px] text-slate-400">/ {target ?? '—'} {unit}</div>
      </div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}
