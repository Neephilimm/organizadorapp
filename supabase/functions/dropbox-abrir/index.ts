// Supabase Edge Function: dropbox-abrir
// Descarga el contenido de un archivo de Dropbox para que la app lo abra
// localmente en el celular (en vez de mandar al usuario a dropbox.com).
//
// Body esperado: { path }
//
// Deploy: supabase functions deploy dropbox-abrir

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

serve(withCors(async req => {
  try {
    const { path, nombreArchivo } = await req.json();
    if (!path) return new Response(JSON.stringify({ ok: false, error: 'Falta el archivo.' }), { status: 200 });

    const authHeader = req.headers.get('Authorization')!;
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const {
      data: { user }
    } = await supabaseUser.auth.getUser();
    if (!user) return new Response(JSON.stringify({ ok: false, error: 'No autenticado.' }), { status: 200 });

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: conexion } = await supabaseAdmin
      .from('dropbox_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!conexion) {
      return new Response(JSON.stringify({ ok: false, error: 'Dropbox no está conectado.' }), { status: 200 });
    }

    const respuesta = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conexion.access_token}`,
        'Dropbox-API-Arg': JSON.stringify({ path })
      }
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      return new Response(JSON.stringify({ ok: false, error: `Dropbox respondió ${respuesta.status}: ${detalle}` }), {
        status: 200
      });
    }

    const bytes = new Uint8Array(await respuesta.arrayBuffer());
    let binario = '';
    for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
    const base64 = btoa(binario);

    return new Response(
      JSON.stringify({ ok: true, archivoBase64: base64, nombreArchivo: nombreArchivo ?? path.split('/').pop() }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
}));
