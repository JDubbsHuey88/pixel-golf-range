import type { Database } from 'better-sqlite3';
import { addDays, isoDayOfWeek, weekForDate, weekStart } from './dates';
import { epley1RM } from './epley';

export const MAIN_LIFTS = ['Flat Bench', 'Back Squat', 'Deadlift', 'Weighted Pull-Ups'];

export function programWeek(db: Database, n: number) {
  return db.prepare('SELECT * FROM program_weeks WHERE week_number = ?').get(n) as
    | {
        week_number: number;
        phase: string;
        start_date: string;
        calorie_target: number;
        protein_target_g: number;
        focus_note: string;
      }
    | undefined;
}

export function dailyFoodTotals(db: Database, date: string) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(calories),0) AS calories, COALESCE(SUM(protein_g),0) AS protein_g,
              COALESCE(SUM(carbs_g),0) AS carbs_g, COALESCE(SUM(fat_g),0) AS fat_g,
              COUNT(*) AS entries
       FROM food_logs WHERE date = ?`,
    )
    .get(date) as { calories: number; protein_g: number; carbs_g: number; fat_g: number; entries: number };
}

export function weightSevenDayAvg(db: Database, endDate: string): number | null {
  const row = db
    .prepare(
      `SELECT AVG(weight_lbs) AS avg, COUNT(weight_lbs) AS n FROM daily_metrics
       WHERE date BETWEEN ? AND ? AND weight_lbs IS NOT NULL`,
    )
    .get(addDays(endDate, -6), endDate) as { avg: number | null; n: number };
  return row.n > 0 && row.avg != null ? Math.round(row.avg * 10) / 10 : null;
}

/** Today's scheduled template: Mon-Fri = days 1-5, weekend = rest (null). */
export function scheduledTemplate(db: Database, date: string) {
  const dow = isoDayOfWeek(date);
  if (dow > 5) return null;
  const template = db
    .prepare('SELECT * FROM workout_templates WHERE day_number = ?')
    .get(dow) as { id: number; day_number: number; name: string } | undefined;
  if (!template) return null;

  const exercises = db
    .prepare(
      `SELECT te.exercise_id, e.name, e.muscle_group, te.sets, te.rep_range, te.progression_rule
       FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id
       WHERE te.template_id = ? ORDER BY te.sort_order`,
    )
    .all(template.id) as {
    exercise_id: number;
    name: string;
    muscle_group: string;
    sets: number;
    rep_range: string;
    progression_rule: string;
  }[];

  const lastSets = db.prepare(
    `SELECT sl.weight_lbs, sl.reps, ws.date FROM set_logs sl
     JOIN workout_sessions ws ON ws.id = sl.session_id
     WHERE sl.exercise_id = ? AND ws.date < ?
     ORDER BY ws.date DESC, sl.set_number ASC`,
  );

  return {
    ...template,
    exercises: exercises.map((ex) => {
      const rows = lastSets.all(ex.exercise_id, date) as {
        weight_lbs: number;
        reps: number;
        date: string;
      }[];
      const lastDate = rows[0]?.date ?? null;
      const last_session = lastDate
        ? rows.filter((r) => r.date === lastDate).map((r) => ({ weight_lbs: r.weight_lbs, reps: r.reps }))
        : [];
      return { ...ex, last_session_date: lastDate, last_session };
    }),
  };
}

export function todaySession(db: Database, date: string) {
  const session = db
    .prepare('SELECT * FROM workout_sessions WHERE date = ? ORDER BY id DESC LIMIT 1')
    .get(date) as { id: number } | undefined;
  if (!session) return null;
  const sets = db
    .prepare(
      `SELECT sl.*, e.name AS exercise_name FROM set_logs sl
       JOIN exercises e ON e.id = sl.exercise_id
       WHERE sl.session_id = ? ORDER BY sl.exercise_id, sl.set_number`,
    )
    .all(session.id);
  return { ...session, sets };
}

export function weekRollup(db: Database, n: number) {
  const week = programWeek(db, n);
  if (!week) return null;
  const start = week.start_date;
  const end = addDays(start, 6);

  const weight = db
    .prepare(
      `SELECT AVG(weight_lbs) AS avg, COUNT(weight_lbs) AS n FROM daily_metrics
       WHERE date BETWEEN ? AND ? AND weight_lbs IS NOT NULL`,
    )
    .get(start, end) as { avg: number | null; n: number };

  let priorAvg: number | null = null;
  if (n > 1) {
    const p = programWeek(db, n - 1);
    if (p) {
      const row = db
        .prepare(
          `SELECT AVG(weight_lbs) AS avg FROM daily_metrics
           WHERE date BETWEEN ? AND ? AND weight_lbs IS NOT NULL`,
        )
        .get(p.start_date, addDays(p.start_date, 6)) as { avg: number | null };
      priorAvg = row.avg;
    }
  }

  const adherence = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT template_id) AS n FROM workout_sessions
         WHERE date BETWEEN ? AND ? AND completed = 1`,
      )
      .get(start, end) as { n: number }
  ).n;

  const macros = db
    .prepare(
      `SELECT AVG(day_cal) AS avg_cal, AVG(day_protein) AS avg_protein FROM (
         SELECT date, SUM(calories) AS day_cal, SUM(protein_g) AS day_protein
         FROM food_logs WHERE date BETWEEN ? AND ? GROUP BY date
       )`,
    )
    .get(start, end) as { avg_cal: number | null; avg_protein: number | null };

  const cardio = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM daily_metrics
         WHERE date BETWEEN ? AND ? AND cardio_min > 0`,
      )
      .get(start, end) as { n: number }
  ).n;

  const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
  const avg = weight.n > 0 ? weight.avg : null;
  return {
    week_number: n,
    phase: week.phase,
    start_date: start,
    end_date: end,
    focus_note: week.focus_note,
    calorie_target: week.calorie_target,
    protein_target_g: week.protein_target_g,
    avg_weight_lbs: r1(avg),
    weight_delta_lbs: avg != null && priorAvg != null ? r1(avg - priorAvg) : null,
    weigh_in_days: weight.n,
    workout_adherence: { completed: adherence, target: 5 },
    avg_calories: r1(macros.avg_cal),
    avg_protein_g: r1(macros.avg_protein),
    cardio_sessions: cardio,
  };
}

export function progressSeries(db: Database) {
  const weights = db
    .prepare(
      `SELECT date, weight_lbs FROM daily_metrics
       WHERE weight_lbs IS NOT NULL ORDER BY date`,
    )
    .all() as { date: string; weight_lbs: number }[];

  const weightSeries = weights.map((w, i) => {
    // 7-day trailing average by calendar days
    const from = addDays(w.date, -6);
    const window = weights.filter((x) => x.date >= from && x.date <= w.date);
    const avg = window.reduce((s, x) => s + x.weight_lbs, 0) / window.length;
    return { date: w.date, weight_lbs: w.weight_lbs, avg7: Math.round(avg * 10) / 10 };
  });

  const volumeRows = db
    .prepare(
      `SELECT ws.date, e.muscle_group, SUM(sl.weight_lbs * sl.reps) AS volume
       FROM set_logs sl
       JOIN workout_sessions ws ON ws.id = sl.session_id
       JOIN exercises e ON e.id = sl.exercise_id
       GROUP BY ws.date, e.muscle_group ORDER BY ws.date`,
    )
    .all() as { date: string; muscle_group: string; volume: number }[];
  const volumeByWeek: Record<number, Record<string, number>> = {};
  for (const row of volumeRows) {
    const w = weekForDate(row.date);
    volumeByWeek[w] = volumeByWeek[w] ?? {};
    volumeByWeek[w][row.muscle_group] = (volumeByWeek[w][row.muscle_group] ?? 0) + row.volume;
  }
  const volume = Object.entries(volumeByWeek).map(([week, groups]) => ({
    week_number: Number(week),
    ...groups,
  }));

  const e1rmStmt = db.prepare(
    `SELECT ws.date, sl.weight_lbs, sl.reps FROM set_logs sl
     JOIN workout_sessions ws ON ws.id = sl.session_id
     JOIN exercises e ON e.id = sl.exercise_id
     WHERE e.name = ? ORDER BY ws.date`,
  );
  const e1rm: Record<string, { date: string; e1rm: number }[]> = {};
  for (const lift of MAIN_LIFTS) {
    const rows = e1rmStmt.all(lift) as { date: string; weight_lbs: number; reps: number }[];
    const byDate: Record<string, number> = {};
    for (const r of rows) {
      const est = epley1RM(r.weight_lbs, r.reps);
      byDate[r.date] = Math.max(byDate[r.date] ?? 0, est);
    }
    e1rm[lift] = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, val]) => ({ date, e1rm: val }));
  }

  return { weight: weightSeries, volume_by_week: volume, e1rm };
}

export function openSuggestions(db: Database) {
  return db
    .prepare(`SELECT * FROM suggestions WHERE status = 'open' ORDER BY id DESC`)
    .all();
}

/** photos.week_number relative to program start (clamped 1-36). */
export function photoWeek(date: string): number {
  return weekForDate(date);
}

export { weekStart };
