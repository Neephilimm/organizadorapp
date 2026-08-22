import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

type Feriado = { id: string; titulo: string; fecha: string; tipo: string };

export default function Feriados() {
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase
      .from('eventos')
      .select('id, titulo, fecha, tipo')
      .in('tipo', ['feriado', 'sin_clases'])
      .order('fecha', { ascending: true })
      .then(({ data }) => {
        setFeriados(data ?? []);
        setCargando(false);
      });
  }, []);

  const porMes: Record<string, Feriado[]> = {};
  for (const f of feriados) {
    const nombreMes = format(parseISO(f.fecha), 'MMMM yyyy', { locale: es });
    (porMes[nombreMes] ??= []).push(f);
  }

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24">
      <h1 className="font-display text-3xl text-ink mb-1">Feriados</h1>
      <p className="font-body text-sm text-ink/50 mb-6">
        Todos los feriados y días sin clases del año, organizados por mes.
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
            {items.map(f => (
              <div key={f.id} className="bg-white rounded-lg p-3 shadow-sm flex items-center justify-between">
                <div>
                  <p className="font-body text-ink">
                    {f.tipo === 'sin_clases' ? '📚 ' : '🎉 '}
                    {f.titulo}
                  </p>
                </div>
                <p className="font-mono text-sm text-ink/60 shrink-0">
                  {format(parseISO(f.fecha), "d 'de' MMM", { locale: es })}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
