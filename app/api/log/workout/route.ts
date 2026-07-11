import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { localToday } from '@/lib/dates';
import { matchExercise, parseWorkoutDescription, ParsedSet } from '@/lib/workoutParser';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const db = getDb();
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 30);
  const sessions = db
    .prepare(
      `SELECT ws.*, wt.name AS template_name, wt.day_number FROM workout_sessions ws
       LEFT JOIN workout_templates wt ON wt.id = ws.template_id
       ORDER BY ws.date DESC, ws.id DESC LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];
  const setStmt = db.prepare(
    `SELECT sl.*, e.name AS exercise_name FROM set_logs sl
     JOIN exercises e ON e.id = sl.exercise_id
     WHERE sl.session_id = ? ORDER BY sl.id`,
  );
  return NextResponse.json({
    sessions: sessions.map((s) => ({ ...s, sets: setStmt.all(s.id as number) })),
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

  const date: string = body.date ?? localToday();

  // Sets can arrive structured or as free text (MCP path).
  let rawSets: ParsedSet[] = [];
  if (Array.isArray(body.sets)) {
    rawSets = body.sets
      .map((s: Record<string, unknown>) => ({
        exercise: String(s.exercise ?? ''),
        weight: Number(s.weight ?? 0),
        reps: Number(s.reps ?? 0),
        rpe: s.rpe != null ? Number(s.rpe) : null,
      }))
      .filter((s: ParsedSet) => s.exercise && s.reps > 0);
  } else if (typeof body.sets_description === 'string') {
    rawSets = parseWorkoutDescription(body.sets_description);
  }
  if (!rawSets.length && !body.notes && !body.template_day) {
    return NextResponse.json({ error: 'No sets provided' }, { status: 400 });
  }

  const exercises = db.prepare('SELECT id, name FROM exercises').all() as {
    id: number;
    name: string;
  }[];

  // Match each raw set to an exercise (case-insensitive contains).
  const matched: { exercise_id: number; exercise_name: string; weight: number; reps: number; rpe: number | null }[] = [];
  const unmatched: string[] = [];
  for (const s of rawSets) {
    const hit = matchExercise(s.exercise, exercises);
    if (hit) {
      matched.push({
        exercise_id: hit.id,
        exercise_name: hit.name,
        weight: s.weight,
        reps: s.reps,
        rpe: (s as ParsedSet & { rpe?: number | null }).rpe ?? null,
      });
    } else if (!unmatched.includes(s.exercise)) {
      unmatched.push(s.exercise);
    }
  }

  // Resolve template: explicit day, else infer from the first matched exercise.
  let templateId: number | null = null;
  if (body.template_day) {
    const t = db
      .prepare('SELECT id FROM workout_templates WHERE day_number = ?')
      .get(Number(body.template_day)) as { id: number } | undefined;
    templateId = t?.id ?? null;
  } else if (matched.length) {
    const t = db
      .prepare(
        `SELECT template_id AS id FROM template_exercises WHERE exercise_id = ? LIMIT 1`,
      )
      .get(matched[0].exercise_id) as { id: number } | undefined;
    templateId = t?.id ?? null;
  }

  // Upsert session by (date, template) so tap-to-log appends to the same session.
  let session = db
    .prepare(
      `SELECT id FROM workout_sessions WHERE date = ? AND (template_id IS ? OR template_id = ?)
       ORDER BY id DESC LIMIT 1`,
    )
    .get(date, templateId, templateId) as { id: number } | undefined;
  if (!session) {
    const info = db
      .prepare(
        `INSERT INTO workout_sessions (date, template_id, completed, notes, duration_min)
         VALUES (?, ?, 1, ?, ?)`,
      )
      .run(date, templateId, body.notes ?? null, body.duration_min ?? null);
    session = { id: Number(info.lastInsertRowid) };
  } else if (body.notes || body.duration_min) {
    db.prepare(
      `UPDATE workout_sessions SET notes = COALESCE(?, notes),
         duration_min = COALESCE(?, duration_min), completed = 1 WHERE id = ?`,
    ).run(body.notes ?? null, body.duration_min ?? null, session.id);
  }

  const nextSetNumber = db.prepare(
    `SELECT COALESCE(MAX(set_number), 0) + 1 AS n FROM set_logs
     WHERE session_id = ? AND exercise_id = ?`,
  );
  const insertSet = db.prepare(
    `INSERT INTO set_logs (session_id, exercise_id, set_number, weight_lbs, reps, rpe)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const m of matched) {
    const n = (nextSetNumber.get(session.id, m.exercise_id) as { n: number }).n;
    insertSet.run(session.id, m.exercise_id, n, m.weight, m.reps, m.rpe);
  }

  return NextResponse.json({
    session_id: session.id,
    date,
    template_id: templateId,
    logged_sets: matched,
    unmatched_exercises: unmatched,
  });
}

export async function DELETE(req: NextRequest) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  const db = getDb();
  const setId = req.nextUrl.searchParams.get('set_id');
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (setId) {
    db.prepare('DELETE FROM set_logs WHERE id = ?').run(setId);
    return NextResponse.json({ deleted_set: Number(setId) });
  }
  if (sessionId) {
    db.prepare('DELETE FROM set_logs WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(sessionId);
    return NextResponse.json({ deleted_session: Number(sessionId) });
  }
  return NextResponse.json({ error: 'set_id or session_id required' }, { status: 400 });
}
