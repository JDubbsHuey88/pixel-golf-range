import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/photos/compare?w1=&w2= → photo pairs by angle for two weeks.
export async function GET(req: NextRequest) {
  const w1 = Number(req.nextUrl.searchParams.get('w1'));
  const w2 = Number(req.nextUrl.searchParams.get('w2'));
  if (!w1 || !w2) {
    return NextResponse.json({ error: 'w1 and w2 query params required' }, { status: 400 });
  }

  const db = getDb();
  const stmt = db.prepare(
    `SELECT id, date, angle, week_number, notes FROM photos
     WHERE week_number = ? AND angle = ? ORDER BY date DESC, id DESC LIMIT 1`,
  );

  const pairs = (['front', 'side', 'back'] as const).map((angle) => ({
    angle,
    week1: stmt.get(w1, angle) ?? null,
    week2: stmt.get(w2, angle) ?? null,
  }));

  return NextResponse.json({ w1, w2, pairs });
}
