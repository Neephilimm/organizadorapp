// Supabase Edge Function: drive-oauth-callback
// Canjea el código que Google devuelve (flujo PKCE, sin client_secret) por un
// access_token/refresh_token, y los guarda para ese usuario.
//
// Body esperado: { code, codeVerifier }
//
// Deploy: supabase functions deploy drive-oauth-callback

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!;
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_DRIVE_REDIRECT_URI')!;

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
    const { code, codeVerifier } = await req.json();
    if (!code || !codeVerifier) {
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

    const params = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_REDIRECT_URI
    });

    const respuesta = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const tokenData = await respuesta.json();
    if (!respuesta.ok) {
      return new Response(JSON.stringify({ ok: false, error: JSON.stringify(tokenData) }), { status: 200 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const expiraEn = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Google solo manda refresh_token en el primer consentimiento; si no viene,
    // mantenemos el que ya teníamos guardado.
    let refreshToken = tokenData.refresh_token;
    if (!refreshToken) {
      const { data: existente } = await supabaseAdmin
        .from('drive_tokens')
        .select('refresh_token')
        .eq('user_id', user.id)
        .maybeSingle();
      refreshToken = existente?.refresh_token;
    }

    if (!refreshToken) {
      return new Response(
        JSON.stringify({
          ok: false,
          error:
            'Google no envió un token de renovación. Vuelve a intentarlo — a veces hace falta revocar el acceso desde myaccount.google.com/permissions y conectar de nuevo.'
        }),
        { status: 200 }
      );
    }

    await supabaseAdmin.from('drive_tokens').upsert({
      user_id: user.id,
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      expira_en: expiraEn,
      updated_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
}));
