import { LocalNotifications } from '@capacitor/local-notifications';

// Convierte el UUID del evento en un número entero estable, porque el plugin
// de notificaciones necesita un ID numérico (no acepta UUIDs de texto).
function idNumerico(eventoId: string): number {
  let hash = 0;
  for (let i = 0; i < eventoId.length; i++) {
    hash = (hash * 31 + eventoId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2147483647;
}

export const DIAS_DE_AVISO_POR_DEFECTO: Record<string, number> = {
  evaluacion: 3,
  entrega: 2,
  presentacion: 3,
  lectura: 1,
  tarea: 1,
  otro: 1
};

const CLAVE_CONFIG_AVISOS = 'dias-aviso-config';

export function leerConfigAvisos(): Record<string, number> {
  try {
    return { ...DIAS_DE_AVISO_POR_DEFECTO, ...JSON.parse(localStorage.getItem(CLAVE_CONFIG_AVISOS) ?? '{}') };
  } catch {
    return { ...DIAS_DE_AVISO_POR_DEFECTO };
  }
}

export function guardarConfigAvisos(config: Record<string, number>) {
  localStorage.setItem(CLAVE_CONFIG_AVISOS, JSON.stringify(config));
}

export async function pedirPermisoNotificaciones() {
  try {
    await LocalNotifications.requestPermissions();
  } catch {
    // Si el usuario lo niega, seguimos sin recordatorios — no es bloqueante.
  }
}

export async function programarRecordatorio(evento: {
  id: string;
  titulo: string;
  fecha: string;
  tipo: string;
}) {
  const diasAntes = leerConfigAvisos()[evento.tipo];
  if (!diasAntes) return; // feriados/sin_clases no necesitan recordatorio

  const fechaEvento = new Date(`${evento.fecha}T09:00:00`);
  const fechaAviso = new Date(fechaEvento);
  fechaAviso.setDate(fechaAviso.getDate() - diasAntes);

  // Si ya estamos muy cerca (o pasó la fecha de aviso), no programa nada.
  if (fechaAviso.getTime() <= Date.now()) return;

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: idNumerico(evento.id),
          title: 'Organizador Académico',
          body: `"${evento.titulo}" vence en ${diasAntes} día${diasAntes > 1 ? 's' : ''} (${evento.fecha})`,
          schedule: { at: fechaAviso }
        }
      ]
    });
  } catch {
    // Sin permiso o plugin no disponible — seguimos sin romper el guardado.
  }
}

export async function cancelarRecordatorio(eventoId: string) {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: idNumerico(eventoId) }] });
  } catch {
    // no-op
  }
}

// --- Aviso de contenido nuevo de Canvas (no es push real: se dispara cuando
// abres la sección Canvas y detecta algo que no habías visto antes) ---

let contadorNotificacion = 900000000;

export async function notificarAhora(titulo: string, cuerpo: string) {
  try {
    contadorNotificacion += 1;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: contadorNotificacion,
          title: titulo,
          body: cuerpo,
          schedule: { at: new Date(Date.now() + 500) }
        }
      ]
    });
  } catch {
    // no-op
  }
}

function leerVistos(clave: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(clave) ?? '[]'));
  } catch {
    return new Set();
  }
}

function guardarVistos(clave: string, ids: Set<string>) {
  // Solo guarda los últimos 300 para que no crezca sin límite.
  localStorage.setItem(clave, JSON.stringify(Array.from(ids).slice(-300)));
}

/**
 * Compara una lista de items de Canvas (anuncios, archivos, etc.) contra los
 * que ya se habían visto, avisa por los nuevos, y actualiza el registro.
 * `idDeItem` debe devolver algo estable (ej: curso + título).
 */
export async function avisarNovedadesCanvas<T>(
  clave: string,
  items: T[],
  idDeItem: (item: T) => string,
  mensajeDeItem: (item: T) => { titulo: string; cuerpo: string }
) {
  const vistos = leerVistos(clave);
  const esPrimeraVez = vistos.size === 0;
  const nuevos = items.filter(item => !vistos.has(idDeItem(item)));

  for (const item of items) vistos.add(idDeItem(item));
  guardarVistos(clave, vistos);

  // La primera vez que se sincroniza no avisa de nada (si no, avisaría de
  // TODO el historial de una), solo a partir de la segunda visita.
  if (esPrimeraVez || nuevos.length === 0) return;

  for (const item of nuevos.slice(0, 5)) {
    const { titulo, cuerpo } = mensajeDeItem(item);
    await notificarAhora(titulo, cuerpo);
  }
}
