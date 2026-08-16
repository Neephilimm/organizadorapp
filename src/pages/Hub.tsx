import { useEffect, useRef, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { supabase } from '../lib/supabase';

type ArchivoHub = {
  plataforma: 'supabase' | 'drive' | 'dropbox';
  nombre: string;
  tipo_archivo: string;
  preview?: string | null;
  url_externa?: string | null;
  url_directa?: string | null;
  storage_path?: string | null;
  modificado?: string;
  compartido_por?: string | null;
};

const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY as string;
const DROPBOX_REDIRECT_URI = 'cl.organizador.academico://dropbox-callback';

function nombreLegible(nombreEnStorage: string) {
  // Los archivos se guardan como "<timestamp>_<nombre original>"
  const sinPrefijo = nombreEnStorage.replace(/^\d+_/, '');
  return decodeURIComponent(sinPrefijo);
}

export default function Hub() {
  const [seccion, setSeccion] = useState<'mios' | 'drive' | 'dropbox'>('mios');
  const [archivos, setArchivos] = useState<ArchivoHub[]>([]);
  const [cargando, setCargando] = useState(true);
  const [dropboxConectado, setDropboxConectado] = useState<boolean | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    cargarSeccion(seccion);
  }, [seccion]);

  useEffect(() => {
    // Al volver de conectar Google Drive o Dropbox (el navegador se cierra y
    // vuelves a esta pantalla), refresca la sección actual automáticamente.
    const listener = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) cargarSeccion(seccion);
    });
    return () => {
      listener.then(l => l.remove());
    };
  }, [seccion]);

  async function cargarSeccion(s: typeof seccion) {
    setCargando(true);

    if (s === 'mios') {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setArchivos([]);
        setCargando(false);
        return;
      }

      const { data } = await supabase.storage.from('archivos-usuario').list(user.id, {
        sortBy: { column: 'created_at', order: 'desc' }
      });

      const propios: ArchivoHub[] = (data ?? [])
        .filter(f => f.id) // descarta subcarpetas, si las hubiera
        .map(f => ({
          plataforma: 'supabase',
          nombre: nombreLegible(f.name),
          tipo_archivo: f.name.split('.').pop() ?? '',
          storage_path: `${user.id}/${f.name}`,
          modificado: f.updated_at
        }));
      setArchivos(propios);
    }

    if (s === 'drive') {
      const { data: session } = await supabase.auth.getSession();
      const providerToken = (session.session as any)?.provider_token;

      if (!providerToken) {
        setArchivos([]);
        setCargando(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('drive-list', {
        body: { providerToken, seccion: 'compartidos' }
      });
      setArchivos(error || !data?.ok ? [] : data.archivos);
    }

    if (s === 'dropbox') {
      const { data, error } = await supabase.functions.invoke('dropbox-list', { body: {} });
      if (error || !data?.ok) {
        setDropboxConectado(false);
        setArchivos([]);
      } else {
        setDropboxConectado(true);
        setArchivos(data.archivos);
      }
    }

    setCargando(false);
  }

  async function subirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const lista = e.target.files;
    if (!lista || lista.length === 0) return;

    setSubiendo(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      setSubiendo(false);
      return;
    }

    for (const archivo of Array.from(lista)) {
      const ruta = `${user.id}/${Date.now()}_${archivo.name}`;
      const { error: errorSubida } = await supabase.storage
        .from('archivos-usuario')
        .upload(ruta, archivo);

      if (!errorSubida) {
        await supabase.from('archivos_subidos').insert({
          user_id: user.id,
          nombre: archivo.name,
          storage_path: ruta,
          tipo_archivo: archivo.type || archivo.name.split('.').pop(),
          plataforma: 'supabase'
        });
      }
    }

    await cargarSeccion('mios');
    setSubiendo(false);
    if (inputArchivo.current) inputArchivo.current.value = '';
  }

  async function abrirArchivo(a: ArchivoHub) {
    setAbriendo(a.nombre);

    if (a.plataforma === 'supabase' && a.storage_path) {
      const { data, error } = await supabase.storage
        .from('archivos-usuario')
        .createSignedUrl(a.storage_path, 60 * 10);
      if (!error && data?.signedUrl) {
        await Browser.open({ url: data.signedUrl });
      }
    } else if (a.url_externa) {
      await Browser.open({ url: a.url_externa });
    }

    setAbriendo(null);
  }

  async function copiarLink(a: ArchivoHub) {
    const link = a.url_directa ?? a.url_externa;
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopiado(a.nombre);
    setTimeout(() => setCopiado(null), 1500);
  }

  async function eliminarArchivo(a: ArchivoHub) {
    if (a.plataforma !== 'supabase' || !a.storage_path) return;
    if (!window.confirm(`¿Eliminar "${a.nombre}"? No se puede deshacer.`)) return;

    setEliminando(a.storage_path);
    await supabase.storage.from('archivos-usuario').remove([a.storage_path]);
    await supabase.from('archivos_subidos').delete().eq('storage_path', a.storage_path);
    setEliminando(null);
    await cargarSeccion('mios');
  }

  async function conectarGoogleDrive() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/drive.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' },
        redirectTo: 'cl.organizador.academico://login-callback',
        skipBrowserRedirect: true
      }
    });
    if (error) return;
    if (data?.url) await Browser.open({ url: data.url });
  }

  async function conectarDropbox() {
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}&response_type=code&token_access_type=offline&redirect_uri=${encodeURIComponent(
      DROPBOX_REDIRECT_URI
    )}`;
    await Browser.open({ url: authUrl });
    // El deep link cl.organizador.academico://dropbox-callback?code=... debe
    // capturarse en App.tsx (listener de appUrlOpen) y llamar a la función
    // dropbox-oauth-callback con ese "code".
  }

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24">
      <h1 className="font-display text-3xl text-ink mb-4">Hub de archivos</h1>

      <div className="flex gap-2 mb-6">
        {(['mios', 'drive', 'dropbox'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSeccion(s)}
            className={`flex-1 font-mono text-xs uppercase py-2 rounded ${
              seccion === s ? 'bg-ink text-paper' : 'bg-white text-ink/50'
            }`}
          >
            {s === 'mios' ? 'Mis archivos' : s === 'drive' ? 'Drive' : 'Dropbox'}
          </button>
        ))}
      </div>

      {seccion === 'mios' && (
        <>
          <input
            ref={inputArchivo}
            type="file"
            multiple
            onChange={subirArchivo}
            className="hidden"
          />
          <button
            onClick={() => inputArchivo.current?.click()}
            disabled={subiendo}
            className="w-full bg-ink text-paper rounded-lg py-3 font-body mb-4 disabled:opacity-50"
          >
            {subiendo ? 'Subiendo…' : '⬆ Subir archivo'}
          </button>
        </>
      )}

      {seccion === 'drive' && !cargando && archivos.length === 0 && (
        <button onClick={conectarGoogleDrive} className="w-full bg-ink text-paper rounded-lg py-3 font-body mb-4">
          Conectar Google Drive
        </button>
      )}

      {seccion === 'dropbox' && dropboxConectado === false && (
        <button onClick={conectarDropbox} className="w-full bg-ink text-paper rounded-lg py-3 font-body mb-4">
          Conectar Dropbox
        </button>
      )}

      {cargando && <p className="font-body text-ink/50">Cargando…</p>}

      <div className="space-y-2">
        {archivos.map((a, i) => (
          <div
            key={i}
            className="w-full bg-white rounded-lg p-3 flex items-center gap-3 shadow-sm"
          >
            <button
              onClick={() => abrirArchivo(a)}
              disabled={abriendo === a.nombre}
              className="flex-1 min-w-0 flex items-center gap-3 text-left disabled:opacity-50"
            >
            {a.preview ? (
              <img src={a.preview} alt="" className="w-12 h-12 object-cover rounded" />
            ) : (
              <div className="w-12 h-12 rounded bg-paper flex items-center justify-center font-mono text-xs text-ink/40 uppercase">
                {a.tipo_archivo?.slice(0, 3)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[10px] uppercase text-ink/40">
                {abriendo === a.nombre ? 'Abriendo…' : a.plataforma}
              </p>
              <p className="font-body text-ink truncate">{a.nombre}</p>
              {a.compartido_por && (
                <p className="font-body text-xs text-ink/50">Compartido por {a.compartido_por}</p>
              )}
            </div>
            </button>

            {a.plataforma === 'dropbox' && (a.url_directa || a.url_externa) && (
              <button
                onClick={() => copiarLink(a)}
                aria-label="Copiar link"
                className="shrink-0 font-mono text-[10px] uppercase text-teal border border-teal/30 rounded px-2 py-1"
              >
                {copiado === a.nombre ? '✓ Copiado' : 'Copiar link'}
              </button>
            )}

            {a.plataforma === 'supabase' && (
              <button
                onClick={() => eliminarArchivo(a)}
                disabled={eliminando === a.storage_path}
                aria-label="Eliminar"
                className="shrink-0 w-8 h-8 rounded-full text-crimson font-mono disabled:opacity-40"
              >
                {eliminando === a.storage_path ? '…' : '✕'}
              </button>
            )}
          </div>
        ))}
        {!cargando && archivos.length === 0 && seccion === 'mios' && (
          <p className="font-body text-sm text-ink/50">Todavía no has subido archivos.</p>
        )}
      </div>
    </div>
  );
}
