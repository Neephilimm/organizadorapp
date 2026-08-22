import { useEffect, useState } from 'react';

const QR_PROXY_URL = 'https://myvgafasrblldatemoeh.supabase.co/functions/v1/qr-proxy';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export default function Herramientas() {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(QR_PROXY_URL, { headers: { apikey: SUPABASE_ANON_KEY } })
      .then(r => r.text())
      .then(setHtml)
      .catch(e => setError(String(e)));
  }, []);

  return (
    <div className="min-h-screen bg-paper">
      <div className="px-6 pt-8 pb-3">
        <h1 className="font-display text-3xl text-ink">Herramientas</h1>
        <p className="font-body text-sm text-ink/50">Generador de QR y acortador de enlaces</p>
      </div>

      {error && <p className="px-6 font-body text-sm text-crimson">No se pudo cargar: {error}</p>}
      {!html && !error && <p className="px-6 font-body text-sm text-ink/50">Cargando…</p>}

      {html && (
        // srcdoc obliga al navegador a interpretar el contenido como HTML,
        // sin depender de qué Content-Type haya devuelto el servidor.
        <iframe
          srcDoc={html}
          title="Generador de QR"
          className="w-full border-0"
          style={{ height: 'calc(100vh - 140px)' }}
        />
      )}
    </div>
  );
}
