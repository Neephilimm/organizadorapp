import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Pestana = 'noticias_dia' | 'noticias_semana' | 'boletin' | 'metricas' | 'ia_updates';

const PESTANAS: { key: Pestana; label: string }[] = [
  { key: 'noticias_dia', label: 'Hoy' },
  { key: 'noticias_semana', label: 'Semana' },
  { key: 'boletin', label: 'Boletín' },
  { key: 'metricas', label: 'Barómetro' },
  { key: 'ia_updates', label: 'IA' }
];

export default function Noticias() {
  const [pestana, setPestana] = useState<Pestana>('noticias_dia');
  const [items, setItems] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargar(pestana);
  }, [pestana]);

  async function cargar(tabla: Pestana) {
    setCargando(true);
    const { data: session } = await supabase.auth.getSession();
    const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/obtener-noticias?tabla=${tabla}`;
    const res = await fetch(base, {
      headers: {
        Authorization: `Bearer ${session.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`
      }
    });
    const json = await res.json();
    setItems(json?.data?.[tabla] ?? []);
    setCargando(false);
  }

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24">
      <h1 className="font-display text-3xl text-ink mb-4">TDI Noticias</h1>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {PESTANAS.map(p => (
          <button
            key={p.key}
            onClick={() => setPestana(p.key)}
            className={`font-mono text-xs uppercase px-3 py-2 rounded whitespace-nowrap ${
              pestana === p.key ? 'bg-ink text-paper' : 'bg-white text-ink/50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {cargando && <p className="font-body text-ink/50">Cargando…</p>}

      {!cargando && items.length === 0 && (
        <p className="font-body text-ink/50">No hay datos en esta sección todavía.</p>
      )}

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="bg-white rounded-lg p-4 shadow-sm">
            {pestana === 'metricas' ? (
              <>
                <p className="font-mono text-xs uppercase text-ink/40">{item.area}</p>
                <p className="font-display text-lg text-ink">{item.metrica}</p>
                <p className="font-mono text-2xl text-teal">{item.valor}</p>
                {item.explicacion && (
                  <p className="font-body text-sm text-ink/60 mt-1">{item.explicacion}</p>
                )}
              </>
            ) : pestana === 'ia_updates' ? (
              <>
                <p className="font-mono text-xs uppercase text-ink/40">{item.empresa}</p>
                <div
                  className="font-body text-sm text-ink/80 mt-1"
                  dangerouslySetInnerHTML={{ __html: item.actualizaciones ?? '' }}
                />
              </>
            ) : (
              <>
                <p className="font-mono text-xs uppercase text-ink/40">
                  {item.fuente ?? item.fecha_pub}
                </p>
                <h2 className="font-display text-lg text-ink leading-tight">
                  {item.titulo}
                </h2>
                {item.resumen && <p className="font-body text-sm text-ink/70 mt-1">{item.resumen}</p>}
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-teal mt-2 inline-block"
                  >
                    Ver fuente →
                  </a>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
