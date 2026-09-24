// Supabase Edge Function: transcribir-audio
// Transcribe audio/video usando Groq (Whisper). Dos modos:
//   - { archivoBase64, mimeType, nombreArchivo } -> el cliente ya mandó los
//     bytes (típicamente un fragmento ya comprimido/dividido con ffmpeg.wasm
//     para poder transcribir archivos de cualquier largo sin tope de tamaño).
//   - { url } -> la función descarga el archivo directamente desde ese link
//     y lo manda tal cual a Groq (sujeto al límite de tamaño de Groq, ~25MB;
//     para archivos más grandes conviene subirlos directo, no por link).
//
// Deploy: supabase functions deploy transcribir-audio
// Secret ya existente: GROQ_API_KEY

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELO = 'whisper-large-v3-turbo';

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

function base64ABytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function transcribirBytes(bytes: Uint8Array, nombreArchivo: string, mimeType: string) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), nombreArchivo);
  form.append('model', MODELO);
  form.append('response_format', 'json');

  const respuesta = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Groq respondió ${respuesta.status}: ${detalle}`);
  }

  const data = await respuesta.json();
  return data.text as string;
}

serve(withCors(async req => {
  try {
    const body = await req.json();

    if (body.url) {
      const descarga = await fetch(body.url);
      if (!descarga.ok) {
        return new Response(
          JSON.stringify({ ok: false, error: `No se pudo descargar el link (${descarga.status}).` }),
          { status: 200 }
        );
      }
      const bytes = new Uint8Array(await descarga.arrayBuffer());
      const contentType = descarga.headers.get('content-type') ?? 'audio/mpeg';
      const nombre = body.url.split('/').pop()?.split('?')[0] || 'audio';

      const texto = await transcribirBytes(bytes, nombre, contentType);
      return new Response(JSON.stringify({ ok: true, texto }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { archivoBase64, mimeType, nombreArchivo } = body;
    if (!archivoBase64) {
      return new Response(JSON.stringify({ ok: false, error: 'Falta el audio.' }), { status: 200 });
    }

    const bytes = base64ABytes(archivoBase64);
    const texto = await transcribirBytes(bytes, nombreArchivo ?? 'audio.mp3', mimeType ?? 'audio/mpeg');

    return new Response(JSON.stringify({ ok: true, texto }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
}));
