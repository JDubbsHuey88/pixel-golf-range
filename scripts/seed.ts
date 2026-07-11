// Idempotent seed: program calendar, workout templates, staple foods.
// Run with `npm run seed`. Safe to run repeatedly — inserts by natural key.
import { getDb } from '../lib/db';
import { addDays, PROGRAM_START } from '../lib/dates';

const db = getDb();

// ---------- Program calendar: 36 weeks starting Monday 2026-07-13 ----------
function focusNote(week: number): string {
  if (week <= 2) return 'Baseline + form + photos';
  if (week <= 4) return 'First progression wave';
  if (week <= 8) return 'Load increases';
  if (week <= 12) return 'Grind phase (deload if needed)';
  if (week <= 16) return 'Definition emerges';
  if (week <= 20) return 'Finish the cut';
  if (week <= 22) return 'Reverse into build';
  if (week <= 28) return 'Volume push';
  if (week <= 32) return 'Heavy block';
  return 'Peak + final photos';
}

function phaseTargets(week: number): { phase: string; cal: number; protein: number } {
  if (week <= 20) return { phase: 'cut', cal: 2200, protein: 200 };
  if (week <= 22) return { phase: 'transition', cal: 2400, protein: 200 };
  return { phase: 'build', cal: 2600, protein: 210 };
}

const insertWeek = db.prepare(`
  INSERT OR IGNORE INTO program_weeks
    (week_number, phase, start_date, calorie_target, protein_target_g, focus_note)
  VALUES (?, ?, ?, ?, ?, ?)
`);
for (let w = 1; w <= 36; w++) {
  const { phase, cal, protein } = phaseTargets(w);
  insertWeek.run(w, phase, addDays(PROGRAM_START, (w - 1) * 7), cal, protein, focusNote(w));
}

// ---------- Exercises + 5-day split templates ----------
type Ex = [name: string, muscle: string, sets: number, repRange: string, rule: string];

const TEMPLATES: { day: number; name: string; exercises: Ex[] }[] = [
  {
    day: 1,
    name: 'Upper',
    exercises: [
      ['Incline Barbell Press', 'chest', 4, '6-8', 'add_5lb'],
      ['Weighted Pull-Ups', 'back', 4, '6-8', 'add_5lb'],
      ['Seated DB Shoulder Press', 'shoulders', 3, '8-10', 'add_5lb'],
      ['Seated Cable Row', 'back', 3, '10', 'add_5lb'],
      ['DB Lateral Raises', 'shoulders', 4, '12-15', 'add_reps'],
      ['EZ-Bar Curl', 'biceps', 3, '10', 'add_5lb'],
    ],
  },
  {
    day: 2,
    name: 'Lower',
    exercises: [
      ['Back Squat', 'quads', 4, '6-8', 'add_10lb'],
      ['Romanian Deadlift', 'hamstrings', 3, '8', 'add_10lb'],
      ['Walking Lunges', 'quads', 3, '12/leg', 'add_5lb'],
      ['Lying Leg Curl', 'hamstrings', 3, '12', 'add_5lb'],
      ['Standing Calf Raise', 'calves', 4, '15', 'add_5lb'],
      ['Hanging Leg Raises', 'abs', 3, '12', 'bodyweight'],
    ],
  },
  {
    day: 3,
    name: 'Push',
    exercises: [
      ['Flat Bench', 'chest', 4, '6-8', 'add_5lb'],
      ['Incline DB Press', 'chest', 3, '10', 'add_5lb'],
      ['Dips', 'triceps', 3, 'max', 'bodyweight'],
      ['Cable Lateral Raises', 'shoulders', 4, '15', 'add_reps'],
      ['Cable Flyes', 'chest', 3, '12', 'add_5lb'],
      ['Overhead Triceps Ext', 'triceps', 3, '12', 'add_5lb'],
    ],
  },
  {
    day: 4,
    name: 'Pull',
    exercises: [
      ['Deadlift', 'back', 3, '5', 'add_10lb'],
      ['Lat Pulldown', 'back', 4, '10', 'add_5lb'],
      ['Chest-Supported Row', 'back', 3, '10', 'add_5lb'],
      ['Face Pulls', 'shoulders', 3, '15', 'add_reps'],
      ['Hammer Curls', 'biceps', 3, '10', 'add_5lb'],
      ['Incline DB Curls', 'biceps', 3, '12', 'add_5lb'],
    ],
  },
  {
    day: 5,
    name: 'Legs+Abs',
    exercises: [
      ['Front Squat or Leg Press', 'quads', 4, '8', 'add_10lb'],
      ['Hip Thrust', 'glutes', 3, '10', 'add_10lb'],
      ['Leg Extension', 'quads', 3, '15', 'add_reps'],
      ['Cable Crunch', 'abs', 4, '12', 'add_reps'],
      ['Ab Wheel', 'abs', 3, '10', 'bodyweight'],
      ['Plank', 'abs', 3, '60s', 'bodyweight'],
    ],
  },
];

const insertExercise = db.prepare(
  'INSERT OR IGNORE INTO exercises (name, muscle_group) VALUES (?, ?)',
);
const getExercise = db.prepare('SELECT id FROM exercises WHERE name = ?');
const insertTemplate = db.prepare(
  'INSERT OR IGNORE INTO workout_templates (day_number, name) VALUES (?, ?)',
);
const getTemplate = db.prepare('SELECT id FROM workout_templates WHERE day_number = ?');
const hasTemplateExercise = db.prepare(
  'SELECT id FROM template_exercises WHERE template_id = ? AND exercise_id = ?',
);
const insertTemplateExercise = db.prepare(`
  INSERT INTO template_exercises (template_id, exercise_id, sort_order, sets, rep_range, progression_rule)
  VALUES (?, ?, ?, ?, ?, ?)
`);

for (const t of TEMPLATES) {
  insertTemplate.run(t.day, t.name);
  const templateId = (getTemplate.get(t.day) as { id: number }).id;
  t.exercises.forEach(([name, muscle, sets, repRange, rule], i) => {
    insertExercise.run(name, muscle);
    const exerciseId = (getExercise.get(name) as { id: number }).id;
    if (!hasTemplateExercise.get(templateId, exerciseId)) {
      insertTemplateExercise.run(templateId, exerciseId, i + 1, sets, repRange, rule);
    }
  });
}

// ---------- Staple foods ----------
type Food = [
  name: string, serving: string, cal: number, p: number, c: number, f: number, aliases: string[],
];
const STAPLES: Food[] = [
  ['Fairlife Core Power Elite', '1 bottle', 230, 42, 9, 3.5, ['fairlife', 'elite shake', 'core power']],
  ['Fairlife Core Power 26g', '1 bottle', 170, 26, 8, 4.5, ['small fairlife']],
  ['FitCrunch Bar (snack)', '1 bar', 190, 16, 15, 8, ['fitcrunch', 'fit crunch']],
  ['FitCrunch Bar (full)', '1 bar', 380, 30, 28, 16, ['big fitcrunch']],
  ['English Muffin', '1', 130, 5, 26, 1, ['muffin']],
  ['Whole Egg', '1', 70, 6, 0, 5, ['egg', 'eggs']],
  ['Egg Whites', '3 tbsp', 25, 5, 0, 0, ['whites']],
  ['Apple', '1 medium', 95, 0, 25, 0, []],
  ['Chicken Breast', '8 oz cooked', 375, 70, 0, 8, ['chicken']],
  ['Sirloin Steak', '8 oz cooked', 460, 60, 0, 22, ['steak']],
  ['Salmon', '8 oz cooked', 465, 50, 0, 28, []],
  ['White Rice', '1 cup cooked', 205, 4, 45, 0, ['rice']],
  ['Potato', '1 medium', 160, 4, 37, 0, []],
  ['Greek Yogurt 0%', '1 cup', 130, 22, 9, 0, ['yogurt']],
  ['Banana', '1', 105, 1, 27, 0, []],
];

const insertFood = db.prepare(`
  INSERT OR IGNORE INTO food_items
    (name, serving_desc, calories, protein_g, carbs_g, fat_g, is_staple, aliases)
  VALUES (?, ?, ?, ?, ?, ?, 1, ?)
`);
for (const [name, serving, cal, p, c, f, aliases] of STAPLES) {
  insertFood.run(name, serving, cal, p, c, f, JSON.stringify(aliases));
}

const counts = {
  program_weeks: db.prepare('SELECT COUNT(*) n FROM program_weeks').get(),
  exercises: db.prepare('SELECT COUNT(*) n FROM exercises').get(),
  templates: db.prepare('SELECT COUNT(*) n FROM workout_templates').get(),
  template_exercises: db.prepare('SELECT COUNT(*) n FROM template_exercises').get(),
  food_items: db.prepare('SELECT COUNT(*) n FROM food_items').get(),
};
console.log('Seed complete:', JSON.stringify(counts));
