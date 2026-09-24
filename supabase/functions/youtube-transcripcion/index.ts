// Supabase Edge Function: youtube-transcripcion
// Extrae los subtítulos (manuales o automáticos) que YouTube ya generó para
// un video, usando el mismo endpoint no oficial que usan la mayoría de las
// herramientas de "transcripción de YouTube" (no requiere API key).
//
// Nota importante: esto NO descarga el audio del video (eso violaría los
// términos de servicio de YouTube y es muy frágil técnicamente). Solo
// funciona si el video ya tiene subtítulos/captions disponibles — que es la
// gran mayoría de los videos normales, incluyendo los automáticos.
//
// Deploy: supabase functions deploy youtube-transcripcion

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function withCors(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }
    const res = await handler(req);
    const headers = new Headers(res.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
    return new Response(res.body, { status: res.status, headers });
  };
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function extraerVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

type PistaSubtitulo = { baseUrl: string; languageCode: string; kind?: string };

function elegirMejorPista(pistas: PistaSubtitulo[]): PistaSubtitulo | null {
  if (pistas.length === 0) return null;
  // Preferimos subtítulos hechos a mano (sin kind: 'asr') antes que los
  // automáticos, y español/inglés antes que otros idiomas.
  const puntaje = (p: PistaSubtitulo) => {
    let s = 0;
    if (p.kind !== 'asr') s += 10;
    if (p.languageCode?.startsWith('es')) s += 5;
    else if (p.languageCode?.startsWith('en')) s += 3;
    return s;
  };
  return [...pistas].sort((a, b) => puntaje(b) - puntaje(a))[0];
}

serve(withCors(async req => {
  try {
    const { url } = await req.json();
    if (!url) return new Response(JSON.stringify({ ok: false, error: 'Falta el link de YouTube.' }), { status: 200 });

    const videoId = extraerVideoId(url);
    if (!videoId) {
      return new Response(JSON.stringify({ ok: false, error: 'Ese link no parece ser de un video de YouTube.' }), {
        status: 200
      });
    }

    const paginaRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-CL,es;q=0.9' }
    });
    const html = await paginaRes.text();

    const match = html.match(/"captionTracks":(\[.*?\])(?=,")/);
    if (!match) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Este video no tiene subtítulos disponibles, así que no se puede transcribir por este medio.'
        }),
        { status: 200 }
      );
    }

    const pistas: PistaSubtitulo[] = JSON.parse(match[1]);
    const elegida = elegirMejorPista(pistas);
    if (!elegida) {
      return new Response(JSON.stringify({ ok: false, error: 'No se encontraron subtítulos utilizables.' }), {
        status: 200
      });
    }

    const subsRes = await fetch(`${elegida.baseUrl}&fmt=json3`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!subsRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'No se pudo descargar el subtítulo.' }), {
        status: 200
      });
    }

    const subsData = await subsRes.json();
    const texto = (subsData.events ?? [])
      .flatMap((ev: any) => (ev.segs ?? []).map((s: any) => s.utf8))
      .join('')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!texto) {
      return new Response(JSON.stringify({ ok: false, error: 'El subtítulo estaba vacío.' }), { status: 200 });
    }

    return new Response(
      JSON.stringify({ ok: true, texto, idioma: elegida.languageCode, automatico: elegida.kind === 'asr' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
}));
