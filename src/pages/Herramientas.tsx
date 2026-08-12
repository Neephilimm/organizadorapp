import { useEffect, useRef, useState } from 'react';

const QR_APP_URL =
  'https://script.google.com/macros/s/AKfycbws6JaMTMs40ivtq_8XZTr-2He13g4fbpZA2oOfcKXjMch85vADxAp0_-_3BUf_7d6AUQ/exec';

// Ancho "real" con el que se diseñó la herramienta de QR (no es responsive).
// AJUSTE_ZOOM te deja corregir a mano si se ve muy chico o muy grande: 1 = normal,
// >1 acerca (se ve más grande), <1 aleja (se ve más chico).
const ANCHO_DISEÑO = 1200;

export default function Herramientas() {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [escalaBase, setEscalaBase] = useState(1);
  const [ajusteZoom, setAjusteZoom] = useState(() => {
    const guardado = localStorage.getItem('qr-zoom');
    return guardado ? Number(guardado) : 1;
  });

  useEffect(() => {
    function recalcular() {
      const ancho = contenedorRef.current?.clientWidth ?? window.innerWidth;
      setEscalaBase(ancho / ANCHO_DISEÑO);
    }
    recalcular();
    window.addEventListener('resize', recalcular);
    return () => window.removeEventListener('resize', recalcular);
  }, []);

  function cambiarZoom(delta: number) {
    setAjusteZoom(prev => {
      const nuevo = Math.min(2.5, Math.max(0.4, +(prev + delta).toFixed(2)));
      localStorage.setItem('qr-zoom', String(nuevo));
      return nuevo;
    });
  }

  const escala = escalaBase * ajusteZoom;
  const altoVisible = window.innerHeight - 140;
  const altoIframe = altoVisible / escala;

  return (
    <div className="min-h-screen bg-paper">
      <div className="px-6 pt-8 pb-3 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink">Herramientas</h1>
          <p className="font-body text-sm text-ink/50">Generador de QR y acortador de enlaces</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => cambiarZoom(-0.1)}
            className="w-9 h-9 rounded bg-white border border-ink/10 font-mono text-lg text-ink"
            aria-label="Alejar"
          >
            −
          </button>
          <span className="font-mono text-xs text-ink/50 w-10 text-center">
            {Math.round(ajusteZoom * 100)}%
          </span>
          <button
            onClick={() => cambiarZoom(0.1)}
            className="w-9 h-9 rounded bg-white border border-ink/10 font-mono text-lg text-ink"
            aria-label="Acercar"
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={contenedorRef}
        style={{ height: altoVisible, overflow: 'hidden' }}
        className="w-full"
      >
        <iframe
          src={QR_APP_URL}
          title="Generador de QR"
          className="border-0"
          style={{
            width: ANCHO_DISEÑO,
            height: altoIframe,
            transform: `scale(${escala})`,
            transformOrigin: 'top left'
          }}
        />
      </div>
    </div>
  );
}
