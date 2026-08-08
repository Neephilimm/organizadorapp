import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Browser } from '@capacitor/browser';

export default function Login() {
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [avisoConfirmar, setAvisoConfirmar] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAvisoConfirmar(false);
    setCargando(true);

    if (modo === 'entrar') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setAvisoConfirmar(true);
    }

    setCargando(false);
  }

  async function entrarConGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/drive.readonly',
        redirectTo: 'cl.organizador.academico://login-callback',
        skipBrowserRedirect: true
      }
    });
    if (error) { setError(error.message); return; }
    if (data?.url) await Browser.open({ url: data.url });
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl text-ink mb-1">Organizador Académico</h1>
        <p className="font-body text-ink/60 mb-6">
          {modo === 'entrar' ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}
        </p>

        <form onSubmit={enviar} className="bg-white rounded-lg p-4 shadow-sm space-y-3">
          <div>
            <label className="font-mono text-xs uppercase tracking-wide text-ink/50 block mb-1">
              Correo
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full font-body border border-ink/10 rounded px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="font-mono text-xs uppercase tracking-wide text-ink/50 block mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full font-body border border-ink/10 rounded px-3 py-2"
              required
              minLength={6}
            />
          </div>

          {error && <p className="font-body text-sm text-crimson">{error}</p>}
          {avisoConfirmar && (
            <p className="font-body text-sm text-teal">
              Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-ink text-paper rounded py-2 font-medium disabled:opacity-50"
          >
            {cargando ? 'Un momento…' : modo === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        <button
          onClick={entrarConGoogle}
          className="w-full bg-white border border-ink/10 text-ink rounded py-2 font-body mt-3"
        >
          Continuar con Google
        </button>

        <button
          onClick={() => setModo(modo === 'entrar' ? 'crear' : 'entrar')}
          className="w-full font-body text-sm text-ink/50 mt-4"
        >
          {modo === 'entrar' ? '¿No tienes cuenta? Créala' : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </div>
    </div>
  );
}
