const NOTICIAS_APP_URL =
  'https://script.google.com/macros/s/AKfycbyi_pSXst1Mj8R9qE6d6yZ036UluX-2IMVreqgh9_cIRnqzLhpvHS-UJd_cyL64V_rw/exec';

export default function Noticias() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="px-6 pt-8 pb-3">
        <h1 className="font-display text-3xl text-ink">Noticias</h1>
        <p className="font-body text-sm text-ink/50">Panel de monitoreo y análisis</p>
      </div>
      <iframe
        src={NOTICIAS_APP_URL}
        title="Panel de Noticias"
        className="w-full border-0"
        style={{ height: 'calc(100vh - 140px)' }}
      />
    </div>
  );
}
