// Supabase Edge Function: acortar-link
// Proxy hacia tu Apps Script "QR" (endpoint de acortar URL vía TinyURL).
//
// Deploy: supabase functions deploy acortar-link
// Secret:  supabase secrets set QR_APP_URL=https://script.google.com/macros/s/AKfycbws6JaMTMs40ivtq_8XZTr-2He13g4fbpZA2oOfcKXjMch85vADxAp0_-_3BUf_7d6AUQ/exec

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const QR_APP_URL = Deno.env.get('QR_APP_URL');

serve(async req => {
  try {
    const { url: urlLarga } = await req.json();
    if (!urlLarga) {
      return new Response(JSON.stringify({ ok: false, error: 'Falta la url.' }), { status: 400 });
    }

    const destino = new URL(QR_APP_URL!);
    destino.searchParams.set('format', 'json');
    destino.searchParams.set('url', urlLarga);

    const respuesta = await fetch(destino.toString());
    const data = await respuesta.json();

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
