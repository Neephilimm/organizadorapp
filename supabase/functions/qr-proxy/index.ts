// Supabase Edge Function: qr-proxy
// Sirve el HTML del generador de QR (Apps Script) pasando por nuestro servidor,
// inyectando una capa de CSS responsivo para que se vea bien en celulares —
// sin tocar el Apps Script original, que sigue funcionando igual en PC.
//
// Deploy: supabase functions deploy qr-proxy

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const QR_APP_URL =
  'https://script.google.com/macros/s/AKfycbws6JaMTMs40ivtq_8XZTr-2He13g4fbpZA2oOfcKXjMch85vADxAp0_-_3BUf_7d6AUQ/exec';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const CSS_RESPONSIVO = `
<style>
  html, body { max-width: 100vw !important; overflow-x: hidden !important; }
  * { box-sizing: border-box !important; }
  @media (max-width: 820px) {
    body > div, body > table, body > form,
    [class*="container"], [class*="wrapper"], [class*="layout"] {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      float: none !important;
    }
    table { width: 100% !important; }
    img, canvas, svg { max-width: 100% !important; height: auto !important; }
  }
</style>
`;

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // OJO: no reenviamos el query string original (traía nuestra propia
    // apikey, que no le corresponde al Apps Script de destino).
    const respuesta = await fetch(QR_APP_URL, { redirect: 'follow' });
    let html = await respuesta.text();

    // <base> hace que todos los enlaces/recursos relativos sigan apuntando
    // al Apps Script original, aunque el HTML se sirva desde nuestro dominio.
    const baseTag = `<base href="https://script.google.com/">`;
    const viewportTag = `<meta name="viewport" content="width=device-width, initial-scale=1">`;

    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>${baseTag}${viewportTag}${CSS_RESPONSIVO}`);
    } else {
      html = baseTag + viewportTag + CSS_RESPONSIVO + html;
    }

    const headers = new Headers();
    Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(html, { status: 200, headers });
  } catch (e) {
    return new Response(`Error cargando el generador de QR: ${String(e)}`, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }
});
