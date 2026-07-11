import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { localToday } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const db = getDb();
  const date = req.nextUrl.searchParams.get('date');
  if (date) {
    return NextResponse.json({
      metrics: db.prepare('SELECT * FROM daily_metrics WHERE date = ?').get(date) ?? null,
    });
  }
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 60);
  return NextResponse.json({
    metrics: db.prepare('SELECT * FROM daily_metrics ORDER BY date DESC LIMIT ?').all(limit),
  });
}

// Upsert daily_metrics by date; only provided fields are overwritten.
export async function POST(req: NextRequest) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;

  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const date: string = body.date ?? localToday();

  db.prepare(
    `INSERT INTO daily_metrics (date, weight_lbs, steps, sleep_hours, cardio_min, med_notes, energy_1to5, notes)
     VALUES (@date, @weight_lbs, @steps, @sleep_hours, @cardio_min, @med_notes, @energy_1to5, @notes)
     ON CONFLICT(date) DO UPDATE SET
       weight_lbs  = COALESCE(excluded.weight_lbs, daily_metrics.weight_lbs),
       steps       = COALESCE(excluded.steps, daily_metrics.steps),
       sleep_hours = COALESCE(excluded.sleep_hours, daily_metrics.sleep_hours),
       cardio_min  = COALESCE(excluded.cardio_min, daily_metrics.cardio_min),
       med_notes   = COALESCE(excluded.med_notes, daily_metrics.med_notes),
       energy_1to5 = COALESCE(excluded.energy_1to5, daily_metrics.energy_1to5),
       notes       = COALESCE(excluded.notes, daily_metrics.notes)`,
  ).run({
    date,
    weight_lbs: body.weight_lbs ?? body.weight ?? null,
    steps: body.steps ?? null,
    sleep_hours: body.sleep_hours ?? null,
    cardio_min: body.cardio_min ?? null,
    med_notes: body.med_notes ?? null,
    energy_1to5: body.energy_1to5 ?? null,
    notes: body.notes ?? null,
  });

  return NextResponse.json({
    metrics: db.prepare('SELECT * FROM daily_metrics WHERE date = ?').get(date),
  });
}
