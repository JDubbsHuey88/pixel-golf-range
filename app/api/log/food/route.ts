import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { localToday, localTime } from '@/lib/dates';
import { parseFoodDescription, FoodItemLike } from '@/lib/foodParser';
import { dailyFoodTotals } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const MEAL_SLOTS = ['breakfast', 'mid_morning', 'lunch', 'afternoon', 'dinner', 'other'];

function guessMealSlot(time: string): string {
  const h = parseInt(time.slice(0, 2), 10);
  if (h < 10) return 'breakfast';
  if (h < 12) return 'mid_morning';
  if (h < 14) return 'lunch';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'dinner';
  return 'other';
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const date = req.nextUrl.searchParams.get('date') ?? localToday();
  const entries = db
    .prepare(
      `SELECT fl.*, fi.name AS food_name, fi.serving_desc FROM food_logs fl
       LEFT JOIN food_items fi ON fi.id = fl.food_item_id
       WHERE fl.date = ? ORDER BY fl.time, fl.id`,
    )
    .all(date);
  return NextResponse.json({ date, entries, totals: dailyFoodTotals(db, date) });
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
  const time: string = body.time ?? localTime();
  const mealSlot: string = MEAL_SLOTS.includes(body.meal_slot) ? body.meal_slot : guessMealSlot(time);

  const insert = db.prepare(
    `INSERT INTO food_logs (date, time, food_item_id, free_text_desc, quantity,
       calories, protein_g, carbs_g, fat_g, meal_slot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const logged: unknown[] = [];

  if (body.desc && typeof body.desc === 'string') {
    // Natural-language path: fuzzy match against food_items names + aliases.
    const items = db.prepare('SELECT * FROM food_items').all() as (FoodItemLike & Record<string, unknown>)[];
    const parsed = parseFoodDescription(body.desc, items);
    if (!parsed.length) {
      return NextResponse.json({ error: 'Could not parse any food from desc' }, { status: 400 });
    }
    for (const p of parsed) {
      // Unmatched segment: fall back to free text with provided/estimated macros
      // (spread across unmatched entries only if a single unmatched entry).
      const cal = p.food_item_id ? p.calories : Number(body.calories ?? 0);
      const protein = p.food_item_id ? p.protein_g : Number(body.protein_g ?? 0);
      const carbs = p.food_item_id ? p.carbs_g : Number(body.carbs_g ?? 0);
      const fat = p.food_item_id ? p.fat_g : Number(body.fat_g ?? 0);
      const info = insert.run(
        date, time, p.food_item_id, p.free_text_desc, p.quantity,
        cal, protein, carbs, fat, mealSlot,
      );
      logged.push({ id: Number(info.lastInsertRowid), ...p, calories: cal, protein_g: protein });
    }
  } else if (body.food_item_id) {
    const item = db.prepare('SELECT * FROM food_items WHERE id = ?').get(body.food_item_id) as
      | { id: number; name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }
      | undefined;
    if (!item) return NextResponse.json({ error: 'food_item_id not found' }, { status: 404 });
    const qty = Number(body.quantity ?? 1);
    const info = insert.run(
      date, time, item.id, body.free_text_desc ?? null, qty,
      Math.round(item.calories * qty * 10) / 10,
      Math.round(item.protein_g * qty * 10) / 10,
      Math.round(item.carbs_g * qty * 10) / 10,
      Math.round(item.fat_g * qty * 10) / 10,
      mealSlot,
    );
    logged.push({ id: Number(info.lastInsertRowid), matched_name: item.name, quantity: qty });
  } else if (body.calories != null || body.free_text_desc) {
    // Pure free-text entry with caller-supplied macros.
    const info = insert.run(
      date, time, null, body.free_text_desc ?? body.desc ?? 'manual entry',
      Number(body.quantity ?? 1),
      Number(body.calories ?? 0), Number(body.protein_g ?? 0),
      Number(body.carbs_g ?? 0), Number(body.fat_g ?? 0), mealSlot,
    );
    logged.push({ id: Number(info.lastInsertRowid) });
  } else {
    return NextResponse.json(
      { error: 'Provide desc, food_item_id, or free_text_desc + macros' },
      { status: 400 },
    );
  }

  return NextResponse.json({ date, meal_slot: mealSlot, logged, totals: dailyFoodTotals(db, date) });
}

export async function DELETE(req: NextRequest) {
  const unauthorized = requireAuth(req);
  if (unauthorized) return unauthorized;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = getDb();
  const row = db.prepare('SELECT date FROM food_logs WHERE id = ?').get(id) as { date: string } | undefined;
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  db.prepare('DELETE FROM food_logs WHERE id = ?').run(id);
  return NextResponse.json({ deleted: Number(id), totals: dailyFoodTotals(db, row.date) });
}
