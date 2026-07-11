import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { weekRollup } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { n: string } }) {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1 || n > 36) {
    return NextResponse.json({ error: 'week must be 1-36' }, { status: 400 });
  }
  const rollup = weekRollup(getDb(), n);
  if (!rollup) return NextResponse.json({ error: 'week not found (run seed)' }, { status: 404 });
  return NextResponse.json(rollup);
}
