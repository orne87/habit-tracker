import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase';
import { DEFAULT_HABIT_SEED } from '@/lib/habits';
import { hashPassword, verifyPassword } from '@/lib/password';
import { ArrowRight, Loader2, Lock, User, Trash2, Eye, EyeOff, KeyRound } from 'lucide-react';

type Props = {
  onProfileReady: (profile: Profile) => void;
};

const ACTIVE_KEY = 'habit-tracker-profile-id';
const KNOWN_KEY = 'habit-tracker-known-profiles';

type KnownProfile = {
  id: string;
  name: string;
  password_hash: string;
};

type RemoteProfile = {
  id: string;
  name: string;
  created_at: string;
  password_hash: string | null;
};

function loadKnownProfiles(): KnownProfile[] {
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    return raw ? (JSON.parse(raw) as KnownProfile[]) : [];
  } catch {
    return [];
  }
}

function saveKnownProfiles(profiles: KnownProfile[]) {
  localStorage.setItem(KNOWN_KEY, JSON.stringify(profiles));
}

function addKnownProfile(profile: KnownProfile) {
  const existing = loadKnownProfiles();
  if (!existing.find((p) => p.id === profile.id)) {
    existing.push(profile);
    saveKnownProfiles(existing);
  }
}

function removeKnownProfile(id: string) {
  const existing = loadKnownProfiles();
  saveKnownProfiles(existing.filter((p) => p.id !== id));
}

export default function ProfileGate({ onProfileReady }: Props) {
  const [view, setView] = useState<'loading' | 'home' | 'create' | 'login' | 'remote' | 'set_password'>('loading');
  const [knownProfiles, setKnownProfiles] = useState<KnownProfile[]>([]);
  const [loginProfile, setLoginProfile] = useState<KnownProfile | null>(null);
  const [setPasswordProfile, setSetPasswordProfile] = useState<RemoteProfile | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const savedId = localStorage.getItem(ACTIVE_KEY);
      if (savedId) {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, created_at, password_hash')
          .eq('id', savedId)
          .maybeSingle();

        if (data) {
          const p = data as RemoteProfile;
          if (p.password_hash) {
            // Has password — check if this device knows it
            const known = loadKnownProfiles().find((kp) => kp.id === p.id);
            if (known && known.password_hash === p.password_hash) {
              onProfileReady({ id: p.id, name: p.name, created_at: p.created_at });
              return;
            }
            // Password changed or device doesn't know it — force login
            localStorage.removeItem(ACTIVE_KEY);
          } else {
            // Old profile without password — force setting one
            setSetPasswordProfile(p);
            setView('set_password');
            return;
          }
        }
      }

      setKnownProfiles(loadKnownProfiles());
      setView('home');
    })();
  }, [onProfileReady]);

  // --- LOGIN (known profile on this device) ---
  const handleLogin = async () => {
    if (!loginProfile || password.length === 0) return;
    setBusy(true);
    setError(null);

    const valid = await verifyPassword(password, loginProfile.password_hash);
    if (!valid) {
      setError('Contraseña incorrecta');
      setBusy(false);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('id, name, created_at')
      .eq('id', loginProfile.id)
      .maybeSingle();

    if (data) {
      localStorage.setItem(ACTIVE_KEY, loginProfile.id);
      onProfileReady(data as Profile);
    } else {
      setError('No se pudo cargar el perfil');
      setBusy(false);
    }
  };

  // --- REMOTE LOGIN (existing profile from another device) ---
  const handleRemoteLogin = async () => {
    if (name.trim().length === 0 || password.length === 0) return;
    setBusy(true);
    setError(null);

    const { data } = await supabase
      .from('profiles')
      .select('id, name, created_at, password_hash')
      .ilike('name', name.trim())
      .maybeSingle();

    if (!data) {
      setError('No existe un perfil con ese nombre');
      setBusy(false);
      return;
    }

    const p = data as RemoteProfile;
    if (!p.password_hash) {
      setError('Este perfil no tiene contraseña. Contactá a quien lo creó.');
      setBusy(false);
      return;
    }

    const valid = await verifyPassword(password, p.password_hash);
    if (!valid) {
      setError('Contraseña incorrecta');
      setBusy(false);
      return;
    }

    addKnownProfile({ id: p.id, name: p.name, password_hash: p.password_hash });
    localStorage.setItem(ACTIVE_KEY, p.id);
    onProfileReady({ id: p.id, name: p.name, created_at: p.created_at });
  };

  // --- CREATE ---
  const handleCreate = async () => {
    if (name.trim().length === 0 || password.length < 4) return;
    setBusy(true);
    setError(null);

    const hash = await hashPassword(password);

    const { data, error: insertError } = await supabase
      .from('profiles')
      .insert({ name: name.trim(), password_hash: hash })
      .select('id, name, created_at')
      .single();

    if (insertError || !data) {
      setError('No se pudo crear el perfil. Intenta de nuevo.');
      setBusy(false);
      return;
    }

    const newProfile = data as Profile;

    const habitsToInsert = DEFAULT_HABIT_SEED.map((h) => ({
      label: h.label,
      icon: h.icon,
      applies_to_all: h.applies_to_all,
      weekdays: h.applies_to_all ? null : h.weekdays?.map((d) => d.toString()) ?? null,
      sort_order: h.sort_order,
      is_default: true,
      profile_id: newProfile.id,
    }));

    const { error: habitsError } = await supabase.from('custom_habits').insert(habitsToInsert);

    if (habitsError) {
      setError('No se pudieron crear los hábitos iniciales: ' + habitsError.message);
      setBusy(false);
      return;
    }

    addKnownProfile({ id: newProfile.id, name: newProfile.name, password_hash: hash });
    localStorage.setItem(ACTIVE_KEY, newProfile.id);
    onProfileReady(newProfile);
  };

  // --- SET PASSWORD (for old profiles without one) ---
  const handleSetPassword = async () => {
    if (!setPasswordProfile || password.length < 4 || password !== confirmPassword) return;
    setBusy(true);
    setError(null);

    const hash = await hashPassword(password);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ password_hash: hash })
      .eq('id', setPasswordProfile.id);

    if (updateError) {
      setError('No se pudo guardar la contraseña. Intenta de nuevo.');
      setBusy(false);
      return;
    }

    addKnownProfile({ id: setPasswordProfile.id, name: setPasswordProfile.name, password_hash: hash });
    localStorage.setItem(ACTIVE_KEY, setPasswordProfile.id);
    onProfileReady({ id: setPasswordProfile.id, name: setPasswordProfile.name, created_at: setPasswordProfile.created_at });
  };

  const handleRemoveKnown = (id: string) => {
    removeKnownProfile(id);
    setKnownProfiles(loadKnownProfiles());
    setConfirmDeleteId(null);
  };

  // --- LOADING ---
  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-[#F5F6F1] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#6C7A6B] animate-spin" />
      </div>
    );
  }

  // --- SET PASSWORD (migration for old profiles) ---
  if (view === 'set_password' && setPasswordProfile) {
    return (
      <div className="min-h-screen bg-[#F5F6F1] flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#6C7A6B] mb-4">
              <KeyRound className="text-white" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-[#4A5A4A] tracking-tight">Configurar contraseña</h1>
            <p className="text-sm text-[#8C998B] mt-2">
              Tu perfil <strong>{setPasswordProfile.name}</strong> no tiene contraseña yet. Creá una para protegerlo.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#E9EDE6] p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#4A5A4A] mb-2">Nueva contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 4 caracteres"
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-[#E9EDE6] text-sm text-[#4A5A4A] focus:outline-none focus:border-[#6C7A6B] transition-colors"
                  autoFocus
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C998B] hover:text-[#6C7A6B] transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#4A5A4A] mb-2">Repetir contraseña</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repetí la contraseña"
                className="w-full px-4 py-3 rounded-xl border border-[#E9EDE6] text-sm text-[#4A5A4A] focus:outline-none focus:border-[#6C7A6B] transition-colors"
              />
            </div>

            {password !== confirmPassword && confirmPassword.length > 0 && (
              <p className="text-sm text-red-500">Las contraseñas no coinciden</p>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={handleSetPassword}
              disabled={password.length < 4 || password !== confirmPassword || busy}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-medium text-white bg-[#6C7A6B] hover:bg-[#5A6A5A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
              {busy ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- LOGIN ---
  if (view === 'login' && loginProfile) {
    return (
      <div className="min-h-screen bg-[#F5F6F1] flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#6C7A6B] mb-4">
              <Lock className="text-white" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-[#4A5A4A] tracking-tight">{loginProfile.name}</h1>
            <p className="text-sm text-[#8C998B] mt-1">Ingresá tu contraseña para continuar</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#E9EDE6] p-6">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="Contraseña"
                className="w-full px-4 py-3 pr-11 rounded-xl border border-[#E9EDE6] text-sm text-[#4A5A4A] focus:outline-none focus:border-[#6C7A6B] transition-colors"
                autoFocus
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C998B] hover:text-[#6C7A6B] transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={password.length === 0 || busy}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-medium text-white bg-[#6C7A6B] hover:bg-[#5A6A5A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              {busy ? 'Ingresando...' : 'Ingresar'}
            </button>

            <button
              onClick={() => { setView('home'); setLoginProfile(null); setPassword(''); setError(null); }}
              className="w-full mt-3 text-center text-sm text-[#8C998B] hover:text-[#6C7A6B] transition-colors"
            >
              ¿Te equivocaste de usuario?
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- REMOTE LOGIN (from another device) ---
  if (view === 'remote') {
    return (
      <div className="min-h-screen bg-[#F5F6F1] flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#6C7A6B] mb-4">
              <KeyRound className="text-white" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-[#4A5A4A] tracking-tight">Ya tengo un perfil</h1>
            <p className="text-sm text-[#8C998B] mt-2">Ingresá con tu nombre y contraseña</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#E9EDE6] p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#4A5A4A] mb-2">Tu nombre</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="El nombre que usaste al crear el perfil"
                maxLength={30}
                className="w-full px-4 py-3 rounded-xl border border-[#E9EDE6] text-sm text-[#4A5A4A] focus:outline-none focus:border-[#6C7A6B] transition-colors"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#4A5A4A] mb-2">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRemoteLogin()}
                  placeholder="Tu contraseña"
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-[#E9EDE6] text-sm text-[#4A5A4A] focus:outline-none focus:border-[#6C7A6B] transition-colors"
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C998B] hover:text-[#6C7A6B] transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={handleRemoteLogin}
              disabled={name.trim().length === 0 || password.length === 0 || busy}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-medium text-white bg-[#6C7A6B] hover:bg-[#5A6A5A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              {busy ? 'Ingresando...' : 'Ingresar'}
            </button>

            <button
              onClick={() => { setView('home'); setName(''); setPassword(''); setError(null); }}
              className="w-full mt-3 text-center text-sm text-[#8C998B] hover:text-[#6C7A6B] transition-colors"
            >
              ¿Te equivocaste de usuario?
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- CREATE ---
  if (view === 'create') {
    return (
      <div className="min-h-screen bg-[#F5F6F1] flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#6C7A6B] mb-4">
              <span className="text-3xl">🌱</span>
            </div>
            <h1 className="text-2xl font-bold text-[#4A5A4A] tracking-tight">Crear nuevo perfil</h1>
            <p className="text-sm text-[#8C998B] mt-2">Tus hábitos y tu progreso serán privados</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#E9EDE6] p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#4A5A4A] mb-2">Tu nombre</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: María, Juan..."
                maxLength={30}
                className="w-full px-4 py-3 rounded-xl border border-[#E9EDE6] text-sm text-[#4A5A4A] focus:outline-none focus:border-[#6C7A6B] transition-colors"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#4A5A4A] mb-2">Contraseña</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 4 caracteres"
                  className="w-full px-4 py-3 pr-11 rounded-xl border border-[#E9EDE6] text-sm text-[#4A5A4A] focus:outline-none focus:border-[#6C7A6B] transition-colors"
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C998B] hover:text-[#6C7A6B] transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-[#8C998B] mt-2">
                Se crearán 9 hábitos iniciales. Podrás editarlos y agregar nuevos después.
              </p>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              onClick={handleCreate}
              disabled={name.trim().length === 0 || password.length < 4 || busy}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-medium text-white bg-[#6C7A6B] hover:bg-[#5A6A5A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              {busy ? 'Creando...' : 'Crear y comenzar'}
            </button>

            <button
              onClick={() => { setView('home'); setName(''); setPassword(''); setError(null); }}
              className="w-full mt-3 text-center text-sm text-[#8C998B] hover:text-[#6C7A6B] transition-colors"
            >
              ¿Te equivocaste de usuario?
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- HOME ---
  return (
    <div className="min-h-screen bg-[#F5F6F1] flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#6C7A6B] mb-4">
            <span className="text-3xl">🌱</span>
          </div>
          <h1 className="text-2xl font-bold text-[#4A5A4A] tracking-tight">Mi 1% Diario</h1>
          <p className="text-sm text-[#8C998B] mt-2">Pequeños hábitos, grandes cambios</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-[#E9EDE6] p-6">
          {knownProfiles.length > 0 ? (
            <div className="mb-5">
              <p className="text-sm font-medium text-[#4A5A4A] mb-3">Perfiles en este dispositivo</p>
              <div className="space-y-2">
                {knownProfiles.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 group rounded-xl bg-[#F8F9F5] border border-[#E9EDE6] hover:border-[#6C7A6B] transition-all overflow-hidden"
                  >
                    <button
                      onClick={() => enterProfile(p)}
                      className="flex-1 flex items-center gap-3 p-3.5 text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-[#F0F5EE] flex items-center justify-center shrink-0">
                        <User size={18} className="text-[#6C7A6B]" />
                      </div>
                      <span className="font-medium text-[#4A5A4A] flex-1">{p.name}</span>
                      <ArrowRight size={18} className="text-[#8C998B] group-hover:text-[#6C7A6B] transition-colors" />
                    </button>

                    {confirmDeleteId === p.id ? (
                      <div className="flex items-center gap-1 pr-2">
                        <button
                          onClick={() => handleRemoveKnown(p.id)}
                          className="text-xs text-red-500 font-medium px-2"
                        >
                          Sí
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-[#8C998B] px-1"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="p-2 mr-1 rounded text-[#C4C4C4] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Quitar de este dispositivo"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="my-4 flex items-center gap-3">
                <div className="flex-1 h-px bg-[#E9EDE6]" />
                <span className="text-xs text-[#8C998B]">o continuá con</span>
                <div className="flex-1 h-px bg-[#E9EDE6]" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#8C998B] mb-4 text-center">
              No hay perfiles en este dispositivo todavía.
            </p>
          )}

          <div className="space-y-2">
            <button
              onClick={() => { setView('create'); setName(''); setPassword(''); setError(null); }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-medium text-white bg-[#6C7A6B] hover:bg-[#5A6A5A] transition-colors"
            >
              <User size={18} />
              Crear nuevo perfil
            </button>

            <button
              onClick={() => { setView('remote'); setName(''); setPassword(''); setError(null); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-[#6C7A6B] bg-[#F0F5EE] hover:bg-[#E5EDE3] transition-colors"
            >
              <KeyRound size={17} />
              Ya tengo un perfil
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-[#B0B0B0] mt-4">
          Cada perfil tiene su contraseña y es privado. Tu progreso se sincroniza en la nube.
        </p>
      </div>
    </div>
  );

  function enterProfile(p: KnownProfile) {
    setLoginProfile(p);
    setPassword('');
    setError(null);
    setView('login');
  }
}
