// Supabase Edge Function: canvas-entregar-archivo
// Sube un archivo y lo entrega como respuesta a una tarea de Canvas.
// Sigue el proceso de 3 pasos documentado por Canvas:
//   1) Pedir una URL de subida para el archivo.
//   2) Subir el archivo a esa URL.
//   3) Confirmar el archivo subido como la entrega de la tarea.
//
// Body esperado: { cursoId, assignmentId, nombreArchivo, contentType, archivoBase64 }
//
// Nota: por el límite de tamaño de las Edge Functions, funciona bien con
// documentos normales (PDF, Word, imágenes) pero no con archivos muy pesados
// (videos largos, etc.).
//
// Deploy: supabase functions deploy canvas-entregar-archivo

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

function base64ABytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

serve(withCors(async req => {
  try {
    const { cursoId, assignmentId, nombreArchivo, contentType, archivoBase64 } = await req.json();
    if (!cursoId || !assignmentId || !nombreArchivo || !archivoBase64) {
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

    const base = `https://${conexion.dominio}/api/v1`;
    const headersCanvas = { Authorization: `Bearer ${conexion.token}` };
    const bytes = base64ABytes(archivoBase64);

    // Paso 1: pedir dónde subir el archivo
    const paso1 = await fetch(
      `${base}/courses/${cursoId}/assignments/${assignmentId}/submissions/self/files`,
      {
        method: 'POST',
        headers: { ...headersCanvas, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombreArchivo, size: bytes.length, content_type: contentType })
      }
    );
    if (!paso1.ok) {
      const detalle = await paso1.text();
      return new Response(
        JSON.stringify({ ok: false, error: `No se pudo iniciar la subida (${paso1.status}): ${detalle}` }),
        { status: 200 }
      );
    }
    const { upload_url, upload_params } = await paso1.json();

    // Paso 2: subir el archivo a la URL que Canvas indicó
    const formulario = new FormData();
    for (const [clave, valor] of Object.entries(upload_params ?? {})) {
      formulario.append(clave, String(valor));
    }
    formulario.append('file', new Blob([bytes], { type: contentType }), nombreArchivo);

    const paso2 = await fetch(upload_url, { method: 'POST', body: formulario, redirect: 'manual' });

    let archivoSubidoId: number | null = null;
    if (paso2.status >= 300 && paso2.status < 400) {
      // Canvas suele responder con un redirect a una URL de confirmación
      const ubicacion = paso2.headers.get('Location')!;
      const confirmacion = await fetch(ubicacion, { headers: headersCanvas });
      const datosArchivo = await confirmacion.json();
      archivoSubidoId = datosArchivo.id;
    } else if (paso2.ok) {
      const datosArchivo = await paso2.json();
      archivoSubidoId = datosArchivo.id;
    } else {
      const detalle = await paso2.text();
      return new Response(
        JSON.stringify({ ok: false, error: `Falló la subida del archivo (${paso2.status}): ${detalle}` }),
        { status: 200 }
      );
    }

    if (!archivoSubidoId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Canvas no devolvió un ID de archivo válido.' }),
        { status: 200 }
      );
    }

    // Paso 3: confirmar el archivo como la entrega de la tarea
    const paso3 = await fetch(`${base}/courses/${cursoId}/assignments/${assignmentId}/submissions`, {
      method: 'POST',
      headers: { ...headersCanvas, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submission: { submission_type: 'online_upload', file_ids: [archivoSubidoId] }
      })
    });

    if (!paso3.ok) {
      const detalle = await paso3.text();
      return new Response(
        JSON.stringify({ ok: false, error: `No se pudo confirmar la entrega (${paso3.status}): ${detalle}` }),
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
