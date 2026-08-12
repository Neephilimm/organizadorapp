import { useEffect, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { supabase, Categoria, TipoEvento } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

type EventoDetectado = {
  titulo: string;
  descripcion: string | null;
  fecha: string;
  tipo: TipoEvento;
};

export default function NuevoEvento() {
  const navigate = useNavigate();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [modo, setModo] = useState<'manual' | 'foto'>('manual');

  // Formulario manual
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState('');
  const [tipo, setTipo] = useState<TipoEvento>('evaluacion');
  const [categoriaId, setCategoriaId] = useState<string>('');

  // Flujo de foto
  const [analizando, setAnalizando] = useState(false);
  const [detectados, setDetectados] = useState<EventoDetectado[]>([]);
  const [categoriaFoto, setCategoriaFoto] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('categorias')
      .select('*')
      .then(({ data }) => setCategorias(data ?? []));
  }, []);

  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardarManual(e: React.FormEvent) {
    e.preventDefault();
    setErrorGuardar(null);

    if (!fecha || !titulo) {
      setErrorGuardar('Falta el título o la fecha.');
      return;
    }

    setGuardando(true);
    const {
      data: { user },
      error: errorUsuario
    } = await supabase.auth.getUser();

    if (errorUsuario || !user) {
      setErrorGuardar(
        'No hay sesión activa (revisa que Supabase esté bien configurado y que hayas iniciado sesión).'
      );
      setGuardando(false);
      return;
    }

    const { error: errorInsertar } = await supabase.from('eventos').insert({
      user_id: user.id,
      titulo,
      descripcion: descripcion || null,
      fecha,
      tipo,
      categoria_id: categoriaId || null,
      origen: 'manual'
    });

    setGuardando(false);

    if (errorInsertar) {
      setErrorGuardar(`No se pudo guardar: ${errorInsertar.message}`);
      return;
    }

    navigate('/');
  }

  async function tomarFoto() {
    if (!categoriaFoto) {
      setError('Primero elige de qué ramo es esta evaluación.');
      return;
    }
    setError(null);
    setDetectados([]);

    const foto = await Camera.getPhoto({
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt, // deja elegir entre cámara o galería
      quality: 85
    });

    if (!foto.base64String) return;

    setAnalizando(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('leer-imagen', {
        body: { imagenBase64: foto.base64String, mimeType: `image/${foto.format}` }
      });

      if (fnError) throw fnError;
      if (!data.ok) throw new Error(data.error);

      setDetectados(data.eventos);
    } catch (e: any) {
      setError(e.message ?? 'No se pudo analizar la imagen.');
    } finally {
      setAnalizando(false);
    }
  }

  async function confirmarDetectados() {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    const filas = detectados.map(ev => ({
      user_id: user.id,
      titulo: ev.titulo,
      descripcion: ev.descripcion,
      fecha: ev.fecha,
      tipo: ev.tipo,
      categoria_id: categoriaFoto,
      origen: 'imagen' as const
    }));

    await supabase.from('eventos').insert(filas);
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24">
      <h1 className="font-display text-3xl text-ink mb-4">Nueva fecha</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setModo('manual')}
          className={`flex-1 font-mono text-xs uppercase py-2 rounded ${modo === 'manual' ? 'bg-ink text-paper' : 'bg-white text-ink/50'}`}
        >
          Manual
        </button>
        <button
          onClick={() => setModo('foto')}
          className={`flex-1 font-mono text-xs uppercase py-2 rounded ${modo === 'foto' ? 'bg-ink text-paper' : 'bg-white text-ink/50'}`}
        >
          Desde una foto
        </button>
      </div>

      {modo === 'manual' && (
        <form onSubmit={guardarManual} className="bg-white rounded-lg p-4 shadow-sm space-y-4">
          <div>
            <label className="font-mono text-xs uppercase tracking-wide text-ink/50 block mb-1">
              Título
            </label>
            <input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ej: Entrega informe Regular 1"
              className="w-full font-body border border-ink/10 rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="font-mono text-xs uppercase tracking-wide text-ink/50 block mb-1">
              Detalle (opcional)
            </label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              className="w-full font-body border border-ink/10 rounded px-3 py-2"
              rows={2}
            />
          </div>

          <div>
            <label className="font-mono text-xs uppercase tracking-wide text-ink/50 block mb-1">
              Fecha
            </label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full font-body border border-ink/10 rounded px-3 py-2 text-ink"
              required
            />
          </div>

          <div>
            <label className="font-mono text-xs uppercase tracking-wide text-ink/50 block mb-1">
              Tipo
            </label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as TipoEvento)}
              className="w-full font-body border border-ink/10 rounded px-3 py-2"
            >
              <option value="evaluacion">Evaluación</option>
              <option value="tarea">Tarea</option>
              <option value="entrega">Entrega</option>
              <option value="presentacion">Presentación</option>
              <option value="lectura">Control de lectura</option>
              <option value="feriado">Feriado</option>
              <option value="sin_clases">Sin clases</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <div>
            <label className="font-mono text-xs uppercase tracking-wide text-ink/50 block mb-1">
              Categoría
            </label>
            <select
              value={categoriaId}
              onChange={e => setCategoriaId(e.target.value)}
              className="w-full font-body border border-ink/10 rounded px-3 py-2"
            >
              <option value="">Sin categoría</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={guardando}
            className="w-full bg-teal text-white rounded py-3 font-medium disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          {errorGuardar && <p className="font-body text-sm text-crimson">{errorGuardar}</p>}
        </form>
      )}

      {modo === 'foto' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <label className="font-mono text-xs uppercase tracking-wide text-ink/50 block mb-1">
              ¿De qué ramo es? (obligatorio)
            </label>
            <select
              value={categoriaFoto}
              onChange={e => setCategoriaFoto(e.target.value)}
              className="w-full font-body border border-ink/10 rounded px-3 py-2"
            >
              <option value="">Elige un ramo…</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {categorias.length === 0 && (
              <p className="font-body text-xs text-ink/40 mt-1">
                Todavía no tienes categorías creadas — ve a "Categorías" en el menú y crea una primero.
              </p>
            )}
          </div>

          <button
            onClick={tomarFoto}
            disabled={analizando}
            className="w-full bg-ink text-paper rounded-lg py-4 font-body font-medium disabled:opacity-50"
          >
            {analizando ? 'Leyendo la imagen…' : '📷 Elegir o tomar foto'}
          </button>

          {error && <p className="font-body text-sm text-crimson">{error}</p>}

          {detectados.length > 0 && (
            <div className="bg-white rounded-lg p-4 shadow-sm space-y-3">
              <p className="font-mono text-xs uppercase text-ink/50">
                {detectados.length} fecha(s) detectadas — revisa antes de guardar
              </p>
              {detectados.map((ev, i) => (
                <div key={i} className="border-b border-ink/10 pb-2 last:border-0">
                  <p className="font-display text-ink">{ev.titulo}</p>
                  <p className="font-mono text-xs text-ink/50">
                    {ev.fecha} · {ev.tipo}
                  </p>
                </div>
              ))}
              <button
                onClick={confirmarDetectados}
                className="w-full bg-teal text-white rounded py-2 font-medium mt-2"
              >
                Confirmar y guardar todas
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
