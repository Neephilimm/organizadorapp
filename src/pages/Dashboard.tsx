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
  otro: 'Otro',
  canvas: 'Canvas'
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
};

export default function Dashboard() {
  const [eventos, setEventos] = useState<EventoUnificado[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [completando, setCompletando] = useState<string | null>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setCargando(true);
    const hoy = format(new Date(), 'yyyy-MM-dd');

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
          id: `canvas-${i}`,
          titulo: t.titulo,
          descripcion: t.curso,
          fecha: t.fecha.slice(0, 10),
          tipo: 'canvas',
          origen: 'canvas' as const,
          categoria_id: null,
          url: t.url
        }));
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

  function colorCategoria(categoriaId: string | null) {
    return categorias.find(c => c.id === categoriaId)?.color ?? '#8A8F98';
  }

  function nombreCategoria(categoriaId: string | null) {
    return categorias.find(c => c.id === categoriaId)?.nombre ?? null;
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

  return (
    <div className="min-h-screen bg-paper">
      <header className="px-6 pt-8 pb-4">
        <p className="font-mono text-xs tracking-widest text-ink/50 uppercase">Próximas fechas</p>
        <h1 className="font-display text-3xl text-ink">Tu semestre</h1>
      </header>

      <div className="px-6 pb-24 space-y-3">
        {eventos.map(ev => {
          const dias = differenceInCalendarDays(parseISO(ev.fecha), new Date());
          const urgente = dias <= 3;
          const puedeCompletarse = ev.origen !== 'canvas';

          return (
            <div
              key={ev.id}
              className="bg-white rounded-lg p-4 flex items-start gap-3 shadow-sm border-l-4"
              style={{ borderColor: ev.origen === 'canvas' ? '#D6A419' : colorCategoria(ev.categoria_id) }}
            >
              {puedeCompletarse && (
                <button
                  onClick={() => marcarCompletado(ev.id)}
                  disabled={completando === ev.id}
                  aria-label="Marcar como completado"
                  className="mt-1 w-6 h-6 shrink-0 rounded-full border-2 border-ink/20 disabled:opacity-40"
                />
              )}

              <a
                href={ev.url}
                target={ev.url ? '_blank' : undefined}
                rel={ev.url ? 'noreferrer' : undefined}
                className="flex-1 min-w-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs uppercase tracking-wide text-ink/50">
                    {ETIQUETAS_TIPO[ev.tipo]}
                  </span>
                  {ev.origen === 'imagen' && (
                    <span className="font-mono text-[10px] text-teal">· leído por IA</span>
                  )}
                  {ev.origen === 'canvas' && (
                    <span className="font-mono text-[10px] text-amber">· Canvas</span>
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
                {ev.descripcion && (
                  <p className="font-body text-sm text-ink/60 mt-1">{ev.descripcion}</p>
                )}
              </a>

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
          );
        })}
      </div>
    </div>
  );
}
