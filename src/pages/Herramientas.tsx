const QR_APP_URL =
  'https://script.google.com/macros/s/AKfycbws6JaMTMs40ivtq_8XZTr-2He13g4fbpZA2oOfcKXjMch85vADxAp0_-_3BUf_7d6AUQ/exec';

export default function Herramientas() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="px-6 pt-8 pb-3">
        <h1 className="font-display text-3xl text-ink">Herramientas</h1>
        <p className="font-body text-sm text-ink/50">Generador de QR y acortador de enlaces</p>
      </div>
      <iframe
        src={QR_APP_URL}
        title="Generador de QR"
        className="w-full border-0"
        style={{ height: 'calc(100vh - 140px)' }}
      />
    </div>
  );
}
