#!/usr/bin/env node
// TRANSFORM MCP server — stdio transport. Each tool wraps the app's REST API
// using API_TOKEN + TRANSFORM_API_URL from the environment.
// Build: npm run mcp:build   Run: node mcp/server.js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = process.env.TRANSFORM_API_URL ?? 'http://localhost:3000';
const TOKEN = process.env.API_TOKEN ?? '';

async function api(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text;
}

function asResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

const server = new McpServer({ name: 'transform-tracker', version: '1.0.0' });

server.tool(
  'log_food',
  'Log food from natural language, e.g. "2 eggs, english muffin and a fairlife". ' +
    'Known staples are matched with macros; unknown items are stored as free text.',
  {
    description: z.string().describe('What was eaten, e.g. "8oz chicken and a cup of rice"'),
    meal_slot: z
      .enum(['breakfast', 'mid_morning', 'lunch', 'afternoon', 'dinner', 'other'])
      .optional()
      .describe('Meal slot; inferred from time of day when omitted'),
  },
  async ({ description, meal_slot }) =>
    asResult(await api('/api/log/food', 'POST', { desc: description, meal_slot })),
);

server.tool(
  'log_workout',
  'Log a workout from free text. Format: exercises separated by ";", sets as ' +
    '"185x8,185x7" (weight x reps) or "+25 x8/8/7/6" (one weight, reps list; bw = bodyweight). ' +
    'Example: "incline bench 185x8,185x8,185x7; pullups +25 x8/8/7/6"',
  {
    day_number: z.number().int().min(1).max(5).optional()
      .describe('Template day 1=Upper 2=Lower 3=Push 4=Pull 5=Legs+Abs (inferred if omitted)'),
    sets_description: z.string().describe('Free-text sets'),
    notes: z.string().optional(),
  },
  async ({ day_number, sets_description, notes }) =>
    asResult(
      await api('/api/log/workout', 'POST', {
        template_day: day_number,
        sets_description,
        notes,
      }),
    ),
);

server.tool(
  'log_metrics',
  'Upsert today\'s daily metrics (weight, steps, sleep, cardio, med notes). Only provided fields change.',
  {
    weight: z.number().optional().describe('Body weight in lbs'),
    steps: z.number().int().optional(),
    sleep_hours: z.number().optional(),
    cardio_min: z.number().int().optional(),
    med_notes: z.string().optional().describe('Peptide doses / meds, free text'),
    energy_1to5: z.number().int().min(1).max(5).optional(),
    date: z.string().optional().describe('YYYY-MM-DD, defaults to today (America/Denver)'),
  },
  async (args) =>
    asResult(
      await api('/api/metrics', 'POST', {
        weight_lbs: args.weight,
        steps: args.steps,
        sleep_hours: args.sleep_hours,
        cardio_min: args.cardio_min,
        med_notes: args.med_notes,
        energy_1to5: args.energy_1to5,
        date: args.date,
      }),
    ),
);

server.tool(
  'get_today',
  'Current week/phase, calorie+protein targets and running totals, today\'s scheduled ' +
    'workout with last weights, 7-day avg weight, and open suggestions.',
  {},
  async () => asResult(await api('/api/today')),
);

server.tool(
  'get_week_summary',
  'Weekly rollup: avg weight, delta vs prior week, workout adherence, avg macros, cardio count.',
  {
    week_number: z.number().int().min(1).max(36).optional()
      .describe('Program week 1-36; defaults to the current week'),
  },
  async ({ week_number }) => {
    let n = week_number;
    if (!n) {
      const today = JSON.parse(await api('/api/today'));
      n = today.week_number as number;
    }
    return asResult(await api(`/api/week/${n}`));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`transform-tracker MCP server connected (API: ${BASE_URL})`);
