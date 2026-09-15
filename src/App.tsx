import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { HabitCheck, Profile } from '@/lib/supabase';
import {
  MONTH_NAMES,
  WEEKDAYS,
  formatMonth,
  getDaysInMonth,
  habitAppliesToDay,
} from '@/lib/habits';
import type { Habit } from '@/lib/habits';
import ProfileGate from '@/components/ProfileGate';
import HabitModal from '@/components/HabitModal';
import {
  Printer, Check, ChevronLeft, ChevronRight, TrendingUp,
  Calendar, List, Plus, Pencil, LogOut, User,
} from 'lucide-react';

type ViewMode = 'dia' | 'mes';

type HabitRow = {
  id: string;
  label: string;
  icon: string;
  applies_to_all: boolean;
  weekdays: string[] | null;
  sort_order: number;
  is_default: boolean;
  profile_id: string | null;
};

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('dia');
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [monthId, setMonthId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'synced' | 'syncing'>('idle');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitModal, setHabitModal] = useState<{ mode: 'add' | 'edit'; habit?: Habit } | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const profileId = profile?.id;
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const day = currentDate.getDate();
  const monthStr = formatMonth(currentDate);
  const daysInMonth = getDaysInMonth(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Load habits for profile
  const loadHabits = useCallback(async () => {
    if (!profileId) return;
    const { data, error } = await supabase
      .from('custom_habits')
      .select('id, label, icon, applies_to_all, weekdays, sort_order, is_default, profile_id')
      .eq('profile_id', profileId)
      .order('sort_order', { ascending: true });

    if (error || !data) return;

    const habitList: Habit[] = (data as HabitRow[]).map((row) => ({
      id: row.id,
      label: row.label,
      icon: row.icon,
      applies_to_all: row.applies_to_all,
      weekdays: (row.weekdays ?? []).map((w) => Number(w)),
      sort_order: row.sort_order,
      is_default: row.is_default,
      profile_id: row.profile_id,
    }));

    setHabits(habitList);
  }, [profileId]);

  // Load month data
  const loadMonth = useCallback(async (mStr: string) => {
    if (!profileId) return;
    setLoading(true);

    const { data: monthData } = await supabase
      .from('habit_months')
      .select('id, month')
      .eq('profile_id', profileId)
      .eq('month', mStr)
      .maybeSingle();

    let mId = monthData?.id ?? null;

    if (!mId) {
      const { data: newMonth, error } = await supabase
        .from('habit_months')
        .insert({ month: mStr, profile_id: profileId })
        .select('id')
        .single();
      if (!error && newMonth) mId = newMonth.id;
    }

    setMonthId(mId);

    if (mId) {
      const { data: checkData } = await supabase
        .from('habit_checks')
        .select('id, day, habit_key, checked')
        .eq('month_id', mId)
        .eq('profile_id', profileId);

      const checkMap: Record<string, boolean> = {};
      (checkData ?? []).forEach((c: HabitCheck) => {
        checkMap[`${c.day}-${c.habit_key}`] = c.checked;
      });
      setChecks(checkMap);
    } else {
      setChecks({});
    }
    setLoading(false);
    setSyncStatus('synced');
  }, [profileId]);

  useEffect(() => {
    if (profileId) loadHabits();
  }, [profileId, loadHabits]);

  useEffect(() => {
    if (profileId) loadMonth(monthStr);
  }, [monthStr, profileId, loadMonth]);

  const toggleCheck = useCallback(
    async (targetDay: number, habitKey: string) => {
      if (!monthId || !profileId) return;
      const key = `${targetDay}-${habitKey}`;
      const newValue = !checks[key];

      setChecks((prev) => {
        const next = { ...prev };
        if (newValue) next[key] = true;
        else delete next[key];
        return next;
      });
      setSyncStatus('syncing');

      if (newValue) {
        await supabase.from('habit_checks').upsert({
          month_id: monthId,
          day: targetDay,
          habit_key: habitKey,
          checked: true,
          profile_id: profileId,
        });
      } else {
        await supabase
          .from('habit_checks')
          .delete()
          .eq('month_id', monthId)
          .eq('day', targetDay)
          .eq('habit_key', habitKey)
          .eq('profile_id', profileId);
      }
      setSyncStatus('synced');
    },
    [checks, monthId, profileId]
  );

  // Habit CRUD callbacks
  const handleHabitSaved = (habit: Habit) => {
    setHabits((prev) => {
      const idx = prev.findIndex((h) => h.id === habit.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = habit;
        return next;
      }
      return [...prev, habit].sort((a, b) => a.sort_order - b.sort_order);
    });
  };

  const handleHabitDeleted = (habitId: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== habitId));
  };

  // Navigation
  const prevPeriod = () => {
    if (viewMode === 'dia') setCurrentDate(new Date(year, month, day - 1));
    else setCurrentDate(new Date(year, month - 1, 1));
  };
  const nextPeriod = () => {
    if (viewMode === 'dia') setCurrentDate(new Date(year, month, day + 1));
    else setCurrentDate(new Date(year, month + 1, 1));
  };
  const goToday = () => setCurrentDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  const handleSwitchProfile = () => {
    localStorage.removeItem('habit-tracker-profile-id');
    setProfile(null);
    setHabits([]);
    setChecks({});
    setShowProfileMenu(false);
  };

  // Day view: habits that apply to current day
  const habitsForCurrentDay = useMemo(() => {
    return habits.filter((h) => habitAppliesToDay(h, currentDate));
  }, [habits, currentDate]);

  // Day stats
  const dayStats = useMemo(() => {
    const completed = habitsForCurrentDay.filter((h) => checks[`${day}-${h.id}`]).length;
    return { completed, total: habitsForCurrentDay.length };
  }, [checks, day, habitsForCurrentDay]);

  // Month stats
  const monthStats = useMemo(() => {
    const checkedCount = Object.keys(checks).filter((k) => checks[k]).length;
    let totalPossible = 0;
    for (const d of days) {
      const dateForDay = new Date(year, month, d);
      totalPossible += habits.filter((h) => habitAppliesToDay(h, dateForDay)).length;
    }
    const percentage = totalPossible > 0 ? Math.round((checkedCount / totalPossible) * 100) : 0;

    const perHabit = habits.map((h) => {
      const applicableDays = days.filter((d) => habitAppliesToDay(h, new Date(year, month, d)));
      const count = applicableDays.filter((d) => checks[`${d}-${h.id}`]).length;
      return { ...h, count, total: applicableDays.length };
    });

    return { checkedCount, totalPossible, percentage, perHabit };
  }, [checks, days, habits, year, month]);

  const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  // Show profile gate if no profile
  if (!profile) {
    return <ProfileGate onProfileReady={setProfile} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F6F1] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-[3px] border-[#6C7A6B] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#6C7A6B] text-sm font-medium tracking-wide">Cargando tu progreso...</p>
        </div>
      </div>
    );
  }

  const weekdayName = WEEKDAYS[currentDate.getDay()];

  return (
    <div className="min-h-screen bg-[#F5F6F1] print:bg-white">
      {/* Screen header */}
      <div className="print:hidden max-w-5xl mx-auto px-6 pt-8 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#4A5A4A] tracking-tight" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              Mi 1% Diario
            </h1>
            <p className="text-sm text-[#8C998B] mt-1">Hola, {profile.name} 👋</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-[#8C998B] mr-2">
              <span className={`w-2 h-2 rounded-full ${syncStatus === 'syncing' ? 'bg-amber-400 animate-pulse' : syncStatus === 'synced' ? 'bg-green-500' : 'bg-gray-300'}`} />
              {syncStatus === 'syncing' ? 'Sincronizando...' : 'Guardado'}
            </div>

            {/* View toggle */}
            <div className="flex bg-white rounded-lg border border-[#E9EDE6] p-1">
              <button
                onClick={() => setViewMode('dia')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'dia' ? 'bg-[#6C7A6B] text-white shadow-sm' : 'text-[#8C998B] hover:text-[#6C7A6B]'
                }`}
              >
                <Calendar size={15} />
                Día
              </button>
              <button
                onClick={() => setViewMode('mes')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  viewMode === 'mes' ? 'bg-[#6C7A6B] text-white shadow-sm' : 'text-[#8C998B] hover:text-[#6C7A6B]'
                }`}
              >
                <List size={15} />
                Mes
              </button>
            </div>

            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-[#6C7A6B] hover:bg-[#5A6A5A] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Printer size={16} />
              Imprimir
            </button>

            {/* Profile menu */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 bg-white border border-[#E9EDE6] rounded-lg px-3 py-2.5 text-sm font-medium text-[#4A5A4A] hover:border-[#6C7A6B] transition-colors"
              >
                <User size={16} className="text-[#6C7A6B]" />
                <span className="max-w-[80px] truncate">{profile.name}</span>
              </button>
              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)} />
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-[#E9EDE6] py-2 z-20">
                    <div className="px-4 py-2 border-b border-[#E9EDE6]">
                      <p className="text-xs text-[#8C998B]">Sesión actual</p>
                      <p className="text-sm font-medium text-[#4A5A4A] truncate">{profile.name}</p>
                    </div>
                    <button
                      onClick={handleSwitchProfile}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[#8C998B] hover:bg-[#F0F2EC] hover:text-[#6C7A6B] transition-colors"
                    >
                      <LogOut size={15} />
                      Cambiar perfil
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation bar */}
      <div className="print:hidden max-w-5xl mx-auto px-6 mb-6">
        <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-[#E9EDE6] p-3">
          <button onClick={prevPeriod} className="p-2 rounded-lg hover:bg-[#F0F2EC] text-[#6C7A6B] transition-colors">
            <ChevronLeft size={20} />
          </button>
          <button onClick={goToday} className="text-center group">
            <div className="text-lg font-semibold text-[#4A5A4A] group-hover:text-[#6C7A6B] transition-colors">
              {viewMode === 'dia'
                ? `${weekdayName} ${day} de ${MONTH_NAMES[month]}`
                : `${MONTH_NAMES[month]} ${year}`}
            </div>
            <div className="text-xs text-[#8C998B] mt-0.5">{isToday ? 'Hoy' : 'Click para ir a hoy'}</div>
          </button>
          <button onClick={nextPeriod} className="p-2 rounded-lg hover:bg-[#F0F2EC] text-[#6C7A6B] transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* === DAY VIEW === */}
      {viewMode === 'dia' && (
        <>
          <div className="print:hidden max-w-5xl mx-auto px-6 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-[#E9EDE6] p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-semibold text-[#4A5A4A] text-lg">
                    {weekdayName} {day} de {MONTH_NAMES[month]}
                  </h3>
                  <p className="text-sm text-[#8C998B] mt-0.5">
                    {dayStats.completed} de {dayStats.total} hábitos completados
                  </p>
                </div>
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="#E9EDE6" strokeWidth="5" />
                    <circle
                      cx="32" cy="32" r="28" fill="none" stroke="#6C7A6B" strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 28}`}
                      strokeDashoffset={`${2 * Math.PI * 28 * (1 - (dayStats.total > 0 ? dayStats.completed / dayStats.total : 0))}`}
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[#4A5A4A]">
                    {dayStats.completed}/{dayStats.total}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {habitsForCurrentDay.map((h) => {
                  const key = `${day}-${h.id}`;
                  const isChecked = !!checks[key];
                  return (
                    <div
                      key={h.id}
                      className={`group relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                        isChecked ? 'bg-[#F0F5EE] border-[#6C7A6B] shadow-sm' : 'bg-white border-[#E9EDE6] hover:border-[#8C998B]'
                      }`}
                    >
                      <button onClick={() => toggleCheck(day, h.id)} className="flex items-center gap-4 flex-1 text-left">
                        <span className="text-3xl">{h.icon}</span>
                        <div className="flex-1">
                          <div className={`font-semibold ${isChecked ? 'text-[#4A5A4A]' : 'text-[#8C998B]'}`}>{h.label}</div>
                          <div className={`text-xs mt-0.5 ${isChecked ? 'text-[#6C7A6B]' : 'text-[#B0B0B0]'}`}>
                            {isChecked ? 'Completado' : 'Pendiente'}
                          </div>
                        </div>
                        <div className={`flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all shrink-0 ${
                          isChecked ? 'bg-[#6C7A6B] border-[#6C7A6B] text-white' : 'border-[#C4C4C4]'
                        }`}>
                          {isChecked && <Check size={16} />}
                        </div>
                      </button>

                      {/* Edit button (all habits) */}
                      <button
                        onClick={() => setHabitModal({ mode: 'edit', habit: h })}
                        className="absolute top-2 right-2 p-1 rounded text-[#C4C4C4] hover:text-[#6C7A6B] opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Editar hábito"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => setHabitModal({ mode: 'add' })}
                className="w-full mt-3 flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 border-dashed border-[#C4C4C4] text-[#8C998B] hover:border-[#6C7A6B] hover:text-[#6C7A6B] hover:bg-[#F8F9F5] transition-all text-sm font-medium"
              >
                <Plus size={18} />
                Agregar hábito
              </button>
            </div>
          </div>

          {/* Print version of day view */}
          <div className="print-area max-w-5xl mx-auto px-6 pb-8 hidden print:block">
            <div className="text-center py-6 border-b-2 border-[#E9EDE6]">
              <h1 className="text-3xl font-bold text-[#6C7A6B] uppercase tracking-widest" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                Mi 1% Diario
              </h1>
              <p className="text-sm text-[#8C998B] mt-1 tracking-wide">
                {profile.name.toUpperCase()} — {weekdayName.toUpperCase()} {day} DE {MONTH_NAMES[month].toUpperCase()} {year}
              </p>
            </div>
            <div className="py-4">
              {habitsForCurrentDay.map((h) => (
                <div key={h.id} className="flex items-center gap-4 py-2 border-b border-dashed border-[#E0E0E0]">
                  <span className="text-base">{h.icon}</span>
                  <span className="text-xs text-[#6C7A6B] font-semibold flex-1">{h.label}</span>
                  <div className="w-4 h-4 rounded-full border-2 border-[#C4C4C4]" />
                </div>
              ))}
            </div>
            <div className="border-t-2 border-[#E9EDE6] mt-2 pt-3">
              <p className="text-xs font-semibold text-[#6C7A6B] uppercase tracking-wide">Espacio de descarga</p>
              <div className="border-b border-[#C4C4C4] mt-3" />
            </div>
          </div>
        </>
      )}

      {/* === MONTH VIEW === */}
      {viewMode === 'mes' && (
        <>
          <div className="print:hidden max-w-5xl mx-auto px-6 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-[#E9EDE6] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-[#6C7A6B]" />
                  <h3 className="font-semibold text-[#4A5A4A]">Progreso del mes</h3>
                </div>
                <div className="text-2xl font-bold text-[#6C7A6B]">{monthStats.percentage}%</div>
              </div>

              <div className="w-full h-2.5 bg-[#E9EDE6] rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-gradient-to-r from-[#8C998B] to-[#6C7A6B] rounded-full transition-all duration-500"
                  style={{ width: `${monthStats.percentage}%` }}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {monthStats.perHabit.map((h) => (
                  <div key={h.id} className="relative group text-center bg-[#F8F9F5] rounded-lg p-3">
                    <button
                      onClick={() => setHabitModal({ mode: 'edit', habit: h })}
                      className="absolute top-1 right-1 p-0.5 rounded text-[#C4C4C4] hover:text-[#6C7A6B] opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Pencil size={11} />
                    </button>
                    <div className="text-xl mb-1">{h.icon}</div>
                    <div className="text-xs text-[#8C998B] mb-1 truncate">{h.label}</div>
                    <div className="text-sm font-semibold text-[#4A5A4A]">{h.count}/{h.total}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setHabitModal({ mode: 'add' })}
                className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-[#C4C4C4] text-[#8C998B] hover:border-[#6C7A6B] hover:text-[#6C7A6B] hover:bg-[#F8F9F5] transition-all text-sm font-medium"
              >
                <Plus size={18} />
                Agregar hábito
              </button>
            </div>
          </div>

          {/* Printable area */}
          <div className="print-area max-w-5xl mx-auto px-6 pb-8">
            <div className="bg-white rounded-xl shadow-sm border border-[#E9EDE6] print:shadow-none print:border-none print:rounded-none overflow-hidden">
              <div className="hidden print:block text-center py-6 border-b-2 border-[#E9EDE6]">
                <h1 className="text-3xl font-bold text-[#6C7A6B] uppercase tracking-widest" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                  Mi 1% Diario
                </h1>
                <p className="text-sm text-[#8C998B] mt-1 tracking-wide">
                  {profile.name.toUpperCase()} — MES: {MONTH_NAMES[month].toUpperCase()} {year}
                </p>
              </div>

              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-[#E9EDE6]">
                      <th className="w-10 py-3 px-2 print:py-2 print:px-1">
                        <span className="text-xs text-[#6C7A6B]">#</span>
                      </th>
                      {habits.map((h) => (
                        <th key={h.id} className="py-3 px-1 print:py-2 print:px-1 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-lg print:text-base">{h.icon}</span>
                            <span className="text-[10px] uppercase tracking-wide text-[#6C7A6B] font-semibold print:text-[8px]">
                              {h.label}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((d) => {
                      const dateForDay = new Date(year, month, d);
                      const isTodayRow = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

                      return (
                        <tr key={d} className={`border-b border-dashed border-[#E0E0E0] print:border-[#E0E0E0] ${isTodayRow ? 'bg-[#F0F5EE] print:bg-[#F0F5EE]' : ''}`}>
                          <td className="py-2 px-2 print:py-1 print:px-1 text-center">
                            <span className={`text-xs font-semibold ${isTodayRow ? 'text-[#6C7A6B]' : 'text-[#8C998B]'}`}>{d}</span>
                          </td>
                          {habits.map((h) => {
                            const applies = habitAppliesToDay(h, dateForDay);
                            const key = `${d}-${h.id}`;
                            const isChecked = !!checks[key];

                            if (!applies) {
                              return <td key={h.id} className="py-2 px-1 print:py-1 print:px-1 text-center"><span className="inline-block w-6 h-6 print:w-4 print:h-4" /></td>;
                            }

                            return (
                              <td key={h.id} className="py-2 px-1 print:py-1 print:px-1 text-center">
                                <button
                                  onClick={() => toggleCheck(d, h.id)}
                                  className={`check-btn inline-flex items-center justify-center w-6 h-6 print:w-4 print:h-4 rounded-full border-2 transition-all ${
                                    isChecked ? 'bg-[#6C7A6B] border-[#6C7A6B] text-white' : 'border-[#C4C4C4] hover:border-[#6C7A6B] hover:bg-[#F0F5EE]'
                                  } ${isTodayRow && !isChecked ? 'border-[#8C998B]' : ''}`}
                                >
                                  {isChecked && <Check size={14} className="print:hidden" />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="hidden print:block border-t-2 border-[#E9EDE6] mt-2 pt-3">
                <p className="text-xs font-semibold text-[#6C7A6B] uppercase tracking-wide">Espacio de descarga</p>
                <div className="border-b border-[#C4C4C4] mt-3" />
              </div>

              <div className="print:hidden border-t border-[#E9EDE6] px-6 py-4 bg-[#FAFBF7]">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <p className="text-xs text-[#8C998B]">
                    Pasa el mouse sobre un hábito para editarlo. Los de días específicos solo aparecen en sus días.
                  </p>
                  <div className="flex items-center gap-4 text-xs text-[#8C998B]">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#6C7A6B]" /> Completado</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-[#C4C4C4]" /> Pendiente</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Habit modal (add/edit) */}
      {habitModal && (
        <HabitModal
          mode={habitModal.mode}
          habit={habitModal.habit}
          profileId={profile.id}
          nextSortOrder={habits.length + 10}
          onClose={() => setHabitModal(null)}
          onSaved={handleHabitSaved}
          onDeleted={handleHabitDeleted}
        />
      )}

      {/* Print CSS */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          .print-area { max-width: 100% !important; padding: 0 !important; }
          table { font-size: 9px; }
          .check-btn { border-color: #C4C4C4 !important; background: white !important; }
        }
      `}</style>
    </div>
  );
}
