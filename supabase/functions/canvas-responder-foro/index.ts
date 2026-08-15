// Supabase Edge Function: canvas-responder-foro
// Publica una respuesta en un foro (discussion topic) de Canvas usando el
// token guardado del usuario.
//
// Body esperado: { cursoId: number, discussionTopicId: number, mensaje: string }
//
// Deploy: supabase functions deploy canvas-responder-foro

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
    const { cursoId, discussionTopicId, mensaje } = await req.json();
    if (!cursoId || !discussionTopicId || !mensaje?.trim()) {
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
    const { data: conexion } = await supabaseAdmin
      .from('canvas_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!conexion) {
      return new Response(JSON.stringify({ ok: false, error: 'Canvas no está conectado.' }), { status: 200 });
    }

    const url = `https://${conexion.dominio}/api/v1/courses/${cursoId}/discussion_topics/${discussionTopicId}/entries`;
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conexion.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: mensaje })
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      return new Response(
        JSON.stringify({ ok: false, error: `Canvas respondió ${respuesta.status}: ${detalle}` }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
}));
