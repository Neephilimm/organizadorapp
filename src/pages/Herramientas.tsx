const QR_PROXY_URL = 'https://myvgafasrblldatemoeh.supabase.co/functions/v1/qr-proxy';

export default function Herramientas() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="px-6 pt-8 pb-3">
        <h1 className="font-display text-3xl text-ink">Herramientas</h1>
        <p className="font-body text-sm text-ink/50">Generador de QR y acortador de enlaces</p>
      </div>
      <iframe
        src={QR_PROXY_URL}
        title="Generador de QR"
        className="w-full border-0"
        style={{ height: 'calc(100vh - 140px)' }}
      />
    </div>
  );
}
