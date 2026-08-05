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
  RefreshCw
} from 'lucide-react';
import { supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Categorias from './pages/Categorias';
import NuevoEvento from './pages/NuevoEvento';
import Noticias from './pages/Noticias';
import Herramientas from './pages/Herramientas';
import Hub from './pages/Hub';
import Convertidor from './pages/Convertidor';

const ITEMS_NAV = [
  { to: '/', label: 'Semestre', icono: CalendarDays },
  { to: '/nuevo', label: 'Nueva fecha', icono: Plus },
  { to: '/categorias', label: 'Categorías', icono: Tag },
  { to: '/noticias', label: 'Noticias', icono: Newspaper },
  { to: '/herramientas', label: 'Herramientas', icono: Wrench },
  { to: '/hub', label: 'Archivos', icono: FolderOpen },
  { to: '/conversor', label: 'Conversor', icono: RefreshCw }
];

export default function App() {
  const [menuAbierto, setMenuAbierto] = useState(false);

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
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-ink/10 flex items-center px-4 py-3 z-30">
        <button onClick={() => setMenuAbierto(true)} aria-label="Abrir menú">
          <Menu size={24} className="text-ink" />
        </button>
        <span className="font-display text-lg text-ink ml-3">Organizador Académico</span>
      </header>

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
        <nav className="py-2">
          {ITEMS_NAV.map(({ to, label, icono: Icono }) => (
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
        </nav>
      </aside>

      <div className="pt-14">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/nuevo" element={<NuevoEvento />} />
          <Route path="/categorias" element={<Categorias />} />
          <Route path="/noticias" element={<Noticias />} />
          <Route path="/herramientas" element={<Herramientas />} />
          <Route path="/hub" element={<Hub />} />
          <Route path="/conversor" element={<Convertidor />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
