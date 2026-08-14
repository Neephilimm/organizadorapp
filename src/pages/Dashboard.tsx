import { useEffect, useState } from 'react';
import { supabase, Evento, Categoria } from '../lib/supabase';
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
          cursoNombre: t.curso
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
    setEventos(prev => prev.filter(e => e.id !== id));
    setCompletando(null);
  }

  function ocultarDeCanvas(id: string) {
    const ocultos = leerOcultos();
    localStorage.setItem(CLAVE_OCULTOS, JSON.stringify([...ocultos, id]));
    setEventos(prev => prev.filter(e => e.id !== id));
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

  const secciones: Record<string, EventoUnificado[]> = {};
  for (const ev of eventos) {
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
                  </div>
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
