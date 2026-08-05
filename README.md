# Organizador Académico

## 1. Crear el proyecto en Supabase
1. Ve a https://supabase.com → crea un proyecto nuevo.
2. En **SQL Editor**, pega y ejecuta el contenido de `supabase_schema.sql`.
3. En **Settings → API**, copia `Project URL` y `anon public key`.
4. En **Authentication**, habilita el método de acceso que prefieras (recomendado: email + contraseña, o Google).

## 2. Subir este proyecto a GitHub
1. Crea un repositorio nuevo (puede ser privado).
2. Sube todos estos archivos.
3. En el repo: **Settings → Secrets and variables → Actions → New repository secret**, agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## 3. Activar la lectura de imágenes (Groq)
1. Instala la CLI de Supabase (`npm install -g supabase`) y haz login.
2. Desde la carpeta del proyecto: `supabase functions deploy leer-imagen`.
3. Configura tu clave de Groq como secreto (nunca queda en el código del APK):
   `supabase secrets set GROQ_API_KEY=tu_key_de_groq`
4. Nota: se usa el modelo `qwen/qwen3.6-27b`, el modelo de visión vigente en Groq
   (el `llama-3.3-70b-versatile` que mencionaste fue descontinuado en junio de 2026
   y de todas formas no tenía capacidad de leer imágenes).

## 4. Compilar el APK
1. Ve a la pestaña **Actions** de tu repositorio.
2. Selecciona el workflow **Compilar APK** → **Run workflow**.
3. Espera ~5 minutos. Al terminar, descarga el archivo `organizador-academico-apk` desde la sección de artefactos — ahí está tu `.apk` listo para instalar en tu teléfono (activa "orígenes desconocidos" en Android para instalarlo).

## 5. Activar TDI Noticias y el acortador dentro de la app
1. Despliega las dos funciones restantes:
   `supabase functions deploy obtener-noticias`
   `supabase functions deploy acortar-link`
2. Configura sus secretos con las URLs de tus Apps Script ya desplegados:
   `supabase secrets set TDI_NOTICIAS_URL=https://script.google.com/macros/s/AKfycbyi_pSXst1Mj8R9qE6d6yZ036UluX-2IMVreqgh9_cIRnqzLhpvHS-UJd_cyL64V_rw/exec`
   `supabase secrets set QR_APP_URL=https://script.google.com/macros/s/AKfycbws6JaMTMs40ivtq_8XZTr-2He13g4fbpZA2oOfcKXjMch85vADxAp0_-_3BUf_7d6AUQ/exec`
3. Recuerda haber agregado a esos dos Apps Script el código de `TDI_JSON_API.gs` y `QR_JSON_API.gs` (te los pasé antes) y volver a implementarlos.

## 6. Activar el Hub de archivos (Drive + Dropbox)

**Google Drive** — usa el login de Google que ya configuraste en Supabase Auth:
1. En Supabase → **Authentication → Providers → Google**, confirma que esté activo.
2. En Google Cloud Console, en las credenciales OAuth de esa app, agrega el scope
   `https://www.googleapis.com/auth/drive.readonly`.
3. Ejecuta `supabase_schema_hub.sql` en el SQL Editor.
4. Despliega: `supabase functions deploy drive-list`.
5. Dentro de la app, en **Archivos → Drive**, toca "Conectar Google Drive" (pide permiso una sola vez).

**Dropbox** — requiere una app OAuth propia:
1. Crea una app en https://www.dropbox.com/developers/apps (tipo "Scoped access", permisos `files.metadata.read` y `files.content.read`).
2. Agrega como Redirect URI: `cl.organizador.academico://dropbox-callback`.
3. Configura los secretos:
   `supabase secrets set DROPBOX_APP_KEY=...`
   `supabase secrets set DROPBOX_APP_SECRET=...`
   `supabase secrets set DROPBOX_REDIRECT_URI=cl.organizador.academico://dropbox-callback`
4. Agrega `VITE_DROPBOX_APP_KEY` como variable de entorno del build (mismo valor que `DROPBOX_APP_KEY`, este sí es público).
5. Despliega: `supabase functions deploy dropbox-oauth-callback` y `supabase functions deploy dropbox-list`.
6. Dentro de la app, en **Archivos → Dropbox**, toca "Conectar Dropbox".

## Qué incluye esta fase
- Todo lo anterior, más:
- Subir archivos propios desde el Hub (botón "Subir archivo" en Mis archivos)
- **Conversor de audio/video**: convierte o extrae audio (MP3, WAV, M4A) o cambia el formato
  de video (MP4, WEBM) — todo se procesa dentro del dispositivo con ffmpeg.wasm, ningún archivo
  se sube a un servidor
- **Conversor de imagen a SVG**: vectoriza una imagen y permite descargar el resultado

Nota sobre RAW: no se incluyó conversión "a RAW" porque ese formato guarda los datos crudos
del sensor de una cámara en el momento de la captura — no es un destino válido para una imagen
ya procesada (JPG/PNG). Si necesitas una copia sin pérdida, exporta a PNG.

## Ya está completa la primera versión funcional
Quedan pendientes solo mejoras: edición/eliminación de eventos existentes, subir archivos
directamente vinculados a un evento específico, y pulir la vista previa de Dropbox (actualmente
solo lista nombres, sin miniatura).
