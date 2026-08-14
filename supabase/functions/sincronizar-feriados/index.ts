// Supabase Edge Function: sincronizar-feriados
// Trae los feriados oficiales de Chile del año actual (y el próximo, si ya
// estamos en el último trimestre) y los agrega como eventos tipo "feriado"
// para el usuario que llama, evitando duplicados.
//
// Deploy: supabase functions deploy sincronizar-feriados

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

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

async function feriadosDeChile(anio: number) {
  const resp = await fetch(`https://api.boostr.cl/holidays/${anio}.json`);
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data?.data ?? []) as { date: string; title: string; type: string; inalienable: boolean }[];
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

    const anioActual = new Date().getFullYear();
    const anios = [anioActual, anioActual + 1];
    const feriados = (await Promise.all(anios.map(feriadosDeChile))).flat();

    const { data: yaGuardados } = await supabaseAdmin
      .from('eventos')
      .select('fecha')
      .eq('user_id', user.id)
      .eq('tipo', 'feriado');

    const fechasExistentes = new Set((yaGuardados ?? []).map(e => e.fecha));

    const nuevos = feriados
      .filter(f => !fechasExistentes.has(f.date))
      .map(f => ({
        user_id: user.id,
        titulo: f.title,
        descripcion: 'Feriado nacional (Chile)',
        fecha: f.date,
        tipo: 'feriado',
        origen: 'manual',
        recurrente: false,
        categoria_id: null
      }));

    if (nuevos.length > 0) {
      await supabaseAdmin.from('eventos').insert(nuevos);
    }

    return new Response(JSON.stringify({ ok: true, agregados: nuevos.length }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
}));
