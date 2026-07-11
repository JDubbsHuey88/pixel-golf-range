import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { progressSeries } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(progressSeries(getDb()));
}
