// Supabase Edge Function: drive-list
// Lista archivos recientes propios y compartidos contigo desde Google Drive.
// Requiere que el usuario haya iniciado sesión con Google en la app
// solicitando el scope: https://www.googleapis.com/auth/drive.readonly
//
// El cliente envía el provider_token de su sesión de Supabase (el access
// token de Google que Supabase Auth entrega tras el login OAuth).
//
// Deploy: supabase functions deploy drive-list

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

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
    const { providerToken, seccion } = await req.json();
    // seccion: 'mios' | 'compartidos'

    if (!providerToken) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta providerToken (sesión de Google expirada, vuelve a conectar).' }),
        { status: 200 }
      );
    }

    const query = seccion === 'compartidos' ? 'sharedWithMe=true' : "'me' in owners";
    const fields =
      'files(id,name,mimeType,webViewLink,thumbnailLink,iconLink,modifiedTime,size,sharingUser)';

    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      query
    )}&orderBy=modifiedTime desc&pageSize=30&fields=${encodeURIComponent(fields)}`;

    const respuesta = await fetch(url, {
      headers: { Authorization: `Bearer ${providerToken}` }
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      return new Response(JSON.stringify({ ok: false, error: detalle }), { status: 200 });
    }

    const data = await respuesta.json();

    const archivos = (data.files ?? []).map((f: any) => ({
      plataforma: 'drive',
      id: f.id,
      nombre: f.name,
      tipo_archivo: f.mimeType,
      preview: f.thumbnailLink ?? f.iconLink,
      url_externa: f.webViewLink,
      modificado: f.modifiedTime,
      compartido_por: f.sharingUser?.displayName ?? null
    }));

    return new Response(JSON.stringify({ ok: true, archivos }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
}));
