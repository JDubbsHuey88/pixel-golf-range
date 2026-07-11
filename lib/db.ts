import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
export const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
const DB_PATH = path.join(DATA_DIR, 'transform.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS program_weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_number INTEGER NOT NULL UNIQUE,
  phase TEXT NOT NULL CHECK (phase IN ('cut','transition','build')),
  start_date TEXT NOT NULL,
  calorie_target INTEGER NOT NULL,
  protein_target_g INTEGER NOT NULL,
  focus_note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  muscle_group TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS workout_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS template_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES workout_templates(id),
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  sort_order INTEGER NOT NULL,
  sets INTEGER NOT NULL,
  rep_range TEXT NOT NULL,
  progression_rule TEXT NOT NULL CHECK (progression_rule IN ('add_5lb','add_10lb','add_reps','bodyweight'))
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  template_id INTEGER REFERENCES workout_templates(id),
  completed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  duration_min INTEGER
);

CREATE TABLE IF NOT EXISTS set_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES workout_sessions(id),
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  set_number INTEGER NOT NULL,
  weight_lbs REAL NOT NULL,
  reps INTEGER NOT NULL,
  rpe REAL
);

CREATE TABLE IF NOT EXISTS food_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  brand TEXT,
  serving_desc TEXT NOT NULL,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  is_staple INTEGER NOT NULL DEFAULT 0,
  aliases TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS food_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  time TEXT,
  food_item_id INTEGER REFERENCES food_items(id),
  free_text_desc TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  calories REAL NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carbs_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  meal_slot TEXT NOT NULL DEFAULT 'other'
    CHECK (meal_slot IN ('breakfast','mid_morning','lunch','afternoon','dinner','other'))
);
CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(date);

CREATE TABLE IF NOT EXISTS daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  weight_lbs REAL,
  steps INTEGER,
  sleep_hours REAL,
  cardio_min INTEGER,
  med_notes TEXT,
  energy_1to5 INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  angle TEXT NOT NULL CHECK (angle IN ('front','side','back')),
  filepath TEXT NOT NULL,
  week_number INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  waist_in REAL,
  chest_in REAL,
  arm_in REAL,
  shoulders_in REAL,
  thigh_in REAL
);

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date_created TEXT NOT NULL,
  rule_key TEXT NOT NULL UNIQUE,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed'))
);
`;

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(SCHEMA);
  return _db;
}
