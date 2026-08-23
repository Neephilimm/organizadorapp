// Supabase Edge Function: drive-abrir
// Descarga el contenido de un archivo de Drive (o lo exporta si es un archivo
// nativo de Google, como un Doc/Sheet) y lo devuelve en base64 para que la
// app lo abra localmente en el celular.
//
// Body esperado: { fileId, mimeType }
//
// Deploy: supabase functions deploy drive-abrir

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!;

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

async function obtenerAccessTokenValido(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data: conexion } = await supabaseAdmin
    .from('drive_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!conexion) return null;

  const yaVencido = new Date(conexion.expira_en).getTime() < Date.now() + 60_000;
  if (!yaVencido) return conexion.access_token;

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    refresh_token: conexion.refresh_token,
    grant_type: 'refresh_token'
  });
  const respuesta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  if (!respuesta.ok) return null;
  const tokenData = await respuesta.json();
  const expiraEn = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from('drive_tokens')
    .update({ access_token: tokenData.access_token, expira_en: expiraEn, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  return tokenData.access_token;
}

// A qué formato exportamos cada tipo de archivo nativo de Google (no se
// pueden descargar tal cual, hay que pedirle a Drive que los convierta).
const EXPORTACIONES: Record<string, { mime: string; extension: string }> = {
  'application/vnd.google-apps.document': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx'
  },
  'application/vnd.google-apps.spreadsheet': {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx'
  },
  'application/vnd.google-apps.presentation': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: 'pptx'
  }
};

serve(withCors(async req => {
  try {
    const { fileId, mimeType, nombreArchivo } = await req.json();
    if (!fileId) {
      return new Response(JSON.stringify({ ok: false, error: 'Falta el archivo.' }), { status: 200 });
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const {
      data: { user }
    } = await supabaseUser.auth.getUser();
    if (!user) return new Response(JSON.stringify({ ok: false, error: 'No autenticado.' }), { status: 200 });

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const accessToken = await obtenerAccessTokenValido(supabaseAdmin, user.id);
    if (!accessToken) {
      return new Response(JSON.stringify({ ok: false, error: 'Drive no está conectado.' }), { status: 200 });
    }

    const exportacion = EXPORTACIONES[mimeType];
    const url = exportacion
      ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportacion.mime)}`
      : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      return new Response(JSON.stringify({ ok: false, error: `Drive respondió ${respuesta.status}: ${detalle}` }), {
        status: 200
      });
    }

    const bytes = new Uint8Array(await respuesta.arrayBuffer());
    let binario = '';
    for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
    const base64 = btoa(binario);

    const nombreFinal = exportacion ? `${nombreArchivo}.${exportacion.extension}` : nombreArchivo;

    return new Response(
      JSON.stringify({ ok: true, archivoBase64: base64, nombreArchivo: nombreFinal, contentType: exportacion?.mime ?? mimeType }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
}));
