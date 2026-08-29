// Supabase Edge Function: canvas-modulos
// Trae los módulos (unidades) de cada curso activo, con su contenido
// (archivos, páginas, tareas, etc.) tal como los organizó el profesor.
//
// Deploy: supabase functions deploy canvas-modulos

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

    const headers = { Authorization: `Bearer ${conexion.token}` };
    const base = `https://${conexion.dominio}/api/v1`;

    const cursosRes = await fetch(`${base}/courses?enrollment_state=active&per_page=20`, { headers });
    if (!cursosRes.ok) {
      const detalle = await cursosRes.text();
      return new Response(JSON.stringify({ ok: false, error: `Canvas respondió ${cursosRes.status}: ${detalle}` }), {
        status: 200
      });
    }
    const cursos = await cursosRes.json();

    const cursosConModulos = [];

    for (const curso of cursos.slice(0, 8)) {
      const modulosRes = await fetch(
        `${base}/courses/${curso.id}/modules?include[]=items&per_page=50`,
        { headers }
      );
      if (!modulosRes.ok) continue;
      const modulosCrudos = await modulosRes.json();
      if (!modulosCrudos.length) continue;

      const modulos = modulosCrudos.map((m: any) => ({
        nombre: m.name,
        items: (m.items ?? []).map((it: any) => ({
          tipo: it.type,
          nombre: it.title,
          fileId: it.type === 'File' ? it.content_id : null,
          url: it.html_url ?? null
        }))
      }));

      cursosConModulos.push({ curso: curso.name, modulos });
    }

    return new Response(JSON.stringify({ ok: true, cursos: cursosConModulos }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
}));
