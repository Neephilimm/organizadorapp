import { useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { supabase } from '../lib/supabase';

const ffmpeg = new FFmpeg();
let ffmpegCargado = false;

async function asegurarFFmpeg(onLog?: (m: string) => void) {
  if (ffmpegCargado) return;
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  ffmpeg.on('log', ({ message }) => onLog?.(message));
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm')
  });
  ffmpegCargado = true;
}

// Cuánto dura cada fragmento antes de mandarlo a transcribir. A 64kbps mono
// esto pesa ~3-4 MB por fragmento — bien por debajo de cualquier límite de
// tamaño, sin importar cuánto dure el audio/video original completo.
const SEGUNDOS_POR_FRAGMENTO = 480; // 8 minutos

function bytesABase64(bytes: Uint8Array): string {
  let binario = '';
  const trozo = 0x8000;
  for (let i = 0; i < bytes.length; i += trozo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + trozo));
  }
  return btoa(binario);
}

async function guardarComoTxt(texto: string) {
  const escrito = await Filesystem.writeFile({
    path: `transcripcion-${Date.now()}.txt`,
    data: texto,
    directory: Directory.Cache,
    encoding: 'utf8' as any
  });
  await Share.share({ title: 'Transcripción', url: escrito.uri });
}

export default function Transcripcion() {
  const [modo, setModo] = useState<'archivo' | 'link' | 'youtube'>('archivo');

  const inputArchivo = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [link, setLink] = useState('');

  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [transcripcion, setTranscripcion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  async function transcribirFragmento(bytes: Uint8Array, nombre: string) {
    const { data, error: errorInvoke } = await supabase.functions.invoke('transcribir-audio', {
      body: { archivoBase64: bytesABase64(bytes), mimeType: 'audio/mpeg', nombreArchivo: nombre }
    });
    if (errorInvoke) throw new Error('Fallo de red al transcribir.');
    if (!data?.ok) throw new Error(data?.error ?? 'No se pudo transcribir ese fragmento.');
    return data.texto as string;
  }

  async function transcribirDesdeArchivo() {
    if (!archivo) return;
    setProcesando(true);
    setError(null);
    setTranscripcion(null);

    try {
      setProgreso('Cargando motor de audio (una vez, ~30 MB)…');
      await asegurarFFmpeg(m => setProgreso(m));

      const nombreEntrada = archivo.name;
      await ffmpeg.writeFile(nombreEntrada, await fetchFile(archivo));

      setProgreso('Preparando el audio (extrayendo y comprimiendo)…');
      // -vn: descarta el video si lo hay. Mono, 16kHz, 64kbps: liviano y de
      // sobra para que Whisper transcriba bien. -f segment: lo parte en
      // fragmentos, así no hay límite de duración/tamaño.
      await ffmpeg.exec([
        '-i', nombreEntrada,
        '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k',
        '-f', 'segment', '-segment_time', String(SEGUNDOS_POR_FRAGMENTO),
        'fragmento_%03d.mp3'
      ]);

      const archivosFFmpeg = (await ffmpeg.listDir('/')) as any[];
      const fragmentos = archivosFFmpeg
        .map(a => a.name)
        .filter(n => /^fragmento_\d+\.mp3$/.test(n))
        .sort();

      if (fragmentos.length === 0) throw new Error('No se pudo extraer audio de ese archivo.');

      let textoCompleto = '';
      for (let i = 0; i < fragmentos.length; i++) {
        setProgreso(`Transcribiendo parte ${i + 1} de ${fragmentos.length}…`);
        const data = await ffmpeg.readFile(fragmentos[i]);
        const texto = await transcribirFragmento(data as Uint8Array, fragmentos[i]);
        textoCompleto += (textoCompleto ? '\n\n' : '') + texto.trim();
        await ffmpeg.deleteFile(fragmentos[i]);
      }

      setTranscripcion(textoCompleto);
      setProgreso('¡Listo!');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setProcesando(false);
    }
  }

  async function transcribirDesdeLink() {
    if (!link.trim()) return;
    setProcesando(true);
    setError(null);
    setTranscripcion(null);
    setProgreso('Descargando y transcribiendo…');

    try {
      const { data, error: errorInvoke } = await supabase.functions.invoke('transcribir-audio', {
        body: { url: link.trim() }
      });
      if (errorInvoke) throw new Error('Fallo de red.');
      if (!data?.ok) throw new Error(data?.error ?? 'No se pudo transcribir ese link.');
      setTranscripcion(data.texto);
      setProgreso('¡Listo!');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setProcesando(false);
    }
  }

  async function copiarTexto() {
    if (!transcripcion) return;
    await navigator.clipboard.writeText(transcripcion);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function guardarTexto() {
    if (!transcripcion) return;
    setGuardando(true);
    await guardarComoTxt(transcripcion);
    setGuardando(false);
  }

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24 space-y-6">
      <h1 className="font-display text-3xl text-ink">Transcripción</h1>
      <p className="font-body text-sm text-ink/60">
        Transcribe cualquier audio o video con IA (Groq / Whisper) — subiendo el archivo o
        pegando un link directo. No hay límite de duración: los archivos largos se procesan en
        partes automáticamente.
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => setModo('archivo')}
          className={`flex-1 font-mono text-xs uppercase py-2 rounded ${modo === 'archivo' ? 'bg-ink text-paper' : 'bg-white text-ink/50'}`}
        >
          Subir archivo
        </button>
        <button
          onClick={() => setModo('link')}
          className={`flex-1 font-mono text-xs uppercase py-2 rounded ${modo === 'link' ? 'bg-ink text-paper' : 'bg-white text-ink/50'}`}
        >
          Desde un link
        </button>
      </div>

      <section className="bg-white rounded-lg p-4 shadow-sm space-y-3">
        {modo === 'archivo' ? (
          <>
            <input
              ref={inputArchivo}
              type="file"
              accept="audio/*,video/*"
              onChange={e => setArchivo(e.target.files?.[0] ?? null)}
              className="w-full font-body text-sm"
            />
            <button
              onClick={transcribirDesdeArchivo}
              disabled={!archivo || procesando}
              className="w-full bg-teal text-white rounded py-2 font-medium disabled:opacity-50"
            >
              {procesando ? 'Procesando…' : 'Transcribir'}
            </button>
          </>
        ) : (
          <>
            <input
              type="url"
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="https://…/audio.mp3"
              className="w-full font-body border border-ink/10 rounded px-3 py-2 text-sm"
            />
            <p className="font-body text-xs text-ink/40">
              El link debe apuntar directo al archivo de audio/video (no a una página como
              YouTube). Para archivos muy grandes, mejor descárgalos y súbelos con "Subir archivo".
            </p>
            <button
              onClick={transcribirDesdeLink}
              disabled={!link.trim() || procesando}
              className="w-full bg-teal text-white rounded py-2 font-medium disabled:opacity-50"
            >
              {procesando ? 'Procesando…' : 'Transcribir desde el link'}
            </button>
          </>
        )}

        {progreso && <p className="font-mono text-xs text-ink/50">{progreso}</p>}
        {error && <p className="font-body text-sm text-crimson">{error}</p>}
      </section>

      {transcripcion && (
        <section className="bg-white rounded-lg p-4 shadow-sm space-y-3">
          <p className="font-body text-sm text-ink/60 whitespace-pre-wrap max-h-96 overflow-y-auto">
            {transcripcion}
          </p>
          <div className="flex gap-2">
            <button
              onClick={copiarTexto}
              className="flex-1 bg-ink text-paper rounded py-2 font-body text-sm"
            >
              {copiado ? '¡Copiado!' : 'Copiar texto'}
            </button>
            <button
              onClick={guardarTexto}
              disabled={guardando}
              className="flex-1 bg-white border border-ink/10 text-ink rounded py-2 font-body text-sm disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar / Compartir .txt'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
