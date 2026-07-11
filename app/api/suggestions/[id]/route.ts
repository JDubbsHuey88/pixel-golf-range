import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== 'accepted' && status !== 'dismissed') {
    return NextResponse.json({ error: "status must be 'accepted' or 'dismissed'" }, { status: 400 });
  }

  const db = getDb();
  const info = db.prepare('UPDATE suggestions SET status = ? WHERE id = ?').run(status, params.id);
  if (info.changes === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ suggestion: db.prepare('SELECT * FROM suggestions WHERE id = ?').get(params.id) });
}
