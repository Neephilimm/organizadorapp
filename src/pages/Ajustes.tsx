import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, GraduationCap, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Ajustes() {
  const [correo, setCorreo] = useState<string | null>(null);
  const [canvasConectado, setCanvasConectado] = useState<boolean | null>(null);
  const [canvasDominio, setCanvasDominio] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCorreo(data.user?.email ?? null));

    (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('canvas_tokens')
        .select('dominio')
        .eq('user_id', user.id)
        .maybeSingle();
      setCanvasConectado(!!data);
      setCanvasDominio(data?.dominio ?? null);
    })();
  }, []);

  async function cerrarSesion() {
    if (!window.confirm('¿Cerrar sesión?')) return;
    await supabase.auth.signOut();
  }

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24">
      <h1 className="font-display text-3xl text-ink mb-1">Ajustes</h1>
      {correo && <p className="font-body text-sm text-ink/50 mb-6">{correo}</p>}

      <div className="bg-white rounded-lg shadow-sm divide-y divide-ink/5 mb-6">
        <Link to="/categorias" className="flex items-center gap-3 p-4">
          <Tag size={20} className="text-ink/50" />
          <div className="flex-1">
            <p className="font-body text-ink">Categorías</p>
            <p className="font-body text-xs text-ink/40">Crea o revisa tus ramos con color propio</p>
          </div>
        </Link>

        <Link to="/canvas" className="flex items-center gap-3 p-4">
          <GraduationCap size={20} className="text-ink/50" />
          <div className="flex-1">
            <p className="font-body text-ink">Canvas</p>
            <p className="font-body text-xs text-ink/40">
              {canvasConectado === null
                ? 'Revisando…'
                : canvasConectado
                ? `Conectado a ${canvasDominio}`
                : 'No conectado'}
            </p>
          </div>
        </Link>
      </div>

      <button
        onClick={cerrarSesion}
        className="w-full flex items-center gap-3 bg-white rounded-lg shadow-sm p-4 text-crimson"
      >
        <LogOut size={20} />
        <span className="font-body">Cerrar sesión</span>
      </button>
    </div>
  );
}
