// Supabase Edge Function: canvas-list
// Lee el dominio y token de Canvas guardados por el usuario y trae sus
// próximas tareas/eventos y los archivos que han subido los profesores.
//
// El token es un "Personal Access Token" que cualquier estudiante puede
// generar desde Canvas: Cuenta → Configuración → "+ Nueva clave de acceso".
//
// Deploy: supabase functions deploy canvas-list

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

    const base = `https://${conexion.dominio}/api/v1`;
    const headers = { Authorization: `Bearer ${conexion.token}` };

    // Próximas tareas y eventos del calendario
    const eventosRes = await fetch(`${base}/users/self/upcoming_events`, { headers });
    if (!eventosRes.ok) {
      const detalle = await eventosRes.text();
      return new Response(JSON.stringify({ ok: false, error: `Canvas respondió ${eventosRes.status}: ${detalle}` }), {
        status: eventosRes.status
      });
    }
    const eventos = await eventosRes.json();

    // Calificaciones actuales por curso
    const calRes = await fetch(
      `${base}/users/self/enrollments?type[]=StudentEnrollment&state[]=active&include[]=current_score&include[]=total_scores`,
      { headers }
    );
    const calificaciones = calRes.ok
      ? (await calRes.json()).map((en: any) => ({
          curso: en.course_id,
          nombreCurso: en.sis_course_id ?? null,
          notaActual: en.grades?.current_score ?? null,
          notaFinal: en.grades?.final_score ?? null
        }))
      : [];

    // Cursos activos, para poder listar archivos y anuncios por curso
    const cursosRes = await fetch(`${base}/courses?enrollment_state=active&per_page=20`, { headers });
    const cursos = cursosRes.ok ? await cursosRes.json() : [];

    // Rellenar el nombre real del curso en las calificaciones
    calificaciones.forEach((c: any) => {
      const curso = cursos.find((cur: any) => cur.id === c.curso);
      c.nombreCurso = curso?.name ?? `Curso ${c.curso}`;
      c.url = `https://${conexion.dominio}/courses/${c.curso}/grades`;
    });

    // Archivos y anuncios recientes de cada curso (primeros 5 cursos, para no demorar)
    const archivos: any[] = [];
    const anuncios: any[] = [];
    for (const curso of cursos.slice(0, 5)) {
      const filesRes = await fetch(`${base}/courses/${curso.id}/files?sort=updated_at&order=desc&per_page=10`, {
        headers
      });
      if (filesRes.ok) {
        const files = await filesRes.json();
        files.forEach((f: any) =>
          archivos.push({
            nombre: f.display_name,
            curso: curso.name,
            url: f.url,
            actualizado: f.updated_at,
            tipo: f['content-type']
          })
        );
      }

      const anunciosRes = await fetch(
        `${base}/courses/${curso.id}/discussion_topics?only_announcements=true&per_page=5`,
        { headers }
      );
      if (anunciosRes.ok) {
        const items = await anunciosRes.json();
        items.forEach((a: any) =>
          anuncios.push({
            titulo: a.title,
            curso: curso.name,
            fecha: a.posted_at,
            mensaje: (a.message ?? '').replace(/<[^>]+>/g, '').slice(0, 200),
            url: a.html_url
          })
        );
      }
    }

    function tipoDeTarea(asig: any): string {
      if (asig.quiz_id) return 'Evaluación';
      if ((asig.submission_types ?? []).includes('discussion_topic')) return 'Foro';
      if ((asig.submission_types ?? []).includes('online_upload')) return 'Entrega de archivo';
      if ((asig.submission_types ?? []).includes('online_text_entry')) return 'Tarea';
      return 'Actividad';
    }

    const tareas = eventos
      .filter((e: any) => e.assignment)
      .map((e: any) => ({
        titulo: e.title,
        curso: e.context_name,
        cursoId: e.assignment.course_id,
        assignmentId: e.assignment.id,
        fecha: e.assignment.due_at,
        url: e.html_url,
        tipo: tipoDeTarea(e.assignment),
        descripcion: (e.assignment.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600),
        entregada: !!e.assignment.has_submitted_submissions,
        discussionTopicId: e.assignment.discussion_topic?.id ?? null,
        tiposDeArchivoPermitidos: e.assignment.allowed_extensions ?? []
      }));

    return new Response(JSON.stringify({ ok: true, tareas, archivos, calificaciones, anuncios }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 200 });
  }
}));



