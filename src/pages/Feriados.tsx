import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';

type Feriado = { id: string; titulo: string; fecha: string; tipo: string };

export default function Feriados() {
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase
      .from('eventos')
      .select('id, titulo, fecha, tipo')
      .in('tipo', ['feriado', 'sin_clases'])
      .order('fecha', { ascending: true });
    setFeriados(data ?? []);
    setCargando(false);
  }

  async function eliminarUno(id: string) {
    setEliminando(id);
    await supabase.from('eventos').delete().eq('id', id);
    setFeriados(prev => prev.filter(f => f.id !== id));
    setEliminando(null);
  }

  async function eliminarPasados() {
    const pasados = feriados.filter(f => differenceInCalendarDays(parseISO(f.fecha), new Date()) < 0);
    if (pasados.length === 0) return;
    if (!window.confirm(`¿Eliminar los ${pasados.length} feriados que ya pasaron?`)) return;

    await supabase
      .from('eventos')
      .delete()
      .in('id', pasados.map(f => f.id));
    setFeriados(prev => prev.filter(f => !pasados.some(p => p.id === f.id)));
  }

  // Ya vienen ordenados por fecha ascendente desde la consulta — el más
  // cercano (o el más recién pasado) queda primero dentro de cada mes.
  const porMes: Record<string, Feriado[]> = {};
  for (const f of feriados) {
    const nombreMes = format(parseISO(f.fecha), 'MMMM yyyy', { locale: es });
    (porMes[nombreMes] ??= []).push(f);
  }

  const hayPasados = feriados.some(f => differenceInCalendarDays(parseISO(f.fecha), new Date()) < 0);

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="font-display text-3xl text-ink">Feriados</h1>
        {hayPasados && (
          <button
            onClick={eliminarPasados}
            className="font-mono text-[10px] uppercase text-crimson border border-crimson/30 rounded px-2 py-1 shrink-0 mt-1"
          >
            Borrar pasados
          </button>
        )}
      </div>
      <p className="font-body text-sm text-ink/50 mb-6">
        Todos los feriados y días sin clases del año, organizados por mes — el más cercano primero.
      </p>

      {cargando && <p className="font-body text-ink/50">Cargando…</p>}

      {!cargando && feriados.length === 0 && (
        <p className="font-body text-sm text-ink/40">
          Todavía no se han sincronizado feriados — abre el Dashboard una vez para que se traigan.
        </p>
      )}

      {Object.entries(porMes).map(([mes, items]) => (
        <div key={mes} className="mb-6">
          <h2 className="font-mono text-xs uppercase tracking-widest text-ink/40 mb-2 capitalize">
            {mes}
          </h2>
          <div className="space-y-2">
            {items.map(f => {
              const dias = differenceInCalendarDays(parseISO(f.fecha), new Date());
              return (
                <div
                  key={f.id}
                  className={`bg-white rounded-lg p-3 shadow-sm flex items-center justify-between gap-2 ${
                    dias < 0 ? 'opacity-50' : ''
                  }`}
                >
                  <p className="font-body text-ink">
                    {f.tipo === 'sin_clases' ? '📚 ' : '🎉 '}
                    {f.titulo}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="font-mono text-sm text-ink/60">
                      {format(parseISO(f.fecha), "d 'de' MMM", { locale: es })}
                    </p>
                    <button
                      onClick={() => eliminarUno(f.id)}
                      disabled={eliminando === f.id}
                      aria-label="Eliminar"
                      className="w-6 h-6 rounded-full text-crimson font-mono text-xs disabled:opacity-40"
                    >
                      {eliminando === f.id ? '…' : '✕'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
