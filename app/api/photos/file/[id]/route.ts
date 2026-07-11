import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const row = db.prepare('SELECT filepath FROM photos WHERE id = ?').get(params.id) as
    | { filepath: string }
    | undefined;
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const abs = path.isAbsolute(row.filepath) ? row.filepath : path.join(process.cwd(), row.filepath);
  if (!fs.existsSync(abs)) return NextResponse.json({ error: 'file missing on disk' }, { status: 404 });

  const buf = fs.readFileSync(abs);
  const mime = MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream';
  return new NextResponse(buf, {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=86400' },
  });
}
