// Parses free-text workout logs like:
//   "incline bench 185x8,185x8,185x7,185x6; pullups +25 x8/8/7/6; dips bw x12/10/9"
// into { exercise, weight, reps } sets. Exercise names are matched against the
// exercises table (case-insensitive contains + a few common gym aliases).

export interface ExerciseLike {
  id: number;
  name: string;
}

export interface ParsedSet {
  exercise: string; // raw name text from input
  weight: number;
  reps: number;
}

const ALIASES: Record<string, string> = {
  'incline bench': 'Incline Barbell Press',
  'incline barbell': 'Incline Barbell Press',
  'pullups': 'Weighted Pull-Ups',
  'pull ups': 'Weighted Pull-Ups',
  'pull-ups': 'Weighted Pull-Ups',
  'weighted pullups': 'Weighted Pull-Ups',
  'ohp': 'Seated DB Shoulder Press',
  'shoulder press': 'Seated DB Shoulder Press',
  'cable row': 'Seated Cable Row',
  'lateral raises': 'DB Lateral Raises',
  'laterals': 'DB Lateral Raises',
  'curls': 'EZ-Bar Curl',
  'ez bar curl': 'EZ-Bar Curl',
  'squat': 'Back Squat',
  'squats': 'Back Squat',
  'rdl': 'Romanian Deadlift',
  'rdls': 'Romanian Deadlift',
  'lunges': 'Walking Lunges',
  'leg curl': 'Lying Leg Curl',
  'calf raises': 'Standing Calf Raise',
  'calves': 'Standing Calf Raise',
  'leg raises': 'Hanging Leg Raises',
  'bench': 'Flat Bench',
  'flat bench': 'Flat Bench',
  'bench press': 'Flat Bench',
  'incline db': 'Incline DB Press',
  'flyes': 'Cable Flyes',
  'flys': 'Cable Flyes',
  'triceps': 'Overhead Triceps Ext',
  'deads': 'Deadlift',
  'deadlifts': 'Deadlift',
  'pulldown': 'Lat Pulldown',
  'pulldowns': 'Lat Pulldown',
  'row': 'Chest-Supported Row',
  'rows': 'Chest-Supported Row',
  'facepulls': 'Face Pulls',
  'face pulls': 'Face Pulls',
  'hammers': 'Hammer Curls',
  'leg press': 'Front Squat or Leg Press',
  'front squat': 'Front Squat or Leg Press',
  'hip thrusts': 'Hip Thrust',
  'extensions': 'Leg Extension',
  'crunches': 'Cable Crunch',
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Match raw exercise text to a known exercise (case-insensitive contains + aliases). */
export function matchExercise<T extends ExerciseLike>(raw: string, exercises: T[]): T | null {
  const q = normalize(raw);
  if (!q) return null;

  const aliasTarget = ALIASES[q];
  if (aliasTarget) {
    const hit = exercises.find((e) => e.name === aliasTarget);
    if (hit) return hit;
  }

  // direct contains, either direction
  let best: T | null = null;
  let bestScore = 0;
  for (const e of exercises) {
    const name = normalize(e.name);
    let score = 0;
    if (name === q) score = 1000;
    else if (name.includes(q)) score = 500 + q.length;
    else if (q.includes(name)) score = 400 + name.length;
    else {
      // token overlap fallback
      const nameTokens = new Set(name.split(' '));
      const hits = q.split(' ').filter((t) => nameTokens.has(t)).length;
      if (hits > 0) score = hits * 10 - name.length / 100;
    }
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

/**
 * Parse one exercise segment's set spec:
 *   "185x8,185x8,185x7"      → per-set weight x reps
 *   "+25 x8/8/7/6"           → one weight (added lbs), reps list
 *   "bw x12/10/9" / "x12/10" → bodyweight (0 lbs), reps list
 */
function parseSetSpec(spec: string): { weight: number; reps: number }[] {
  const s = spec.trim().toLowerCase();

  if (s.includes('/')) {
    const m = s.match(/^(?:\+?\s*(\d+(?:\.\d+)?)|bw)?\s*x?\s*(\d+(?:\s*\/\s*\d+)+)/);
    if (m) {
      const weight = m[1] ? parseFloat(m[1]) : 0;
      return m[2].split('/').map((r) => ({ weight, reps: parseInt(r.trim(), 10) }));
    }
  }

  const sets: { weight: number; reps: number }[] = [];
  const pairRe = /(\d+(?:\.\d+)?)\s*x\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(s)) !== null) {
    sets.push({ weight: parseFloat(m[1]), reps: parseInt(m[2], 10) });
  }
  if (sets.length) return sets;

  // "bw x10" single bodyweight set
  const bw = s.match(/(?:bw\s*)?x\s*(\d+)/);
  if (bw) return [{ weight: 0, reps: parseInt(bw[1], 10) }];
  return [];
}

/** Parse a full free-text description: segments separated by ";" or newlines. */
export function parseWorkoutDescription(desc: string): ParsedSet[] {
  const out: ParsedSet[] = [];
  for (const segment of desc.split(/;|\n/).map((s) => s.trim()).filter(Boolean)) {
    // name = leading text before the first set token (+25 / 185x8 / bw / x8)
    const m = segment.match(/^(.*?)\s+(\+?\d[\d.]*\s*x.*|\+\d.*|bw\b.*|x\s*\d.*|\d+(?:\.\d+)?x\d.*)$/i);
    if (!m) continue;
    const name = m[1].trim();
    for (const set of parseSetSpec(m[2])) {
      out.push({ exercise: name, weight: set.weight, reps: set.reps });
    }
  }
  return out;
}
