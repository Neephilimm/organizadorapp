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

const DIAS_DE_AVISO: Record<string, number> = {
  evaluacion: 3,
  entrega: 2,
  presentacion: 3,
  lectura: 1,
  tarea: 1,
  otro: 1
};

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
  const diasAntes = DIAS_DE_AVISO[evento.tipo];
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
