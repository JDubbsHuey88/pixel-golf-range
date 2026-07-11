import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { localToday, weekForDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    week_number: weekForDate(localToday()),
    program: db.prepare('SELECT * FROM program_weeks ORDER BY week_number').all(),
  });
}
