import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Tarea = { titulo: string; curso: string; fecha: string; url: string };
type ArchivoCanvas = { nombre: string; curso: string; url: string; actualizado: string; tipo: string };
type Calificacion = { curso: number; nombreCurso: string; notaActual: number | null; notaFinal: number | null; url?: string };
type Anuncio = { titulo: string; curso: string; fecha: string; mensaje: string; url: string };

export default function Canvas() {
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [dominio, setDominio] = useState('');
  const [token, setToken] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [archivos, setArchivos] = useState<ArchivoCanvas[]>([]);
  const [calificaciones, setCalificaciones] = useState<Calificacion[]>([]);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    const { data, error: err } = await supabase.functions.invoke('canvas-list', { body: {} });

    if (err) {
      setConectado(true);
      setError('No se pudo conectar con Canvas ahora mismo. Intenta más tarde.');
      setCargando(false);
      return;
    }

    if (!data?.ok) {
      setConectado(data?.error === 'Canvas no está conectado.' ? false : true);
      if (data?.error && data.error !== 'Canvas no está conectado.') setError(data.error);
      setCargando(false);
      return;
    }

    setConectado(true);
    setTareas(data.tareas ?? []);
    setArchivos(data.archivos ?? []);
    setCalificaciones(data.calificaciones ?? []);
    setAnuncios(data.anuncios ?? []);
    setCargando(false);
  }

  async function desconectar() {
    if (!window.confirm('¿Desconectar Canvas? Podrás volver a conectarlo con otro dominio o clave.')) return;
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('canvas_tokens').delete().eq('user_id', user.id);
    setConectado(false);
    setDominio('');
    setToken('');
  }

  async function guardarConexion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      setError('No hay sesión activa.');
      setGuardando(false);
      return;
    }

    const dominioLimpio = dominio.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    const { error: errUpsert } = await supabase
      .from('canvas_tokens')
      .upsert({ user_id: user.id, dominio: dominioLimpio, token: token.trim() });

    setGuardando(false);

    if (errUpsert) {
      setError(errUpsert.message);
      return;
    }

    await cargar();
  }

  if (conectado === false || conectado === null) {
    return (
      <div className="min-h-screen bg-paper px-6 pt-8 pb-24">
        <h1 className="font-display text-3xl text-ink mb-2">Canvas</h1>
        <p className="font-body text-sm text-ink/60 mb-6">
          Conecta tu cuenta de Canvas para ver tus tareas y los archivos que suben tus profesores.
        </p>

        <form onSubmit={guardarConexion} className="bg-white rounded-lg p-4 shadow-sm space-y-3">
          <div>
            <label className="font-mono text-xs uppercase tracking-wide text-ink/50 block mb-1">
              Dominio de tu Canvas
            </label>
            <input
              value={dominio}
              onChange={e => setDominio(e.target.value)}
              placeholder="Ej: uautonoma.instructure.com"
              className="w-full font-body border border-ink/10 rounded px-3 py-2"
              required
            />
            <p className="font-body text-xs text-ink/40 mt-1">
              Cópialo de la barra de direcciones cuando estés dentro de Canvas.
            </p>
          </div>

          <div>
            <label className="font-mono text-xs uppercase tracking-wide text-ink/50 block mb-1">
              Clave de acceso personal
            </label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Generada en Canvas → Cuenta → Configuración"
              className="w-full font-body border border-ink/10 rounded px-3 py-2"
              required
            />
            <p className="font-body text-xs text-ink/40 mt-1">
              En Canvas: ícono de tu cuenta (abajo a la izquierda) → Configuración → botón
              "+ Nueva clave de acceso" → copia el código que te muestre.
            </p>
          </div>

          {error && <p className="font-body text-sm text-crimson">{error}</p>}

          <button
            type="submit"
            disabled={guardando}
            className="w-full bg-ink text-paper rounded py-2 font-medium disabled:opacity-50"
          >
            {guardando ? 'Conectando…' : 'Conectar Canvas'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-3xl text-ink">Canvas</h1>
        <button
          onClick={desconectar}
          className="font-mono text-xs uppercase text-ink/50 border border-ink/10 rounded px-3 py-2"
        >
          Cambiar cuenta
        </button>
      </div>

      {cargando && <p className="font-body text-ink/50">Cargando…</p>}
      {error && <p className="font-body text-sm text-crimson bg-white rounded-lg p-3 mb-3">{error}</p>}

      <h2 className="font-mono text-xs uppercase text-ink/50 mb-2">Calificaciones</h2>
      <div className="space-y-2 mb-6">
        {calificaciones.length === 0 && !cargando && (
          <p className="font-body text-sm text-ink/50">No hay calificaciones disponibles.</p>
        )}
        {calificaciones.map((c, i) => (
          <a
            key={i}
            href={c.url}
            target="_blank"
            rel="noreferrer"
            className="bg-white rounded-lg p-3 shadow-sm flex items-center justify-between"
          >
            <p className="font-body text-ink">{c.nombreCurso}</p>
            <p className="font-mono text-lg font-semibold text-teal">
              {c.notaActual !== null ? c.notaActual : '—'}
            </p>
          </a>
        ))}
      </div>

      <h2 className="font-mono text-xs uppercase text-ink/50 mb-2">Anuncios de tus profesores</h2>
      <div className="space-y-2 mb-6">
        {anuncios.length === 0 && !cargando && (
          <p className="font-body text-sm text-ink/50">No hay anuncios recientes.</p>
        )}
        {anuncios.map((a, i) => (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="block bg-white rounded-lg p-3 shadow-sm"
          >
            <p className="font-mono text-[10px] uppercase text-ink/40">{a.curso}</p>
            <p className="font-body text-ink">{a.titulo}</p>
            {a.mensaje && <p className="font-body text-sm text-ink/60 mt-1">{a.mensaje}</p>}
          </a>
        ))}
      </div>

      <p className="font-body text-xs text-ink/40 mb-2">
        Tus próximas tareas de Canvas ahora aparecen directamente en el Dashboard (Semestre), junto
        a tus fechas manuales.
      </p>

      <h2 className="font-mono text-xs uppercase text-ink/50 mb-2">Archivos de tus cursos</h2>
      <div className="space-y-4">
        {archivos.length === 0 && !cargando && (
          <p className="font-body text-sm text-ink/50">No hay archivos recientes.</p>
        )}
        {Object.entries(
          archivos.reduce<Record<string, ArchivoCanvas[]>>((grupos, a) => {
            (grupos[a.curso] ??= []).push(a);
            return grupos;
          }, {})
        ).map(([curso, archivosDelCurso]) => (
          <div key={curso}>
            <p className="font-mono text-[10px] uppercase text-ink/40 mb-1">{curso}</p>
            <div className="space-y-1">
              {archivosDelCurso.map((a, i) => (
                <a
                  key={i}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block bg-white rounded-lg p-3 shadow-sm"
                >
                  <p className="font-body text-ink truncate">{a.nombre}</p>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
