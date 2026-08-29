import { useEffect, useState } from 'react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { supabase } from '../lib/supabase';

type Item = { tipo: string; nombre: string; fileId: number | null; url: string | null };
type Modulo = { nombre: string; items: Item[] };
type CursoConModulos = { curso: string; modulos: Modulo[] };

const ETIQUETA_TIPO: Record<string, string> = {
  File: '📎 Archivo',
  Page: '📄 Página',
  Assignment: '📝 Tarea',
  Discussion: '💬 Foro',
  Quiz: '❓ Evaluación',
  ExternalUrl: '🔗 Enlace',
  ExternalTool: '🔗 Herramienta',
  SubHeader: ''
};

export default function Modulos() {
  const [cursos, setCursos] = useState<CursoConModulos[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<number | null>(null);
  const [cursoAbierto, setCursoAbierto] = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    setError(null);
    const { data, error: err } = await supabase.functions.invoke('canvas-modulos', { body: {} });
    if (err || !data?.ok) {
      setError(data?.error ?? 'No se pudieron cargar los módulos.');
      setCargando(false);
      return;
    }
    setCursos(data.cursos ?? []);
    setCargando(false);
  }

  async function abrirArchivo(fileId: number, nombre: string) {
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

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24">
      <h1 className="font-display text-3xl text-ink mb-1">Módulos</h1>
      <p className="font-body text-sm text-ink/50 mb-6">
        El material que tus profesores organizaron por unidad en cada curso.
      </p>

      {cargando && <p className="font-body text-ink/50">Cargando…</p>}
      {error && <p className="font-body text-sm text-crimson bg-white rounded-lg p-3 mb-3">{error}</p>}
      {!cargando && !error && cursos.length === 0 && (
        <p className="font-body text-sm text-ink/40">
          Ninguno de tus cursos tiene módulos configurados todavía.
        </p>
      )}

      <div className="space-y-3">
        {cursos.map(c => {
          const abierto = cursoAbierto === c.curso;
          return (
            <div key={c.curso} className="bg-white rounded-lg shadow-sm overflow-hidden">
              <button
                onClick={() => setCursoAbierto(abierto ? null : c.curso)}
                className="w-full text-left p-4"
              >
                <p className="font-display text-lg font-bold text-ink">{c.curso}</p>
                <p className="font-mono text-xs text-ink/40">
                  {c.modulos.length} módulo{c.modulos.length > 1 ? 's' : ''}
                </p>
              </button>

              {abierto && (
                <div className="px-4 pb-4 space-y-4 border-t border-ink/5 pt-3">
                  {c.modulos.map((m, i) => (
                    <div key={i}>
                      <p className="font-mono text-xs uppercase tracking-widest text-ink/40 mb-1">
                        {m.nombre}
                      </p>
                      <div className="space-y-1">
                        {m.items
                          .filter(it => it.tipo !== 'SubHeader')
                          .map((it, j) =>
                            it.fileId ? (
                              <button
                                key={j}
                                onClick={() => abrirArchivo(it.fileId!, it.nombre)}
                                disabled={abriendo === it.fileId}
                                className="block w-full text-left bg-paper rounded p-2 disabled:opacity-50"
                              >
                                <p className="font-body text-sm text-ink truncate">
                                  {abriendo === it.fileId ? 'Abriendo…' : `${ETIQUETA_TIPO[it.tipo] ?? ''} ${it.nombre}`}
                                </p>
                              </button>
                            ) : it.url ? (
                              <a
                                key={j}
                                href={it.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block bg-paper rounded p-2"
                              >
                                <p className="font-body text-sm text-ink truncate">
                                  {ETIQUETA_TIPO[it.tipo] ?? ''} {it.nombre}
                                </p>
                              </a>
                            ) : (
                              <p key={j} className="font-body text-sm text-ink/50 p-2">
                                {ETIQUETA_TIPO[it.tipo] ?? ''} {it.nombre}
                              </p>
                            )
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
