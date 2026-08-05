// Supabase Edge Function: dropbox-oauth-callback
// Intercambia el "code" del flujo OAuth de Dropbox por access/refresh tokens
// y los guarda en la tabla dropbox_tokens del usuario autenticado.
//
// Deploy: supabase functions deploy dropbox-oauth-callback
// Secrets:
//   supabase secrets set DROPBOX_APP_KEY=tu_app_key
//   supabase secrets set DROPBOX_APP_SECRET=tu_app_secret
//   supabase secrets set DROPBOX_REDIRECT_URI=cl.organizador.academico://dropbox-callback

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const DROPBOX_APP_KEY = Deno.env.get('DROPBOX_APP_KEY')!;
const DROPBOX_APP_SECRET = Deno.env.get('DROPBOX_APP_SECRET')!;
const DROPBOX_REDIRECT_URI = Deno.env.get('DROPBOX_REDIRECT_URI')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async req => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: 'No autenticado.' }), { status: 401 });
    }

    // Cliente con el JWT del usuario para saber quién es
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const {
      data: { user }
    } = await supabaseUser.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: 'Usuario no válido.' }), { status: 401 });
    }

    const { code } = await req.json();

    const params = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: DROPBOX_APP_KEY,
      client_secret: DROPBOX_APP_SECRET,
      redirect_uri: DROPBOX_REDIRECT_URI
    });

    const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: tokenData }), { status: 400 });
    }

    // Cliente con service role para escribir en la tabla del usuario
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    await supabaseAdmin.from('dropbox_tokens').upsert({
      user_id: user.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString()
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
