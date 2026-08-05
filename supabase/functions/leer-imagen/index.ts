// Supabase Edge Function: leer-imagen
// Recibe una imagen en base64, la envía a Groq (qwen/qwen3.6-27b) y devuelve
// una lista de eventos estructurados (fechas, títulos, tipo) lista para
// insertar en la tabla `eventos`.
//
// Deploy: supabase functions deploy leer-imagen
// Secret:  supabase secrets set GROQ_API_KEY=tu_key_aqui

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const PROMPT_SISTEMA = `Eres un asistente que extrae fechas académicas de una imagen
(puede ser una diapositiva de evaluaciones, un panel de horario, un calendario, etc.).

Devuelve SOLO un JSON con esta forma exacta, sin texto adicional:

{
  "eventos": [
    {
      "titulo": "string corto y claro",
      "descripcion": "string opcional con detalle, o null",
      "fecha": "YYYY-MM-DD",
      "tipo": "evaluacion" | "tarea" | "entrega" | "presentacion" | "feriado" | "sin_clases" | "lectura" | "otro"
    }
  ]
}

Reglas:
- Si el año no aparece en la imagen, usa el año actual: ${new Date().getFullYear()}.
- Si un rango de fechas es una sola actividad recurrente ("durante el semestre"), créala como un solo evento con esa descripción, no la repitas.
- Si no puedes determinar una fecha exacta para algo, no lo incluyas.
- No inventes información que no esté en la imagen.`;

serve(async req => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Método no permitido' }), { status: 405 });
  }

  try {
    const { imagenBase64, mimeType } = await req.json();

    if (!imagenBase64) {
      return new Response(JSON.stringify({ ok: false, error: 'Falta la imagen.' }), { status: 400 });
    }

    const respuesta = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.6-27b',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_completion_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT_SISTEMA },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType ?? 'image/jpeg'};base64,${imagenBase64}` }
              }
            ]
          }
        ]
      })
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      return new Response(
        JSON.stringify({ ok: false, error: `Groq respondió ${respuesta.status}: ${detalle}` }),
        { status: 502 }
      );
    }

    const data = await respuesta.json();
    const contenido = data.choices?.[0]?.message?.content ?? '{}';
    const parseado = JSON.parse(contenido);

    return new Response(JSON.stringify({ ok: true, eventos: parseado.eventos ?? [] }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
