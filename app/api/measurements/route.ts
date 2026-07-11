import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { localToday } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    measurements: db.prepare('SELECT * FROM measurements ORDER BY date DESC').all(),
  });
}

export async function POST(req: NextRequest) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;

  const db = getDb();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const info = db
    .prepare(
      `INSERT INTO measurements (date, waist_in, chest_in, arm_in, shoulders_in, thigh_in)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      body.date ?? localToday(),
      body.waist_in ?? null,
      body.chest_in ?? null,
      body.arm_in ?? null,
      body.shoulders_in ?? null,
      body.thigh_in ?? null,
    );
  return NextResponse.json({
    measurement: db.prepare('SELECT * FROM measurements WHERE id = ?').get(info.lastInsertRowid),
  });
}
