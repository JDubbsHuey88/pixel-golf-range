// Deterministic natural-language food parser. No LLM calls — Eagle does any
// heavy interpretation before hitting the API.

export interface FoodItemLike {
  id: number;
  name: string;
  serving_desc: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  aliases: string; // JSON array of strings
}

export interface ParsedEntry {
  food_item_id: number | null;
  matched_name: string | null;
  free_text_desc: string;
  quantity: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+/ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Split "2 eggs, english muffin and a fairlife" into segments. */
export function splitSegments(desc: string): string[] {
  return desc
    .split(/,|\+|&|\band\b|\bwith\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface QtyResult {
  quantity: number;
  unit: 'serving' | 'oz';
  rest: string;
}

/** Extract a leading/trailing quantity: "2 eggs", "8oz chicken", "x2", "a cup of rice". */
export function extractQuantity(segment: string): QtyResult {
  let s = normalize(segment);
  let quantity = 1;
  let unit: 'serving' | 'oz' = 'serving';

  // trailing "x2"
  const trailing = s.match(/\bx\s*(\d+(?:\.\d+)?)$/);
  if (trailing) {
    quantity = parseFloat(trailing[1]);
    s = s.slice(0, trailing.index).trim();
    return { quantity, unit, rest: s };
  }

  // leading number (int, decimal, or simple fraction), optional oz unit, optional "x"
  const lead = s.match(/^(?:x\s*)?(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(oz|ounces?)?\b\s*(?:of\s+)?/);
  if (lead) {
    const numStr = lead[1].replace(/\s/g, '');
    if (numStr.includes('/')) {
      const [a, b] = numStr.split('/').map(Number);
      quantity = b ? a / b : 1;
    } else {
      quantity = parseFloat(numStr);
    }
    if (lead[2]) unit = 'oz';
    s = s.slice(lead[0].length).trim();
    return { quantity, unit, rest: s };
  }

  // leading article or word number: "a cup of rice", "two eggs"
  const word = s.match(/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+/);
  if (word) {
    quantity = WORD_NUMBERS[word[1]] ?? 1;
    s = s.slice(word[0].length).trim();
    return { quantity, unit, rest: s };
  }

  return { quantity, unit, rest: s };
}

function singular(s: string): string {
  return s.endsWith('s') ? s.slice(0, -1) : s;
}

/** Fuzzy match text against food item names + aliases (lowercase contains). */
export function matchFoodItem<T extends FoodItemLike>(text: string, items: T[]): T | null {
  const input = normalize(text);
  if (!input) return null;
  let best: T | null = null;
  let bestScore = 0;

  for (const item of items) {
    let terms: string[] = [item.name];
    try {
      const aliases = JSON.parse(item.aliases || '[]');
      if (Array.isArray(aliases)) terms = terms.concat(aliases);
    } catch {
      // ignore bad alias JSON
    }
    for (const rawTerm of terms) {
      const term = normalize(String(rawTerm));
      if (!term) continue;
      let score = 0;
      if (term === input || singular(term) === singular(input)) {
        score = 100 + term.length;
      } else if (
        input.includes(term) ||
        singular(input).includes(singular(term))
      ) {
        score = 60 + term.length;
      } else if (term.includes(input)) {
        score = 40 + input.length;
      }
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }
  return best;
}

function servingOz(servingDesc: string): number | null {
  const m = servingDesc.toLowerCase().match(/(\d+(?:\.\d+)?)\s*oz/);
  return m ? parseFloat(m[1]) : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Parse a free-text description like "2 eggs, english muffin and a fairlife"
 * into one entry per segment, matched against known food items.
 */
export function parseFoodDescription<T extends FoodItemLike>(
  desc: string,
  items: T[],
): ParsedEntry[] {
  return splitSegments(desc).map((segment) => {
    const { quantity, unit, rest } = extractQuantity(segment);
    const item = matchFoodItem(rest || segment, items);

    if (!item) {
      return {
        food_item_id: null,
        matched_name: null,
        free_text_desc: segment,
        quantity,
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
      };
    }

    // "8oz chicken" against a serving of "8 oz cooked" → 1 serving.
    let servings = quantity;
    if (unit === 'oz') {
      const oz = servingOz(item.serving_desc);
      servings = oz ? quantity / oz : 1;
    }

    return {
      food_item_id: item.id,
      matched_name: item.name,
      free_text_desc: segment,
      quantity: round1(servings),
      calories: round1(item.calories * servings),
      protein_g: round1(item.protein_g * servings),
      carbs_g: round1(item.carbs_g * servings),
      fat_g: round1(item.fat_g * servings),
    };
  });
}
