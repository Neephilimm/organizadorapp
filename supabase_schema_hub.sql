-- ============================================================
-- Hub de Archivos - Esquema adicional
-- Ejecutar en: Supabase Dashboard → SQL Editor (después del schema principal)
-- ============================================================

-- Tokens de Dropbox por usuario (Google Drive usa el proveedor OAuth
-- nativo de Supabase Auth, así que no necesita tabla propia).
create table if not exists dropbox_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table dropbox_tokens enable row level security;

create policy "dropbox_tokens_propios" on dropbox_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Nada más se necesita: los archivos "compartidos conmigo" y "recientes"
-- se consultan en vivo a las APIs de Drive/Dropbox, no se duplican aquí.
-- Los archivos que el usuario sube desde la app siguen usando la tabla
-- `archivos_subidos` y el bucket `archivos-usuario` ya creados.
