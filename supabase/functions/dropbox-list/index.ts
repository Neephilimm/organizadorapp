// Supabase Edge Function: dropbox-list
// Lista archivos recientes del usuario en Dropbox y genera enlaces temporales
// para previsualizar (thumbnails) audio/video/imágenes.
//
// Deploy: supabase functions deploy dropbox-list

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const DROPBOX_APP_KEY = Deno.env.get('DROPBOX_APP_KEY')!;
const DROPBOX_APP_SECRET = Deno.env.get('DROPBOX_APP_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
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
    const authHeader = req.headers.get('Authorization')!;
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const {
      data: { user }
    } = await supabaseUser.auth.getUser();
    if (!user) return new Response(JSON.stringify({ ok: false, error: 'No autenticado.' }), { status: 200 });

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: tokenRow } = await supabaseAdmin
      .from('dropbox_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!tokenRow) {
      return new Response(JSON.stringify({ ok: false, error: 'Dropbox no está conectado.' }), { status: 200 });
    }

    let accessToken = tokenRow.access_token;

    // Refrescar si expiró
    if (new Date(tokenRow.expires_at) <= new Date()) {
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
      const refreshData = await refreshRes.json();
      accessToken = refreshData.access_token;

      await supabaseAdmin
        .from('dropbox_tokens')
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);
    }

    const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: '', recursive: false, limit: 30 })
    });

    const listData = await listRes.json();
    if (!listRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: JSON.stringify(listData) }), { status: 200 });
    }

    async function obtenerLinkCompartido(path: string): Promise<string | null> {
      // Intenta crear un link nuevo; si ya existe uno para ese archivo,
      // Dropbox devuelve un error específico — en ese caso lo buscamos.
      const crear = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      const datosCrear = await crear.json();
      if (crear.ok) return datosCrear.url;

      if (datosCrear?.error?.['.tag'] === 'shared_link_already_exists') {
        const existentes = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, direct_only: true })
        });
        const datosExistentes = await existentes.json();
        return datosExistentes?.links?.[0]?.url ?? null;
      }

      return null;
    }

    const archivosCrudos = (listData.entries ?? []).filter((e: any) => e['.tag'] === 'file');

    const archivos = await Promise.all(
      archivosCrudos.map(async (f: any) => {
        const linkCompartir = await obtenerLinkCompartido(f.path_lower);
        return {
          plataforma: 'dropbox',
          id: f.id,
          nombre: f.name,
          tipo_archivo: f.name.split('.').pop(),
          modificado: f.server_modified,
          path: f.path_lower,
          // Un link "?dl=0" abre la vista previa de Dropbox; con "?dl=1"
          // descarga/reproduce directo — útil para insertar en Apps Script.
          url_externa: linkCompartir,
          url_directa: linkCompartir ? linkCompartir.replace('?dl=0', '?dl=1').replace(/&dl=0/, '&dl=1') : null
        };
      })
    );

    return new Response(JSON.stringify({ ok: true, archivos }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
}));
