import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFoodDescription, extractQuantity, matchFoodItem } from '../lib/foodParser';

// Mirror of the seeded staples the parser will run against in production.
const ITEMS = [
  { id: 1, name: 'Fairlife Core Power Elite', serving_desc: '1 bottle', calories: 230, protein_g: 42, carbs_g: 9, fat_g: 3.5, aliases: '["fairlife","elite shake","core power"]' },
  { id: 2, name: 'Fairlife Core Power 26g', serving_desc: '1 bottle', calories: 170, protein_g: 26, carbs_g: 8, fat_g: 4.5, aliases: '["small fairlife"]' },
  { id: 3, name: 'FitCrunch Bar (snack)', serving_desc: '1 bar', calories: 190, protein_g: 16, carbs_g: 15, fat_g: 8, aliases: '["fitcrunch","fit crunch"]' },
  { id: 4, name: 'FitCrunch Bar (full)', serving_desc: '1 bar', calories: 380, protein_g: 30, carbs_g: 28, fat_g: 16, aliases: '["big fitcrunch"]' },
  { id: 5, name: 'English Muffin', serving_desc: '1', calories: 130, protein_g: 5, carbs_g: 26, fat_g: 1, aliases: '["muffin"]' },
  { id: 6, name: 'Whole Egg', serving_desc: '1', calories: 70, protein_g: 6, carbs_g: 0, fat_g: 5, aliases: '["egg","eggs"]' },
  { id: 7, name: 'Egg Whites', serving_desc: '3 tbsp', calories: 25, protein_g: 5, carbs_g: 0, fat_g: 0, aliases: '["whites"]' },
  { id: 8, name: 'Apple', serving_desc: '1 medium', calories: 95, protein_g: 0, carbs_g: 25, fat_g: 0, aliases: '[]' },
  { id: 9, name: 'Chicken Breast', serving_desc: '8 oz cooked', calories: 375, protein_g: 70, carbs_g: 0, fat_g: 8, aliases: '["chicken"]' },
  { id: 12, name: 'White Rice', serving_desc: '1 cup cooked', calories: 205, protein_g: 4, carbs_g: 45, fat_g: 0, aliases: '["rice"]' },
];

test('"2 eggs" → 2 whole eggs with scaled macros', () => {
  const [entry] = parseFoodDescription('2 eggs', ITEMS);
  assert.equal(entry.food_item_id, 6);
  assert.equal(entry.quantity, 2);
  assert.equal(entry.calories, 140);
  assert.equal(entry.protein_g, 12);
});

test('"8oz chicken and a cup of rice" → two entries', () => {
  const entries = parseFoodDescription('8oz chicken and a cup of rice', ITEMS);
  assert.equal(entries.length, 2);

  const [chicken, rice] = entries;
  assert.equal(chicken.food_item_id, 9);
  assert.equal(chicken.quantity, 1); // 8 oz against an 8 oz serving
  assert.equal(chicken.calories, 375);

  assert.equal(rice.food_item_id, 12);
  assert.equal(rice.quantity, 1);
  assert.equal(rice.calories, 205);
});

test('"fitcrunch + apple" → snack bar and apple', () => {
  const entries = parseFoodDescription('fitcrunch + apple', ITEMS);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].food_item_id, 3); // snack bar, not the full bar
  assert.equal(entries[1].food_item_id, 8);
});

test('"2 eggs, english muffin and a fairlife" → three entries', () => {
  const entries = parseFoodDescription('2 eggs, english muffin and a fairlife', ITEMS);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].food_item_id, 6);
  assert.equal(entries[0].quantity, 2);
  assert.equal(entries[1].food_item_id, 5);
  assert.equal(entries[2].food_item_id, 1); // Elite via "fairlife" alias
});

test('"big fitcrunch" matches the full-size bar', () => {
  const [entry] = parseFoodDescription('big fitcrunch', ITEMS);
  assert.equal(entry.food_item_id, 4);
});

test('"4oz chicken" scales an 8 oz serving to half', () => {
  const [entry] = parseFoodDescription('4oz chicken', ITEMS);
  assert.equal(entry.food_item_id, 9);
  assert.equal(entry.quantity, 0.5);
  assert.equal(entry.calories, 187.5);
  assert.equal(entry.protein_g, 35);
});

test('unknown food falls back to free text with zero macros', () => {
  const [entry] = parseFoodDescription('mystery casserole', ITEMS);
  assert.equal(entry.food_item_id, null);
  assert.equal(entry.free_text_desc, 'mystery casserole');
  assert.equal(entry.calories, 0);
});

test('extractQuantity handles "x2", fractions, and word numbers', () => {
  assert.deepEqual(extractQuantity('eggs x2'), { quantity: 2, unit: 'serving', rest: 'eggs' });
  assert.equal(extractQuantity('1/2 cup of rice').quantity, 0.5);
  assert.equal(extractQuantity('two eggs').quantity, 2);
  assert.equal(extractQuantity('a banana').quantity, 1);
});

test('matchFoodItem prefers exact alias over substring', () => {
  assert.equal(matchFoodItem('fairlife', ITEMS)?.id, 1);
  assert.equal(matchFoodItem('small fairlife', ITEMS)?.id, 2);
  assert.equal(matchFoodItem('yogurt', ITEMS), null); // not in this fixture list
});
