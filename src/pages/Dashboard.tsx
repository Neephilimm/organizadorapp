import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, Evento, Categoria } from '../lib/supabase';
import { cancelarRecordatorio } from '../lib/notificaciones';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const ETIQUETAS_TIPO: Record<string, string> = {
  evaluacion: 'Evaluación',
  tarea: 'Tarea',
  entrega: 'Entrega',
  presentacion: 'Presentación',
  feriado: 'Feriado',
  sin_clases: 'Sin clases',
  lectura: 'Control de lectura',
  otro: 'Otro'
};

type EventoUnificado = {
  id: string;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  tipo: string;
  origen: 'manual' | 'imagen' | 'canvas';
  categoria_id: string | null;
  url?: string;
  cursoNombre?: string;
  cursoId?: number;
  discussionTopicId?: number;
  assignmentId?: number;
  entregada?: boolean;
  tiposPermitidos?: string[];
};

const CLAVE_OCULTOS = 'canvas-dashboard-ocultos';
const CLAVE_FERIADOS_SYNC = 'feriados-sincronizados-anio';

function leerOcultos(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_OCULTOS) ?? '[]');
  } catch {
    return [];
  }
}

export default function Dashboard() {
  const [eventos, setEventos] = useState<EventoUnificado[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [completando, setCompletando] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [textoRespuesta, setTextoRespuesta] = useState('');
  const [enviandoRespuesta, setEnviandoRespuesta] = useState(false);
  const [respuestaEnviada, setRespuestaEnviada] = useState<string | null>(null);
  const [entregando, setEntregando] = useState<string | null>(null);
  const [entregaEnviada, setEntregaEnviada] = useState<string | null>(null);

  useEffect(() => {
    cargarDatos();
    sincronizarFeriadosSiHaceFalta();
  }, []);

  async function sincronizarFeriadosSiHaceFalta() {
    const anio = String(new Date().getFullYear());
    if (localStorage.getItem(CLAVE_FERIADOS_SYNC) === anio) return;
    const { data } = await supabase.functions.invoke('sincronizar-feriados', { body: {} });
    if (data?.ok) {
      localStorage.setItem(CLAVE_FERIADOS_SYNC, anio);
      if (data.agregados > 0) cargarDatos();
    }
  }

  async function cargarDatos() {
    setCargando(true);
    const hoy = format(new Date(), 'yyyy-MM-dd');
    const ocultos = leerOcultos();

    const [{ data: eventosData }, { data: categoriasData }] = await Promise.all([
      supabase
        .from('eventos')
        .select('*')
        .gte('fecha', hoy)
        .eq('completado', false)
        .order('fecha', { ascending: true }),
      supabase.from('categorias').select('*')
    ]);

    let unificados: EventoUnificado[] = (eventosData ?? []).map((e: Evento) => ({
      id: e.id,
      titulo: e.titulo,
      descripcion: e.descripcion,
      fecha: e.fecha,
      tipo: e.tipo,
      origen: e.origen,
      categoria_id: e.categoria_id
    }));

    // Trae las tareas de Canvas, si está conectado (falla en silencio si no lo está)
    const { data: canvasData } = await supabase.functions.invoke('canvas-list', { body: {} });
    if (canvasData?.ok && canvasData.tareas) {
      const tareasCanvas: EventoUnificado[] = canvasData.tareas
        .filter((t: any) => t.fecha)
        .map((t: any, i: number) => ({
          id: `canvas-${i}-${t.titulo}`,
          titulo: t.titulo,
          descripcion: t.descripcion || null,
          fecha: t.fecha.slice(0, 10),
          tipo: t.tipo ?? 'Actividad',
          origen: 'canvas' as const,
          categoria_id: null,
          url: t.url,
          cursoNombre: t.curso,
          cursoId: t.cursoId,
          discussionTopicId: t.discussionTopicId ?? undefined,
          assignmentId: t.assignmentId,
          entregada: t.entregada,
          tiposPermitidos: t.tiposDeArchivoPermitidos
        }))
        .filter(t => !ocultos.includes(t.id));
      unificados = [...unificados, ...tareasCanvas].sort((a, b) => a.fecha.localeCompare(b.fecha));
    }

    setEventos(unificados);
    setCategorias(categoriasData ?? []);
    setCargando(false);
  }

  async function marcarCompletado(id: string) {
    setCompletando(id);
    await supabase.from('eventos').update({ completado: true }).eq('id', id);
    await cancelarRecordatorio(id);
    setEventos(prev => prev.filter(e => e.id !== id));
    setCompletando(null);
  }

  function ocultarDeCanvas(id: string) {
    const ocultos = leerOcultos();
    localStorage.setItem(CLAVE_OCULTOS, JSON.stringify([...ocultos, id]));
    setEventos(prev => prev.filter(e => e.id !== id));
  }

  async function enviarRespuesta(ev: EventoUnificado) {
    if (!textoRespuesta.trim() || !ev.cursoId || !ev.discussionTopicId) return;
    setEnviandoRespuesta(true);
    const { data } = await supabase.functions.invoke('canvas-responder-foro', {
      body: { cursoId: ev.cursoId, discussionTopicId: ev.discussionTopicId, mensaje: textoRespuesta }
    });
    setEnviandoRespuesta(false);
    if (data?.ok) {
      setRespuestaEnviada(ev.id);
      setTextoRespuesta('');
      setRespondiendo(null);
    } else {
      alert(data?.error ?? 'No se pudo enviar la respuesta.');
    }
  }

  async function entregarArchivo(ev: EventoUnificado, archivo: File) {
    if (!ev.cursoId || !ev.assignmentId) return;

    if (ev.tiposPermitidos && ev.tiposPermitidos.length > 0) {
      const extension = archivo.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ev.tiposPermitidos.map(t => t.toLowerCase()).includes(extension)) {
        alert(
          `Este archivo es .${extension}, pero la tarea solo acepta: ${ev.tiposPermitidos.join(', ')}`
        );
        return;
      }
    }

    setEntregando(ev.id);

    const base64 = await new Promise<string>((resolve, reject) => {
      const lector = new FileReader();
      lector.onloadend = () => resolve((lector.result as string).split(',')[1] ?? '');
      lector.onerror = reject;
      lector.readAsDataURL(archivo);
    });

    const { data } = await supabase.functions.invoke('canvas-entregar-archivo', {
      body: {
        cursoId: ev.cursoId,
        assignmentId: ev.assignmentId,
        nombreArchivo: archivo.name,
        contentType: archivo.type || 'application/octet-stream',
        archivoBase64: base64
      }
    });

    setEntregando(null);
    if (data?.ok) {
      setEntregaEnviada(ev.id);
    } else {
      alert(data?.error ?? 'No se pudo entregar el archivo.');
    }
  }

  function colorCategoria(categoriaId: string | null) {
    return categorias.find(c => c.id === categoriaId)?.color ?? '#8A8F98';
  }

  function nombreCategoria(categoriaId: string | null) {
    return categorias.find(c => c.id === categoriaId)?.nombre ?? null;
  }

  function seccionDe(dias: number): string {
    if (dias <= 0) return 'Hoy';
    if (dias === 1) return 'Mañana';
    if (dias <= 7) return 'Esta semana';
    if (dias <= 30) return 'Este mes';
    return 'Más adelante';
  }

  if (cargando) {
    return <div className="p-6 font-body text-ink/60">Cargando tu semestre…</div>;
  }

  if (eventos.length === 0) {
    return (
      <div className="p-6">
        <h1 className="font-display text-3xl text-ink mb-2">Nada pendiente todavía</h1>
        <p className="font-body text-ink/60">
          Agrega tu primera fecha manualmente o sube una foto del panel de evaluaciones de tu profesor.
        </p>
      </div>
    );
  }

  const textoBusqueda = busqueda.trim().toLowerCase();
  const eventosFiltrados = eventos.filter(ev => {
    const coincideTexto = !textoBusqueda || ev.titulo.toLowerCase().includes(textoBusqueda);
    const coincideCategoria =
      !filtroCategoria ||
      (filtroCategoria === '__sin_categoria__' ? !ev.categoria_id : ev.categoria_id === filtroCategoria);
    return coincideTexto && coincideCategoria;
  });

  const secciones: Record<string, EventoUnificado[]> = {};
  for (const ev of eventosFiltrados) {
    const dias = differenceInCalendarDays(parseISO(ev.fecha), new Date());
    const nombre = seccionDe(dias);
    (secciones[nombre] ??= []).push(ev);
  }
  const ordenSecciones = ['Hoy', 'Mañana', 'Esta semana', 'Este mes', 'Más adelante'];

  return (
    <div className="min-h-screen bg-paper">
      <header className="px-6 pt-8 pb-4">
        <p className="font-mono text-xs tracking-widest text-ink/50 uppercase">Próximas fechas</p>
        <h1 className="font-display text-3xl text-ink">Tu semestre</h1>
      </header>

      {(categorias.length > 0 || eventos.length > 5) && (
        <div className="px-6 pb-4 flex gap-2">
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por título…"
            className="flex-1 font-body text-sm border border-ink/10 rounded px-3 py-2 bg-white"
          />
          {categorias.length > 0 && (
            <select
              value={filtroCategoria}
              onChange={e => setFiltroCategoria(e.target.value)}
              className="font-body text-sm border border-ink/10 rounded px-2 py-2 bg-white max-w-[40%]"
            >
              <option value="">Todas</option>
              <option value="__sin_categoria__">Sin categoría</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {eventosFiltrados.length === 0 && (
        <p className="px-6 font-body text-sm text-ink/40">
          Ninguna fecha coincide con ese filtro.
        </p>
      )}

      <div className="px-6 pb-24">
        {ordenSecciones
          .filter(nombre => secciones[nombre]?.length)
          .map(nombreSeccion => (
            <div key={nombreSeccion} className="mb-6">
              <h2 className="font-mono text-xs uppercase tracking-widest text-ink/40 mb-2">
                {nombreSeccion}
              </h2>
              <div className="space-y-3">
                {secciones[nombreSeccion].map(ev => {
          const dias = differenceInCalendarDays(parseISO(ev.fecha), new Date());
          const urgente = dias <= 3;
          const puedeCompletarse = ev.origen !== 'canvas';
          const abierto = expandido === ev.id;
          const etiquetaTipo = ev.origen === 'canvas' ? ev.tipo : ETIQUETAS_TIPO[ev.tipo] ?? ev.tipo;
          const esLibre = ev.tipo === 'feriado' || ev.tipo === 'sin_clases';

          return (
            <div
              key={ev.id}
              className={`rounded-lg p-4 shadow-sm border-l-4 ${esLibre ? 'bg-teal/5' : 'bg-white'}`}
              style={{ borderColor: esLibre ? '#3E7C7C' : ev.origen === 'canvas' ? '#D6A419' : colorCategoria(ev.categoria_id) }}
            >
              <div className="flex items-start gap-3">
                {puedeCompletarse && (
                  <button
                    onClick={() => marcarCompletado(ev.id)}
                    disabled={completando === ev.id}
                    aria-label="Marcar como completado"
                    className="mt-1 w-6 h-6 shrink-0 rounded-full border-2 border-ink/20 disabled:opacity-40"
                  />
                )}

                <button
                  onClick={() => setExpandido(abierto ? null : ev.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs uppercase tracking-wide text-ink/50">
                      {esLibre ? '🎉 ' : ''}{etiquetaTipo}
                    </span>
                    {ev.cursoNombre && (
                      <span className="font-mono text-[10px] text-amber">· {ev.cursoNombre}</span>
                    )}
                    {ev.origen === 'imagen' && (
                      <span className="font-mono text-[10px] text-teal">· leído por IA</span>
                    )}
                    {nombreCategoria(ev.categoria_id) && (
                      <span
                        className="font-mono text-[10px]"
                        style={{ color: colorCategoria(ev.categoria_id) }}
                      >
                        · {nombreCategoria(ev.categoria_id)}
                      </span>
                    )}
                  </div>
                  <h2 className="font-display text-lg text-ink leading-tight">{ev.titulo}</h2>
                  {!abierto && ev.descripcion && (
                    <p className="font-body text-sm text-ink/60 mt-1 line-clamp-2">{ev.descripcion}</p>
                  )}
                </button>

                <div className="text-right shrink-0">
                  <p
                    className={`font-mono text-sm font-semibold ${urgente ? 'text-crimson' : 'text-ink/70'}`}
                  >
                    {format(parseISO(ev.fecha), "d 'de' MMM", { locale: es })}
                  </p>
                  <p className="font-mono text-xs text-ink/40">
                    {dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`}
                  </p>
                </div>
              </div>

              {abierto && (
                <div className="mt-3 pt-3 border-t border-ink/10">
                  {ev.descripcion ? (
                    <p className="font-body text-sm text-ink/70 whitespace-pre-wrap">{ev.descripcion}</p>
                  ) : (
                    <p className="font-body text-sm text-ink/40">Sin descripción.</p>
                  )}
                  <div className="flex items-center gap-4 mt-3">
                    {ev.url && (
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs uppercase text-teal"
                      >
                        Abrir en Canvas ↗
                      </a>
                    )}
                    {ev.origen === 'canvas' && (
                      <button
                        onClick={() => ocultarDeCanvas(ev.id)}
                        className="font-mono text-xs uppercase text-crimson"
                      >
                        Ocultar de aquí
                      </button>
                    )}
                    {ev.origen !== 'canvas' && (
                      <Link
                        to={`/nuevo?editar=${ev.id}`}
                        className="font-mono text-xs uppercase text-ink/50"
                      >
                        Editar
                      </Link>
                    )}
                    {ev.tipo === 'Foro' && ev.discussionTopicId && respuestaEnviada !== ev.id && (
                      <button
                        onClick={() => setRespondiendo(respondiendo === ev.id ? null : ev.id)}
                        className="font-mono text-xs uppercase text-ink/50"
                      >
                        Responder
                      </button>
                    )}
                    {respuestaEnviada === ev.id && (
                      <span className="font-mono text-xs uppercase text-teal">✓ Enviado</span>
                    )}
                  </div>

                  {ev.tipo === 'Entrega de archivo' && ev.assignmentId && (
                    <div className="mt-3">
                      {entregaEnviada === ev.id || ev.entregada ? (
                        <span className="font-mono text-xs uppercase text-teal">✓ Entregado</span>
                      ) : (
                        <label className="inline-block bg-teal text-white rounded px-4 py-2 font-mono text-xs uppercase cursor-pointer">
                          {entregando === ev.id
                            ? 'Entregando…'
                            : ev.tiposPermitidos && ev.tiposPermitidos.length > 0
                            ? `Entregar (${ev.tiposPermitidos.join(', ')})`
                            : 'Elegir y entregar archivo'}
                          <input
                            type="file"
                            className="hidden"
                            disabled={entregando === ev.id}
                            onChange={e => {
                              const archivo = e.target.files?.[0];
                              if (archivo) entregarArchivo(ev, archivo);
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )}

                  {respondiendo === ev.id && (
                    <div className="mt-3">
                      <textarea
                        value={textoRespuesta}
                        onChange={e => setTextoRespuesta(e.target.value)}
                        placeholder="Escribe tu respuesta para el foro…"
                        rows={3}
                        className="w-full font-body text-sm border border-ink/10 rounded px-3 py-2"
                      />
                      <button
                        onClick={() => enviarRespuesta(ev)}
                        disabled={enviandoRespuesta || !textoRespuesta.trim()}
                        className="mt-2 bg-teal text-white rounded px-4 py-2 font-mono text-xs uppercase disabled:opacity-50"
                      >
                        {enviandoRespuesta ? 'Enviando…' : 'Publicar en Canvas'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
