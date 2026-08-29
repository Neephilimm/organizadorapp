import { useEffect, useState } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { supabase } from '../lib/supabase';
import { avisarNovedadesCanvas } from '../lib/notificaciones';

type Tarea = { titulo: string; curso: string; fecha: string; url: string };
type ArchivoAdjunto = { id: number; nombre: string; cursoId: number };
type ArchivoCanvas = {
  id: number;
  nombre: string;
  curso: string;
  cursoId: number;
  url: string;
  actualizado: string;
  tipo: string;
};
type DesgloseNota = { nombre: string; puntaje: number | null; puntajeMaximo: number | null };
type Calificacion = {
  curso: number;
  nombreCurso: string;
  notaActual: number | null;
  notaFinal: number | null;
  url?: string;
  desglose?: DesgloseNota[];
};
type Anuncio = {
  titulo: string;
  curso: string;
  fecha: string;
  mensaje: string;
  url: string;
  archivos?: ArchivoAdjunto[];
};

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
  const [abriendo, setAbriendo] = useState<number | null>(null);

  const [ramoAbierto, setRamoAbierto] = useState<number | null>(null);
  const [anuncioAbierto, setAnuncioAbierto] = useState<number | null>(null);

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

    avisarNovedadesCanvas(
      'canvas-anuncios-vistos',
      data.anuncios ?? [],
      (a: Anuncio) => `${a.curso}::${a.titulo}::${a.fecha}`,
      (a: Anuncio) => ({ titulo: `Nuevo anuncio · ${a.curso}`, cuerpo: a.titulo })
    );
    avisarNovedadesCanvas(
      'canvas-archivos-vistos',
      data.archivos ?? [],
      (a: ArchivoCanvas) => `${a.curso}::${a.nombre}`,
      (a: ArchivoCanvas) => ({ titulo: `Nuevo archivo · ${a.curso}`, cuerpo: a.nombre })
    );
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

  async function abrirArchivoCanvas(fileId: number, nombre: string) {
    setAbriendo(fileId);
    const { data } = await supabase.functions.invoke('canvas-abrir-archivo', { body: { fileId } });
    if (data?.ok) {
      const escrito = await Filesystem.writeFile({
        path: data.nombreArchivo ?? nombre,
        data: data.archivoBase64,
        directory: Directory.Cache
      });
      await Share.share({ title: data.nombreArchivo ?? nombre, url: escrito.uri });
    } else {
      alert(data?.error ?? 'No se pudo abrir el archivo.');
    }
    setAbriendo(null);
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
        {calificaciones.map((c, i) => {
          const abierto = ramoAbierto === c.curso;
          return (
            <div key={i} className="bg-white rounded-lg shadow-sm overflow-hidden">
              <button
                onClick={() => setRamoAbierto(abierto ? null : c.curso)}
                className="w-full p-3 flex items-center justify-between text-left"
              >
                <p className="font-body text-ink">{c.nombreCurso}</p>
                <p className="font-mono text-lg font-semibold text-teal">
                  {c.notaActual !== null ? c.notaActual : '—'}
                </p>
              </button>

              {abierto && (
                <div className="px-3 pb-3 border-t border-ink/5 pt-2">
                  {!c.desglose || c.desglose.length === 0 ? (
                    <p className="font-body text-xs text-ink/40">Sin tareas calificadas todavía.</p>
                  ) : (
                    <div className="space-y-1">
                      {c.desglose.map((d, j) => (
                        <div key={j} className="flex items-center justify-between">
                          <p className="font-body text-sm text-ink/70 truncate pr-2">{d.nombre}</p>
                          <p className="font-mono text-xs text-ink/50 shrink-0">
                            {d.puntaje !== null ? d.puntaje : '—'}
                            {d.puntajeMaximo !== null ? ` / ${d.puntajeMaximo}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[10px] uppercase text-ink/30 mt-2 inline-block"
                    >
                      Ver en Canvas ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <h2 className="font-mono text-xs uppercase text-ink/50 mb-2">Anuncios de tus profesores</h2>
      <div className="space-y-2 mb-6">
        {anuncios.length === 0 && !cargando && (
          <p className="font-body text-sm text-ink/50">No hay anuncios recientes.</p>
        )}
        {anuncios.map((a, i) => {
          const abierto = anuncioAbierto === i;
          return (
            <div key={i} className="bg-white rounded-lg shadow-sm overflow-hidden">
              <button
                onClick={() => setAnuncioAbierto(abierto ? null : i)}
                className="w-full text-left p-3"
              >
                <p className="font-mono text-[10px] uppercase text-ink/40">{a.curso}</p>
                <p className="font-body text-ink">{a.titulo}</p>
                {a.mensaje && (
                  <p className={`font-body text-sm text-ink/60 mt-1 ${abierto ? '' : 'line-clamp-2'}`}>
                    {a.mensaje}
                  </p>
                )}
                {(a.archivos?.length ?? 0) > 0 && (
                  <p className="font-mono text-[10px] uppercase text-teal mt-1">
                    📎 {a.archivos!.length} archivo{a.archivos!.length > 1 ? 's' : ''} adjunto
                    {a.archivos!.length > 1 ? 's' : ''}
                  </p>
                )}
              </button>

              {abierto && (a.archivos?.length ?? 0) > 0 && (
                <div className="px-3 pb-3 border-t border-ink/5 pt-2 space-y-1">
                  {a.archivos!.map(f => (
                    <button
                      key={f.id}
                      onClick={() => abrirArchivoCanvas(f.id, f.nombre)}
                      disabled={abriendo === f.id}
                      className="block w-full text-left font-body text-sm text-teal disabled:opacity-50"
                    >
                      {abriendo === f.id ? 'Abriendo…' : `📎 ${f.nombre}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
                <button
                  key={i}
                  onClick={() => abrirArchivoCanvas(a.id, a.nombre)}
                  disabled={abriendo === a.id}
                  className="block w-full text-left bg-white rounded-lg p-3 shadow-sm disabled:opacity-50"
                >
                  <p className="font-body text-ink truncate">
                    {abriendo === a.id ? 'Abriendo…' : a.nombre}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
