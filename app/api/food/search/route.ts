import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const db = getDb();
  const q = (req.nextUrl.searchParams.get('q') ?? '').toLowerCase().trim();
  const staplesOnly = req.nextUrl.searchParams.get('staples') === '1';

  let items = db.prepare('SELECT * FROM food_items ORDER BY is_staple DESC, name').all() as {
    name: string;
    aliases: string;
    is_staple: number;
  }[];
  if (staplesOnly) items = items.filter((i) => i.is_staple);
  if (q) {
    items = items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.aliases.toLowerCase().includes(q),
    );
  }
  return NextResponse.json({ items });
}
