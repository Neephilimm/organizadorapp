import { useEffect, useRef, useState } from 'react';

const QR_APP_URL =
  'https://script.google.com/macros/s/AKfycbws6JaMTMs40ivtq_8XZTr-2He13g4fbpZA2oOfcKXjMch85vADxAp0_-_3BUf_7d6AUQ/exec';

// Ancho "real" con el que se diseñó la herramienta de QR (no es responsive).
// La escalamos hacia abajo para que quepa en pantallas angostas sin scroll lateral.
const ANCHO_DISEÑO = 1200;

export default function Herramientas() {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  useEffect(() => {
    function recalcular() {
      const ancho = contenedorRef.current?.clientWidth ?? window.innerWidth;
      setEscala(ancho / ANCHO_DISEÑO);
    }
    recalcular();
    window.addEventListener('resize', recalcular);
    return () => window.removeEventListener('resize', recalcular);
  }, []);

  const altoVisible = window.innerHeight - 140;
  const altoIframe = altoVisible / escala;

  return (
    <div className="min-h-screen bg-paper">
      <div className="px-6 pt-8 pb-3">
        <h1 className="font-display text-3xl text-ink">Herramientas</h1>
        <p className="font-body text-sm text-ink/50">Generador de QR y acortador de enlaces</p>
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
