import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tag, GraduationCap, LogOut, Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { leerConfigAvisos, guardarConfigAvisos } from '../lib/notificaciones';

const ETIQUETAS_TIPO: Record<string, string> = {
  evaluacion: 'Evaluaciones',
  entrega: 'Entregas',
  presentacion: 'Presentaciones',
  lectura: 'Controles de lectura',
  tarea: 'Tareas',
  otro: 'Otros'
};

export default function Ajustes() {
  const [correo, setCorreo] = useState<string | null>(null);
  const [canvasConectado, setCanvasConectado] = useState<boolean | null>(null);
  const [canvasDominio, setCanvasDominio] = useState<string | null>(null);
  const [diasAviso, setDiasAviso] = useState<Record<string, number>>(leerConfigAvisos());
  const [guardadoOk, setGuardadoOk] = useState(false);

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

  function actualizarDias(tipo: string, valor: string) {
    const numero = Math.max(0, Math.min(30, Number(valor) || 0));
    setDiasAviso(prev => ({ ...prev, [tipo]: numero }));
    setGuardadoOk(false);
  }

  function guardarDias() {
    guardarConfigAvisos(diasAviso);
    setGuardadoOk(true);
    setTimeout(() => setGuardadoOk(false), 2000);
  }

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

      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Bell size={18} className="text-ink/50" />
          <p className="font-body text-ink">Recordatorios</p>
        </div>
        <p className="font-body text-xs text-ink/40 mb-4">
          Cuántos días antes de la fecha límite quieres el aviso, según el tipo.
        </p>

        <div className="space-y-3">
          {Object.entries(ETIQUETAS_TIPO).map(([tipo, etiqueta]) => (
            <div key={tipo} className="flex items-center justify-between gap-3">
              <p className="font-body text-sm text-ink/70">{etiqueta}</p>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={diasAviso[tipo] ?? 0}
                  onChange={e => actualizarDias(tipo, e.target.value)}
                  className="w-16 font-mono text-sm border border-ink/10 rounded px-2 py-1 text-center"
                />
                <span className="font-mono text-xs text-ink/40">días antes</span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={guardarDias}
          className="w-full mt-4 bg-teal text-white rounded py-2 font-mono text-xs uppercase"
        >
          {guardadoOk ? '✓ Guardado' : 'Guardar cambios'}
        </button>
        <p className="font-body text-xs text-ink/40 mt-2">
          Solo aplica a fechas que crees o edites después de este cambio.
        </p>
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
