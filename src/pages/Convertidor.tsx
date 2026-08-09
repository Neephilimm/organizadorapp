import { useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import ImageTracer from 'imagetracerjs';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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

function blobABase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onloadend = () => {
      const resultado = lector.result as string;
      resolve(resultado.split(',')[1] ?? '');
    };
    lector.onerror = reject;
    lector.readAsDataURL(blob);
  });
}

async function guardarYCompartir(blob: Blob, nombreArchivo: string) {
  const base64 = await blobABase64(blob);

  const escrito = await Filesystem.writeFile({
    path: nombreArchivo,
    data: base64,
    directory: Directory.Cache
  });

  await Share.share({
    title: nombreArchivo,
    url: escrito.uri
  });
}

const FORMATOS_AUDIO = ['mp3', 'wav', 'm4a'] as const;
const FORMATOS_VIDEO = ['mp4', 'webm'] as const;

export default function Convertidor() {
  const [modo, setModo] = useState<'video' | 'imagen'>('video');

  // Video/audio
  const inputVideo = useRef<HTMLInputElement>(null);
  const [archivoVideo, setArchivoVideo] = useState<File | null>(null);
  const [formatoDestino, setFormatoDestino] = useState<string>('mp3');
  const [progreso, setProgreso] = useState<string>('');
  const [resultadoBlob, setResultadoBlob] = useState<Blob | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Imagen
  const inputImagen = useRef<HTMLInputElement>(null);
  const [svgResultado, setSvgResultado] = useState<string | null>(null);

  async function convertirVideo() {
    if (!archivoVideo) return;
    setProcesando(true);
    setResultadoBlob(null);
    setProgreso('Cargando motor de conversión (una vez, ~30 MB)…');

    await asegurarFFmpeg(m => setProgreso(m));

    const nombreEntrada = archivoVideo.name;
    const nombreSalida = `salida.${formatoDestino}`;

    await ffmpeg.writeFile(nombreEntrada, await fetchFile(archivoVideo));

    setProgreso('Convirtiendo…');
    const esSoloAudio = (FORMATOS_AUDIO as readonly string[]).includes(formatoDestino);

    const args = esSoloAudio
      ? ['-i', nombreEntrada, '-vn', nombreSalida]
      : ['-i', nombreEntrada, nombreSalida];

    await ffmpeg.exec(args);

    const data = await ffmpeg.readFile(nombreSalida);
    const blob = new Blob([data], { type: esSoloAudio ? `audio/${formatoDestino}` : `video/${formatoDestino}` });
    setResultadoBlob(blob);
    setProgreso('¡Listo!');
    setProcesando(false);
  }

  async function descargarResultado() {
    if (!resultadoBlob) return;
    setGuardando(true);
    await guardarYCompartir(resultadoBlob, `convertido.${formatoDestino}`);
    setGuardando(false);
  }

  async function convertirImagenASVG(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const svg = ImageTracer.imagedataToSVG(imageData, { ltres: 1, qtres: 1, scale: 1 });
      setSvgResultado(svg);
    };
    img.src = url;
  }

  async function descargarSVG() {
    if (!svgResultado) return;
    setGuardando(true);
    const blob = new Blob([svgResultado], { type: 'image/svg+xml' });
    await guardarYCompartir(blob, 'imagen.svg');
    setGuardando(false);
  }

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24 space-y-6">
      <h1 className="font-display text-3xl text-ink">Conversor</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setModo('video')}
          className={`flex-1 font-mono text-xs uppercase py-2 rounded ${modo === 'video' ? 'bg-ink text-paper' : 'bg-white text-ink/50'}`}
        >
          Audio / Video
        </button>
        <button
          onClick={() => setModo('imagen')}
          className={`flex-1 font-mono text-xs uppercase py-2 rounded ${modo === 'imagen' ? 'bg-ink text-paper' : 'bg-white text-ink/50'}`}
        >
          Imagen → SVG
        </button>
      </div>

      {modo === 'video' && (
        <section className="bg-white rounded-lg p-4 shadow-sm space-y-3">
          <p className="font-body text-sm text-ink/60">
            Convierte un video propio a otro formato, o extrae solo el audio. Todo ocurre en tu
            dispositivo (no se sube a ningún servidor).
          </p>
          <input
            ref={inputVideo}
            type="file"
            accept="video/*,audio/*"
            onChange={e => setArchivoVideo(e.target.files?.[0] ?? null)}
            className="w-full font-body text-sm"
          />
          <select
            value={formatoDestino}
            onChange={e => setFormatoDestino(e.target.value)}
            className="w-full font-body border border-ink/10 rounded px-3 py-2"
          >
            <optgroup label="Solo audio">
              {FORMATOS_AUDIO.map(f => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </optgroup>
            <optgroup label="Video">
              {FORMATOS_VIDEO.map(f => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </optgroup>
          </select>
          <button
            onClick={convertirVideo}
            disabled={!archivoVideo || procesando}
            className="w-full bg-teal text-white rounded py-2 font-medium disabled:opacity-50"
          >
            {procesando ? 'Procesando…' : 'Convertir'}
          </button>
          {progreso && <p className="font-mono text-xs text-ink/50">{progreso}</p>}
          {resultadoBlob && (
            <button
              onClick={descargarResultado}
              disabled={guardando}
              className="block w-full text-center bg-ink text-paper rounded py-2 font-body disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar / Compartir resultado'}
            </button>
          )}
        </section>
      )}

      {modo === 'imagen' && (
        <section className="bg-white rounded-lg p-4 shadow-sm space-y-3">
          <p className="font-body text-sm text-ink/60">
            Convierte una imagen a SVG (vectorial). Nota: no ofrecemos conversión a RAW — ese
            formato guarda datos crudos del sensor de una cámara al momento de la captura, no es
            algo a lo que se pueda "convertir" una imagen ya procesada (JPG/PNG). Si buscas una
            copia sin pérdida, usa PNG.
          </p>
          <input
            ref={inputImagen}
            type="file"
            accept="image/*"
            onChange={convertirImagenASVG}
            className="w-full font-body text-sm"
          />
          {svgResultado && (
            <>
              <div
                className="border border-ink/10 rounded p-2 max-h-64 overflow-auto"
                dangerouslySetInnerHTML={{ __html: svgResultado }}
              />
              <button
                onClick={descargarSVG}
                disabled={guardando}
                className="w-full bg-ink text-paper rounded py-2 font-body disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : 'Guardar / Compartir SVG'}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
