import type { BreakType, GoalType, TimerMode } from './types';

export function assertPositiveInt(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }
  return value;
}

export function assertNonNegativeInt(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return value;
}

export function assertNonEmptyString(value: unknown, fieldName: string, maxLen = 120): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${fieldName} cannot be empty.`);
  }
  if (trimmed.length > maxLen) {
    throw new Error(`${fieldName} must be at most ${maxLen} characters.`);
  }
  return trimmed;
}

export function assertOptionalNote(value: unknown, fieldName = 'Study note', maxLen = 200): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLen) {
    throw new Error(`${fieldName} must be at most ${maxLen} characters.`);
  }
  return trimmed;
}

export function assertHexColor(value: unknown, fallback = '#3B82F6'): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.trim())) {
    throw new Error('Color must be a valid 6-digit hex color.');
  }
  return value.trim();
}

export function assertTimerMode(value: unknown): TimerMode {
  if (value !== 'stopwatch' && value !== 'countdown') {
    throw new Error('Timer mode must be "stopwatch" or "countdown".');
  }
  return value;
}

export function assertBreakType(value: unknown): BreakType {
  if (value !== 'short' && value !== 'long') {
    throw new Error('Break type must be "short" or "long".');
  }
  return value;
}

export function assertGoalType(value: unknown): GoalType {
  if (value !== 'daily' && value !== 'weekly') {
    throw new Error('Goal type must be "daily" or "weekly".');
  }
  return value;
}

export function assertIsoTimestamp(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${fieldName} must be a valid ISO timestamp.`);
  }
  return new Date(Date.parse(value)).toISOString();
}

export function assertBackupFilename(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Backup filename must be a string.');
  }
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9._-]+\.db$/.test(trimmed)) {
    throw new Error('Invalid backup filename.');
  }
  return trimmed;
}
