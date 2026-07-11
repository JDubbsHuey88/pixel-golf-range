import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { localToday, weekForDate, PROGRAM_START } from '@/lib/dates';
import { runRules } from '@/lib/rules';
import {
  dailyFoodTotals,
  openSuggestions,
  programWeek,
  scheduledTemplate,
  todaySession,
  weightSevenDayAvg,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const date = localToday();
  runRules(db, date);

  const weekNumber = weekForDate(date);
  const week = programWeek(db, weekNumber);
  const totals = dailyFoodTotals(db, date);
  const metrics = db.prepare('SELECT * FROM daily_metrics WHERE date = ?').get(date) ?? null;

  return NextResponse.json({
    date,
    program_start: PROGRAM_START,
    pre_program: date < PROGRAM_START,
    week_number: weekNumber,
    phase: week?.phase ?? null,
    focus_note: week?.focus_note ?? null,
    targets: {
      calories: week?.calorie_target ?? null,
      protein_g: week?.protein_target_g ?? null,
    },
    totals: {
      calories: Math.round(totals.calories),
      protein_g: Math.round(totals.protein_g * 10) / 10,
      carbs_g: Math.round(totals.carbs_g * 10) / 10,
      fat_g: Math.round(totals.fat_g * 10) / 10,
      entries: totals.entries,
    },
    weight_7day_avg: weightSevenDayAvg(db, date),
    metrics,
    workout: scheduledTemplate(db, date),
    todays_session: todaySession(db, date),
    suggestions: openSuggestions(db),
  });
}
