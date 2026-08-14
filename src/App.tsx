import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import {
  Menu,
  X,
  CalendarDays,
  Plus,
  Tag,
  Newspaper,
  Wrench,
  FolderOpen,
  RefreshCw,
  GraduationCap,
  Settings
} from 'lucide-react';
import { supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Categorias from './pages/Categorias';
import NuevoEvento from './pages/NuevoEvento';
import Noticias from './pages/Noticias';
import Herramientas from './pages/Herramientas';
import Hub from './pages/Hub';
import Convertidor from './pages/Convertidor';
import Canvas from './pages/Canvas';
import Ajustes from './pages/Ajustes';
import Login from './pages/Login';
import type { Session } from '@supabase/supabase-js';

const GRUPOS_NAV = [
  {
    titulo: 'Tu semestre',
    items: [
      { to: '/', label: 'Semestre', icono: CalendarDays },
      { to: '/nuevo', label: 'Nueva fecha', icono: Plus },
      { to: '/categorias', label: 'Categorías', icono: Tag },
      { to: '/canvas', label: 'Canvas', icono: GraduationCap }
    ]
  },
  {
    titulo: 'Archivos y utilidades',
    items: [
      { to: '/hub', label: 'Archivos', icono: FolderOpen },
      { to: '/conversor', label: 'Conversor', icono: RefreshCw },
      { to: '/herramientas', label: 'Herramientas', icono: Wrench },
      { to: '/noticias', label: 'Noticias', icono: Newspaper }
    ]
  },
  {
    titulo: 'Cuenta',
    items: [{ to: '/ajustes', label: 'Ajustes', icono: Settings }]
  }
];

export default function App() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);
  const [errorAuth, setErrorAuth] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function manejarUrlDeepLink(url: string) {
    if (url.startsWith('cl.organizador.academico://login-callback')) {
      await Browser.close().catch(() => {});

      const parametros = new URL(url).searchParams;
      const errorProveedor = parametros.get('error_description') || parametros.get('error');
      if (errorProveedor) {
        setErrorAuth(`Google/Supabase devolvió un error: ${errorProveedor}`);
        return;
      }
      if (!parametros.get('code')) {
        setErrorAuth(`El enlace de regreso no traía un código de sesión. URL recibida: ${url}`);
        return;
      }

      try {
        const { error } = await supabase.auth.exchangeCodeForSession(url);
        if (error) setErrorAuth(`No se pudo completar el inicio de sesión: ${error.message}`);
        else setErrorAuth(null);
      } catch (e) {
        setErrorAuth(`No se pudo completar el inicio de sesión: ${String(e)}`);
      }
      return;
    }

    if (!url.startsWith('cl.organizador.academico://dropbox-callback')) return;

    await Browser.close().catch(() => {});
    const code = new URL(url).searchParams.get('code');
    if (!code) return;

    const { data: session } = await supabase.auth.getSession();
    await supabase.functions.invoke('dropbox-oauth-callback', {
      body: { code },
      headers: { Authorization: `Bearer ${session.session?.access_token}` }
    });
  }

  useEffect(() => {
    // Si Android cerró la app en segundo plano mientras estabas en Google/Dropbox,
    // el regreso llega como un inicio "en frío" en vez de un evento en vivo: revisamos
    // la URL de lanzamiento apenas arranca la app, además de escuchar en vivo abajo.
    CapApp.getLaunchUrl().then(resultado => {
      if (resultado?.url) manejarUrlDeepLink(resultado.url);
    });

    const listener = CapApp.addListener('appUrlOpen', ({ url }) => {
      manejarUrlDeepLink(url);
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, []);

  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-6 text-center">
        <div>
          <h1 className="font-display text-2xl text-crimson mb-2">Falta configuración</h1>
          <p className="font-body text-ink/70">
            Este APK se compiló sin las variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
            Revisa que existan como "Repository secrets" en GitHub con esos nombres exactos, y
            vuelve a correr el workflow.
          </p>
        </div>
      </div>
    );
  }

  if (sesion === undefined) {
    return <div className="min-h-screen bg-paper flex items-center justify-center font-body text-ink/50">Cargando…</div>;
  }

  if (sesion === null) {
    return (
      <>
        {errorAuth && (
          <div className="fixed top-0 left-0 right-0 bg-crimson text-white text-xs font-mono p-3 z-50 break-words">
            {errorAuth}
          </div>
        )}
        <Login />
      </>
    );
  }

  return (
    <HashRouter>
      {errorAuth && (
        <div className="fixed top-0 left-0 right-0 bg-crimson text-white text-xs font-mono p-3 z-50 break-words flex justify-between gap-2">
          <span>{errorAuth}</span>
          <button onClick={() => setErrorAuth(null)} className="shrink-0">✕</button>
        </div>
      )}
      <header className={`fixed left-0 right-0 bg-white border-b border-ink/10 flex items-center px-4 py-3 z-30 ${errorAuth ? 'top-16' : 'top-0'}`}>
        <button onClick={() => setMenuAbierto(true)} aria-label="Abrir menú">
          <Menu size={24} className="text-ink" />
        </button>
        <span className="font-display text-lg text-ink ml-3">Organizador Académico</span>
      </header>
      <div style={{ height: errorAuth ? '7.5rem' : '3.5rem' }} />

      {/* Fondo oscuro al abrir el menú */}
      {menuAbierto && (
        <div
          className="fixed inset-0 bg-ink/40 z-40"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      {/* Panel lateral */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-64 bg-white z-50 shadow-lg transition-transform duration-200 ${
          menuAbierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink/10">
          <span className="font-display text-lg text-ink">Menú</span>
          <button onClick={() => setMenuAbierto(false)} aria-label="Cerrar menú">
            <X size={22} className="text-ink/60" />
          </button>
        </div>
        <nav className="py-2 overflow-y-auto" style={{ maxHeight: 'calc(100% - 56px)' }}>
          {GRUPOS_NAV.map(grupo => (
            <div key={grupo.titulo} className="mb-2">
              <p className="font-mono text-[10px] uppercase tracking-widest text-ink/30 px-4 pt-3 pb-1">
                {grupo.titulo}
              </p>
              {grupo.items.map(({ to, label, icono: Icono }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => setMenuAbierto(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 font-body text-sm border-l-4 ${
                      isActive ? 'border-teal text-ink bg-paper' : 'border-transparent text-ink/60'
                    }`
                  }
                >
                  <Icono size={20} strokeWidth={2} />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/nuevo" element={<NuevoEvento />} />
          <Route path="/categorias" element={<Categorias />} />
          <Route path="/canvas" element={<Canvas />} />
          <Route path="/noticias" element={<Noticias />} />
          <Route path="/herramientas" element={<Herramientas />} />
          <Route path="/hub" element={<Hub />} />
          <Route path="/conversor" element={<Convertidor />} />
          <Route path="/ajustes" element={<Ajustes />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
