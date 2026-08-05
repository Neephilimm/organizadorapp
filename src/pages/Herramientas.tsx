import { useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';

export default function Herramientas() {
  const [textoQR, setTextoQR] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const [urlLarga, setUrlLarga] = useState('');
  const [urlCorta, setUrlCorta] = useState<string | null>(null);
  const [errorCorta, setErrorCorta] = useState<string | null>(null);
  const [acortando, setAcortando] = useState(false);

  async function generarQR() {
    if (!textoQR.trim()) return;
    const dataUrl = await QRCode.toDataURL(textoQR.trim(), { width: 320, margin: 1 });
    setQrDataUrl(dataUrl);
  }

  async function acortar() {
    if (!urlLarga.trim()) return;
    setAcortando(true);
    setErrorCorta(null);
    setUrlCorta(null);

    const { data, error } = await supabase.functions.invoke('acortar-link', {
      body: { url: urlLarga.trim() }
    });

    setAcortando(false);
    if (error || !data?.ok) {
      setErrorCorta(data?.error ?? 'No se pudo acortar el enlace.');
      return;
    }
    setUrlCorta(data.corto);
  }

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24 space-y-8">
      <h1 className="font-display text-3xl text-ink">Herramientas</h1>

      <section className="bg-white rounded-lg p-4 shadow-sm">
        <p className="font-mono text-xs uppercase text-ink/50 mb-2">Generador de QR</p>
        <input
          value={textoQR}
          onChange={e => setTextoQR(e.target.value)}
          placeholder="Texto o enlace"
          className="w-full font-body border border-ink/10 rounded px-3 py-2 mb-3"
        />
        <button onClick={generarQR} className="w-full bg-ink text-paper rounded py-2 font-medium mb-3">
          Generar QR
        </button>
        {qrDataUrl && (
          <img src={qrDataUrl} alt="Código QR generado" className="mx-auto rounded" />
        )}
      </section>

      <section className="bg-white rounded-lg p-4 shadow-sm">
        <p className="font-mono text-xs uppercase text-ink/50 mb-2">Acortador de enlaces</p>
        <input
          value={urlLarga}
          onChange={e => setUrlLarga(e.target.value)}
          placeholder="https://enlace-muy-largo.com/..."
          className="w-full font-body border border-ink/10 rounded px-3 py-2 mb-3"
        />
        <button
          onClick={acortar}
          disabled={acortando}
          className="w-full bg-teal text-white rounded py-2 font-medium disabled:opacity-50"
        >
          {acortando ? 'Acortando…' : 'Acortar enlace'}
        </button>
        {errorCorta && <p className="font-body text-sm text-crimson mt-2">{errorCorta}</p>}
        {urlCorta && (
          <p className="font-mono text-sm text-teal mt-3 break-all">{urlCorta}</p>
        )}
      </section>
    </div>
  );
}
