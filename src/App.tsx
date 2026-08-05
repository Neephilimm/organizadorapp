import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Categorias from './pages/Categorias';
import NuevoEvento from './pages/NuevoEvento';
import Noticias from './pages/Noticias';
import Herramientas from './pages/Herramientas';
import Hub from './pages/Hub';
import Convertidor from './pages/Convertidor';

export default function App() {
  useEffect(() => {
    const listener = CapApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith('cl.organizador.academico://dropbox-callback')) return;

      await Browser.close();
      const code = new URL(url).searchParams.get('code');
      if (!code) return;

      const { data: session } = await supabase.auth.getSession();
      await supabase.functions.invoke('dropbox-oauth-callback', {
        body: { code },
        headers: { Authorization: `Bearer ${session.session?.access_token}` }
      });
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/nuevo" element={<NuevoEvento />} />
        <Route path="/categorias" element={<Categorias />} />
        <Route path="/noticias" element={<Noticias />} />
        <Route path="/herramientas" element={<Herramientas />} />
        <Route path="/hub" element={<Hub />} />
        <Route path="/conversor" element={<Convertidor />} />
      </Routes>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-ink/10 flex justify-around py-2 overflow-x-auto">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `font-mono text-[10px] uppercase tracking-wide ${isActive ? 'text-teal' : 'text-ink/40'}`
          }
        >
          Semestre
        </NavLink>
        <NavLink
          to="/nuevo"
          className={({ isActive }) =>
            `font-mono text-[10px] uppercase tracking-wide ${isActive ? 'text-teal' : 'text-ink/40'}`
          }
        >
          + Fecha
        </NavLink>
        <NavLink
          to="/categorias"
          className={({ isActive }) =>
            `font-mono text-[10px] uppercase tracking-wide ${isActive ? 'text-teal' : 'text-ink/40'}`
          }
        >
          Categorías
        </NavLink>
        <NavLink
          to="/noticias"
          className={({ isActive }) =>
            `font-mono text-[10px] uppercase tracking-wide ${isActive ? 'text-teal' : 'text-ink/40'}`
          }
        >
          Noticias
        </NavLink>
        <NavLink
          to="/herramientas"
          className={({ isActive }) =>
            `font-mono text-[10px] uppercase tracking-wide ${isActive ? 'text-teal' : 'text-ink/40'}`
          }
        >
          Herramientas
        </NavLink>
        <NavLink
          to="/hub"
          className={({ isActive }) =>
            `font-mono text-[10px] uppercase tracking-wide ${isActive ? 'text-teal' : 'text-ink/40'}`
          }
        >
          Archivos
        </NavLink>
        <NavLink
          to="/conversor"
          className={({ isActive }) =>
            `font-mono text-[10px] uppercase tracking-wide ${isActive ? 'text-teal' : 'text-ink/40'}`
          }
        >
          Conversor
        </NavLink>
      </nav>
    </HashRouter>
  );
}
