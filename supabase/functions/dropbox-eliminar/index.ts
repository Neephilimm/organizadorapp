// Supabase Edge Function: dropbox-eliminar
// Body esperado: { path }
//
// Deploy: supabase functions deploy dropbox-eliminar

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const DROPBOX_APP_KEY = Deno.env.get('DROPBOX_APP_KEY')!;
const DROPBOX_APP_SECRET = Deno.env.get('DROPBOX_APP_SECRET')!;
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

async function obtenerAccessTokenValido(supabaseAdmin: any, userId: string): Promise<string | null> {
  const { data: tokenRow } = await supabaseAdmin
    .from('dropbox_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!tokenRow) return null;

  if (new Date(tokenRow.expires_at) > new Date()) return tokenRow.access_token;

  const refreshRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokenRow.refresh_token,
      client_id: DROPBOX_APP_KEY,
      client_secret: DROPBOX_APP_SECRET
    }).toString()
  });
  if (!refreshRes.ok) return null;
  const refreshData = await refreshRes.json();

  await supabaseAdmin
    .from('dropbox_tokens')
    .update({
      access_token: refreshData.access_token,
      expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  return refreshData.access_token;
}

serve(withCors(async req => {
  try {
    const { path } = await req.json();
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
    const accessToken = await obtenerAccessTokenValido(supabaseAdmin, user.id);
    if (!accessToken) {
      return new Response(JSON.stringify({ ok: false, error: 'Dropbox no está conectado.' }), { status: 200 });
    }

    const respuesta = await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      return new Response(JSON.stringify({ ok: false, error: `Dropbox respondió ${respuesta.status}: ${detalle}` }), {
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
