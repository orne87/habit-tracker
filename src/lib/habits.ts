export type Habit = {
  id: string;
  label: string;
  icon: string;
  applies_to_all: boolean;
  weekdays: number[] | null;
  sort_order: number;
  is_default: boolean;
  profile_id: string | null;
};

export const DEFAULT_HABIT_SEED: Omit<Habit, 'id' | 'profile_id'>[] = [
  { label: 'Subliminales', icon: '🎧', applies_to_all: true, weekdays: null, sort_order: 1, is_default: true },
  { label: 'Afirmaciones', icon: '✨', applies_to_all: true, weekdays: null, sort_order: 2, is_default: true },
  { label: 'Descarga Física', icon: '👟', applies_to_all: true, weekdays: null, sort_order: 3, is_default: true },
  { label: 'Piano', icon: '🎹', applies_to_all: true, weekdays: null, sort_order: 4, is_default: true },
  { label: 'Estudio', icon: '📚', applies_to_all: true, weekdays: null, sort_order: 5, is_default: true },
  { label: 'Desconexión', icon: '🧘', applies_to_all: true, weekdays: null, sort_order: 6, is_default: true },
  { label: 'Journaling', icon: '✍️', applies_to_all: true, weekdays: null, sort_order: 7, is_default: true },
  { label: 'Miércoles sin redes', icon: '📵', applies_to_all: false, weekdays: [3], sort_order: 8, is_default: true },
  { label: 'Viernes de mimo', icon: '🛁', applies_to_all: false, weekdays: [5], sort_order: 9, is_default: true },
];

export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function habitAppliesToDay(habit: Habit, date: Date): boolean {
  if (habit.applies_to_all) return true;
  if (!habit.weekdays || habit.weekdays.length === 0) return false;
  return habit.weekdays.includes(date.getDay());
}
