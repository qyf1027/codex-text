import type { LocalDate } from './model';

const DAY = 86400000;
function parse(value: LocalDate): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`日期格式无效：${value}`);
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`日期无效：${value}`);
  return date;
}
function iso(date: Date): LocalDate { return date.toISOString().slice(0, 10); }
function workday(date: Date): boolean { return date.getUTCDay() !== 0 && date.getUTCDay() !== 6; }
export function validLocalDate(value: string): boolean { try { parse(value); return true; } catch { return false; } }
export function onOrAfterWorkday(value: LocalDate): LocalDate {
  const date = parse(value);
  while (!workday(date)) date.setTime(date.getTime() + DAY);
  return iso(date);
}
export function nextWorkday(value: LocalDate): LocalDate {
  const date = parse(value);
  do { date.setTime(date.getTime() + DAY); } while (!workday(date));
  return iso(date);
}
export function addWorkdaysInclusive(start: LocalDate, duration: number): LocalDate {
  if (!Number.isInteger(duration) || duration < 1) throw new Error('工期必须为正整数');
  let result = onOrAfterWorkday(start);
  for (let day = 1; day < duration; day++) result = nextWorkday(result);
  return result;
}
