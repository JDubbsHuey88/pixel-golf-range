import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDb, PHOTOS_DIR } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { localToday, weekForDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const ANGLES = ['front', 'side', 'back'];

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    photos: db
      .prepare('SELECT id, date, angle, week_number, notes FROM photos ORDER BY date DESC, id DESC')
      .all(),
  });
}

// Multipart upload: fields file, angle, date?, notes?
export async function POST(req: NextRequest) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 });

  const file = form.get('file');
  const angle = String(form.get('angle') ?? '');
  const date = String(form.get('date') || localToday());
  const notes = form.get('notes') ? String(form.get('notes')) : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }
  if (!ANGLES.includes(angle)) {
    return NextResponse.json({ error: `angle must be one of ${ANGLES.join('/')}` }, { status: 400 });
  }

  const ext = path.extname(file.name || '').toLowerCase() || '.jpg';
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(ext) ? ext : '.jpg';
  const week = weekForDate(date);
  const filename = `w${String(week).padStart(2, '0')}_${date}_${angle}_${Date.now()}${safeExt}`;
  const filepath = path.join(PHOTOS_DIR, filename);

  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  fs.writeFileSync(filepath, Buffer.from(await file.arrayBuffer()));

  const db = getDb();
  const info = db
    .prepare('INSERT INTO photos (date, angle, filepath, week_number, notes) VALUES (?, ?, ?, ?, ?)')
    .run(date, angle, path.relative(process.cwd(), filepath), week, notes);

  return NextResponse.json({
    photo: { id: Number(info.lastInsertRowid), date, angle, week_number: week, notes },
  });
}
