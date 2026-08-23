// Supabase Edge Function: drive-upload
// Sube un archivo a la raíz de Google Drive del usuario.
//
// Body esperado: { nombreArchivo, contentType, archivoBase64 }
//
// Deploy: supabase functions deploy drive-upload

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

function base64ABytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
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

serve(withCors(async req => {
  try {
    const { nombreArchivo, contentType, archivoBase64 } = await req.json();
    if (!nombreArchivo || !archivoBase64) {
      return new Response(JSON.stringify({ ok: false, error: 'Faltan datos.' }), { status: 200 });
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

    const bytes = base64ABytes(archivoBase64);
    const metadata = { name: nombreArchivo };
    const boundary = 'organizadorapp_boundary';

    const cuerpo =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${contentType || 'application/octet-stream'}\r\n\r\n`;

    const cierre = `\r\n--${boundary}--`;

    const cuerpoCompleto = new Uint8Array(
      new TextEncoder().encode(cuerpo).length + bytes.length + new TextEncoder().encode(cierre).length
    );
    cuerpoCompleto.set(new TextEncoder().encode(cuerpo), 0);
    cuerpoCompleto.set(bytes, new TextEncoder().encode(cuerpo).length);
    cuerpoCompleto.set(new TextEncoder().encode(cierre), new TextEncoder().encode(cuerpo).length + bytes.length);

    const subida = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: cuerpoCompleto
      }
    );

    if (!subida.ok) {
      const detalle = await subida.text();
      return new Response(JSON.stringify({ ok: false, error: `Drive respondió ${subida.status}: ${detalle}` }), {
        status: 200
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
}));
