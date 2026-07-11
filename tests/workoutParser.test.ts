import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkoutDescription, matchExercise } from '../lib/workoutParser';

const EXERCISES = [
  { id: 1, name: 'Incline Barbell Press' },
  { id: 2, name: 'Weighted Pull-Ups' },
  { id: 7, name: 'Back Squat' },
  { id: 13, name: 'Flat Bench' },
  { id: 19, name: 'Deadlift' },
  { id: 15, name: 'Dips' },
];

test('parses comma-separated weight x reps sets', () => {
  const sets = parseWorkoutDescription('incline bench 185x8,185x8,185x7,185x6');
  assert.equal(sets.length, 4);
  assert.deepEqual(sets[0], { exercise: 'incline bench', weight: 185, reps: 8 });
  assert.deepEqual(sets[3], { exercise: 'incline bench', weight: 185, reps: 6 });
});

test('parses "+25 x8/8/7/6" weighted-bodyweight style', () => {
  const sets = parseWorkoutDescription('pullups +25 x8/8/7/6');
  assert.equal(sets.length, 4);
  assert.deepEqual(sets[0], { exercise: 'pullups', weight: 25, reps: 8 });
  assert.deepEqual(sets[3], { exercise: 'pullups', weight: 25, reps: 6 });
});

test('parses multiple exercises separated by ";"', () => {
  const sets = parseWorkoutDescription('incline bench 185x8,185x7; pullups +25 x8/8; dips bw x12/10');
  assert.equal(sets.length, 6);
  assert.equal(sets[2].exercise, 'pullups');
  assert.deepEqual(sets[4], { exercise: 'dips', weight: 0, reps: 12 });
});

test('matchExercise resolves common gym shorthand', () => {
  assert.equal(matchExercise('incline bench', EXERCISES)?.name, 'Incline Barbell Press');
  assert.equal(matchExercise('pullups', EXERCISES)?.name, 'Weighted Pull-Ups');
  assert.equal(matchExercise('squat', EXERCISES)?.name, 'Back Squat');
  assert.equal(matchExercise('bench', EXERCISES)?.name, 'Flat Bench');
  assert.equal(matchExercise('deadlift', EXERCISES)?.name, 'Deadlift');
  assert.equal(matchExercise('flat bench', EXERCISES)?.name, 'Flat Bench');
});
