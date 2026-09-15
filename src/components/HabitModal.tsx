import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { WEEKDAYS_SHORT } from '@/lib/habits';
import type { Habit } from '@/lib/habits';
import { X, Check, Loader2, Trash2 } from 'lucide-react';

type Props = {
  mode: 'add' | 'edit';
  habit?: Habit;
  profileId: string;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: (habit: Habit) => void;
  onDeleted?: (habitId: string) => void;
};

const EMOJI_OPTIONS = ['🎧', '✨', '👟', '🎹', '📚', '🧘', '✍️', '📵', '🛁', '⭐', '🏃', '💧', '🥗', '😴', '📖', '🎯', '💪', '🌅', '🌙', '☕', '🚭', '💊', '🌱', '🧠', '❤️', '🔥', '🎨', '🎸', '🏊', '🚴'];

export default function HabitModal({ mode, habit, profileId, nextSortOrder, onClose, onSaved, onDeleted }: Props) {
  const [label, setLabel] = useState(habit?.label ?? '');
  const [icon, setIcon] = useState(habit?.icon ?? '⭐');
  const [appliesToAll, setAppliesToAll] = useState<boolean | null>(habit ? habit.applies_to_all : null);
  const [selectedDays, setSelectedDays] = useState<number[]>(habit?.weekdays ?? []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (day: number) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const canSave = label.trim().length > 0 && appliesToAll !== null && (appliesToAll || selectedDays.length > 0);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const payload = {
      label: label.trim(),
      icon,
      applies_to_all: appliesToAll,
      weekdays: appliesToAll ? null : selectedDays.map((d) => d.toString()),
      profile_id: profileId,
    };

    if (mode === 'edit' && habit) {
      const { data, error: updateError } = await supabase
        .from('custom_habits')
        .update(payload)
        .eq('id', habit.id)
        .select('id, label, icon, applies_to_all, weekdays, sort_order, is_default, profile_id')
        .single();

      if (updateError || !data) {
        setError('No se pudo guardar. Intenta de nuevo.');
        setSaving(false);
        return;
      }

      onSaved({
        ...data,
        weekdays: (data.weekdays ?? []).map((w: string | number) => Number(w)),
      } as Habit);
    } else {
      const { data, error: insertError } = await supabase
        .from('custom_habits')
        .insert({ ...payload, sort_order: nextSortOrder, is_default: false })
        .select('id, label, icon, applies_to_all, weekdays, sort_order, is_default, profile_id')
        .single();

      if (insertError || !data) {
        setError('No se pudo crear el hábito. Intenta de nuevo.');
        setSaving(false);
        return;
      }

      onSaved({
        ...data,
        weekdays: (data.weekdays ?? []).map((w: string | number) => Number(w)),
      } as Habit);
    }

    onClose();
  };

  const handleDelete = async () => {
    if (!habit) return;
    setDeleting(true);
    await supabase.from('custom_habits').delete().eq('id', habit.id);
    onDeleted?.(habit.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#E9EDE6]">
          <h2 className="text-lg font-bold text-[#4A5A4A]">
            {mode === 'add' ? 'Nuevo hábito' : 'Editar hábito'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F0F2EC] text-[#8C998B] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[#4A5A4A] mb-2">Nombre del hábito</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej: Meditación, Leer 10 páginas..."
              maxLength={40}
              className="w-full px-4 py-2.5 rounded-lg border border-[#E9EDE6] text-sm text-[#4A5A4A] focus:outline-none focus:border-[#6C7A6B] transition-colors"
              autoFocus
            />
          </div>

          {/* Icon picker */}
          <div>
            <label className="block text-sm font-medium text-[#4A5A4A] mb-2">Ícono</label>
            <div className="grid grid-cols-10 gap-1.5">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => setIcon(e)}
                  className={`text-lg w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    icon === e ? 'bg-[#F0F5EE] ring-2 ring-[#6C7A6B]' : 'hover:bg-[#F8F9F5]'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-[#4A5A4A] mb-2">¿Para qué días?</label>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => setAppliesToAll(true)}
                className={`flex items-center gap-3 p-3.5 rounded-lg border-2 transition-all text-left ${
                  appliesToAll === true ? 'border-[#6C7A6B] bg-[#F0F5EE]' : 'border-[#E9EDE6] hover:border-[#8C998B]'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  appliesToAll === true ? 'bg-[#6C7A6B] border-[#6C7A6B]' : 'border-[#C4C4C4]'
                }`}>
                  {appliesToAll === true && <Check size={12} className="text-white" />}
                </div>
                <div>
                  <div className="text-sm font-medium text-[#4A5A4A]">Todos los días</div>
                  <div className="text-xs text-[#8C998B]">Aparece en la lista cada día</div>
                </div>
              </button>

              <button
                onClick={() => setAppliesToAll(false)}
                className={`flex items-center gap-3 p-3.5 rounded-lg border-2 transition-all text-left ${
                  appliesToAll === false ? 'border-[#6C7A6B] bg-[#F0F5EE]' : 'border-[#E9EDE6] hover:border-[#8C998B]'
                }`}
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  appliesToAll === false ? 'bg-[#6C7A6B] border-[#6C7A6B]' : 'border-[#C4C4C4]'
                }`}>
                  {appliesToAll === false && <Check size={12} className="text-white" />}
                </div>
                <div>
                  <div className="text-sm font-medium text-[#4A5A4A]">Días específicos</div>
                  <div className="text-xs text-[#8C998B]">Elige en qué días de la semana</div>
                </div>
              </button>
            </div>
          </div>

          {/* Day selector */}
          {appliesToAll === false && (
            <div>
              <label className="block text-sm font-medium text-[#4A5A4A] mb-2">Selecciona los días</label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS_SHORT.map((name, idx) => (
                  <button
                    key={idx}
                    onClick={() => toggleDay(idx)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      selectedDays.includes(idx) ? 'bg-[#6C7A6B] text-white' : 'bg-[#F8F9F5] text-[#8C998B] hover:bg-[#F0F2EC]'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {selectedDays.length === 0 && <p className="text-xs text-amber-600 mt-2">Selecciona al menos un día</p>}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-[#E9EDE6]">
          {/* Delete (edit mode only) */}
          <div>
            {mode === 'edit' && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500">¿Seguro?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
                  >
                    {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Sí, eliminar
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-[#8C998B] px-2">
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={14} />
                  Eliminar
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-medium text-[#8C998B] hover:bg-[#F0F2EC] transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-[#6C7A6B] hover:bg-[#5A6A5A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {mode === 'add' ? 'Crear' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
