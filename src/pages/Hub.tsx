import { useEffect, useRef, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { supabase } from '../lib/supabase';

type ArchivoHub = {
  plataforma: 'supabase' | 'drive' | 'dropbox';
  nombre: string;
  tipo_archivo: string;
  preview?: string | null;
  url_externa?: string | null;
  modificado?: string;
  compartido_por?: string | null;
};

const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY as string;
const DROPBOX_REDIRECT_URI = 'cl.organizador.academico://dropbox-callback';

export default function Hub() {
  const [seccion, setSeccion] = useState<'mios' | 'drive' | 'dropbox'>('mios');
  const [archivos, setArchivos] = useState<ArchivoHub[]>([]);
  const [cargando, setCargando] = useState(true);
  const [dropboxConectado, setDropboxConectado] = useState<boolean | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    cargarSeccion(seccion);
  }, [seccion]);

  async function cargarSeccion(s: typeof seccion) {
    setCargando(true);

    if (s === 'mios') {
      const { data } = await supabase.storage.from('archivos-usuario').list();
      const propios: ArchivoHub[] = (data ?? []).map(f => ({
        plataforma: 'supabase',
        nombre: f.name,
        tipo_archivo: f.name.split('.').pop() ?? '',
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
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setSubiendo(true);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      setSubiendo(false);
      return;
    }

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
      cargarSeccion('mios');
    }

    setSubiendo(false);
    if (inputArchivo.current) inputArchivo.current.value = '';
  }

  async function conectarGoogleDrive() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/drive.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });
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
          <div key={i} className="bg-white rounded-lg p-3 flex items-center gap-3 shadow-sm">
            {a.preview ? (
              <img src={a.preview} alt="" className="w-12 h-12 object-cover rounded" />
            ) : (
              <div className="w-12 h-12 rounded bg-paper flex items-center justify-center font-mono text-xs text-ink/40 uppercase">
                {a.tipo_archivo?.slice(0, 3)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[10px] uppercase text-ink/40">{a.plataforma}</p>
              <p className="font-body text-ink truncate">{a.nombre}</p>
              {a.compartido_por && (
                <p className="font-body text-xs text-ink/50">Compartido por {a.compartido_por}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
