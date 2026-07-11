// Rules engine — run on each /api/today call. Suggestions dedupe on
// rule_key, which embeds the program week (e.g. "slow_loss_w5").
import type { Database } from 'better-sqlite3';
import { epley1RM } from './epley';
import { addDays, localToday, weekForDate, weekStart } from './dates';

const MAIN_LIFTS = ['Flat Bench', 'Back Squat', 'Deadlift', 'Weighted Pull-Ups'];

function avgWeightForWeek(db: Database, week: number): number | null {
  if (week < 1) return null;
  const start = weekStart(week);
  const end = addDays(start, 6);
  const row = db
    .prepare(
      `SELECT AVG(weight_lbs) AS avg, COUNT(weight_lbs) AS n
       FROM daily_metrics WHERE date BETWEEN ? AND ? AND weight_lbs IS NOT NULL`,
    )
    .get(start, end) as { avg: number | null; n: number };
  return row.n >= 2 ? row.avg : null;
}

function phaseForWeek(db: Database, week: number): string | null {
  const row = db
    .prepare('SELECT phase FROM program_weeks WHERE week_number = ?')
    .get(week) as { phase: string } | undefined;
  return row?.phase ?? null;
}

function bestE1rmForWeek(db: Database, exerciseName: string, week: number): number | null {
  const start = weekStart(week);
  const end = addDays(start, 6);
  const rows = db
    .prepare(
      `SELECT sl.weight_lbs AS weight, sl.reps AS reps
       FROM set_logs sl
       JOIN workout_sessions ws ON ws.id = sl.session_id
       JOIN exercises e ON e.id = sl.exercise_id
       WHERE e.name = ? AND ws.date BETWEEN ? AND ?`,
    )
    .all(exerciseName, start, end) as { weight: number; reps: number }[];
  if (!rows.length) return null;
  return Math.max(...rows.map((r) => epley1RM(r.weight, r.reps)));
}

function addSuggestion(db: Database, ruleKey: string, message: string) {
  db.prepare(
    `INSERT OR IGNORE INTO suggestions (date_created, rule_key, message, status)
     VALUES (?, ?, ?, 'open')`,
  ).run(localToday(), ruleKey, message);
}

/** Top of a rep range: "6-8" → 8, "12-15" → 15, "10" → 10, "12/leg" → 12; null for "max"/"60s". */
export function topOfRepRange(repRange: string): number | null {
  const m = repRange.match(/^(\d+)(?:\s*-\s*(\d+))?/);
  if (!m) return null;
  if (/s$/.test(repRange) && !m[2]) return null; // time-based e.g. "60s"
  return m[2] ? parseInt(m[2], 10) : parseInt(m[1], 10);
}

export function runRules(db: Database, today = localToday()) {
  const wc = weekForDate(today);
  const phase = phaseForWeek(db, wc);

  // --- slow_loss / fast_loss (cut only): two consecutive completed weeks ---
  if (phase === 'cut' && wc >= 4) {
    const a1 = avgWeightForWeek(db, wc - 1);
    const a2 = avgWeightForWeek(db, wc - 2);
    const a3 = avgWeightForWeek(db, wc - 3);
    if (a1 != null && a2 != null && a3 != null) {
      const lossRecent = a2 - a1;
      const lossPrior = a3 - a2;
      if (lossRecent < 1.0 && lossPrior < 1.0) {
        addSuggestion(db, `slow_loss_w${wc}`, 'Drop 150 cal or add 2,000 daily steps.');
      }
      if (lossRecent > 2.0 && lossPrior > 2.0) {
        addSuggestion(db, `fast_loss_w${wc}`, 'Add 150 cal — too fast risks muscle.');
      }
    }
  }

  // --- strength_drop: top-set est. 1RM down 2 weeks running on a main lift ---
  if (wc >= 4) {
    for (const lift of MAIN_LIFTS) {
      const e1 = bestE1rmForWeek(db, lift, wc - 1);
      const e2 = bestE1rmForWeek(db, lift, wc - 2);
      const e3 = bestE1rmForWeek(db, lift, wc - 3);
      if (e1 != null && e2 != null && e3 != null && e1 < e2 && e2 < e3) {
        addSuggestion(
          db,
          `strength_drop_${lift.toLowerCase().replace(/[^a-z]+/g, '_')}_w${wc}`,
          `Deload week: 60% volume. Check sleep + protein. (${lift} est. 1RM down 2 weeks running.)`,
        );
      }
    }
  }

  // --- protein_miss: protein < 180g on 3+ of the last 7 logged days ---
  {
    const from = addDays(today, -7);
    const to = addDays(today, -1);
    const rows = db
      .prepare(
        `SELECT date, SUM(protein_g) AS protein FROM food_logs
         WHERE date BETWEEN ? AND ? GROUP BY date`,
      )
      .all(from, to) as { date: string; protein: number }[];
    const misses = rows.filter((r) => r.protein < 180).length;
    if (rows.length >= 3 && misses >= 3) {
      addSuggestion(db, `protein_miss_w${wc}`, 'Protein slipping — lean on Fairlife.');
    }
  }

  // --- photo_due: every 4th week, no photos logged for this week yet ---
  if (wc % 4 === 0) {
    const n = (
      db.prepare('SELECT COUNT(*) AS n FROM photos WHERE week_number = ?').get(wc) as {
        n: number;
      }
    ).n;
    if (n === 0) {
      addSuggestion(db, `photo_due_w${wc}`, 'Photo check-in due: front/side/back.');
    }
  }

  // --- progression_ready: hit top of rep range on all sets last session ---
  {
    const teRows = db
      .prepare(
        `SELECT te.exercise_id, te.rep_range, te.progression_rule, e.name
         FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id`,
      )
      .all() as { exercise_id: number; rep_range: string; progression_rule: string; name: string }[];

    const recentCutoff = addDays(today, -10);
    for (const te of teRows) {
      if (te.progression_rule === 'bodyweight') continue;
      const top = topOfRepRange(te.rep_range);
      if (top == null) continue;

      const last = db
        .prepare(
          `SELECT ws.id, ws.date FROM workout_sessions ws
           JOIN set_logs sl ON sl.session_id = ws.id
           WHERE sl.exercise_id = ?
           GROUP BY ws.id ORDER BY ws.date DESC, ws.id DESC LIMIT 1`,
        )
        .get(te.exercise_id) as { id: number; date: string } | undefined;
      if (!last || last.date < recentCutoff) continue;

      const sets = db
        .prepare('SELECT reps FROM set_logs WHERE session_id = ? AND exercise_id = ?')
        .all(last.id, te.exercise_id) as { reps: number }[];
      if (!sets.length || !sets.every((s) => s.reps >= top)) continue;

      const action =
        te.progression_rule === 'add_10lb'
          ? `Add 10 lb on ${te.name} next session.`
          : te.progression_rule === 'add_5lb'
            ? `Add 5 lb on ${te.name} next session.`
            : `Add a rep on ${te.name} next session.`;
      addSuggestion(
        db,
        `progression_ready_${te.exercise_id}_w${wc}`,
        action,
      );
    }
  }
}
