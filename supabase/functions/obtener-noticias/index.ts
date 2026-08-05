// Supabase Edge Function: obtener-noticias
// Hace de proxy hacia el Apps Script de TDI Noticias, evitando el problema de
// CORS que da Google al llamarlo directo desde el navegador o el WebView.
//
// Deploy: supabase functions deploy obtener-noticias
// Secret:  supabase secrets set TDI_NOTICIAS_URL=https://script.google.com/macros/s/AKfycbyi_pSXst1Mj8R9qE6d6yZ036UluX-2IMVreqgh9_cIRnqzLhpvHS-UJd_cyL64V_rw/exec

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const TDI_NOTICIAS_URL = Deno.env.get('TDI_NOTICIAS_URL');

serve(async req => {
  try {
    const url = new URL(req.url);
    const tabla = url.searchParams.get('tabla');

    const destino = new URL(TDI_NOTICIAS_URL!);
    destino.searchParams.set('format', 'json');
    if (tabla) destino.searchParams.set('tabla', tabla);

    const respuesta = await fetch(destino.toString());
    const data = await respuesta.json();

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
