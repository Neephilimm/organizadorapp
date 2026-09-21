// Utilidades compartidas para abrir/reproducir archivos descargados desde
// Drive, Dropbox o Canvas dentro de la app.

const MAPA_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  aac: 'audio/aac',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip'
};

export function mimeDesdeNombre(nombre: string): string {
  const ext = nombre.split('.').pop()?.toLowerCase() ?? '';
  return MAPA_MIME[ext] ?? 'application/octet-stream';
}

export function esAudio(mime: string): boolean {
  return mime.startsWith('audio/');
}
