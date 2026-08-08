import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce'
  }
});

export type Categoria = {
  id: string;
  nombre: string;
  color: string;
  created_at: string;
};

export type TipoEvento =
  | 'evaluacion'
  | 'tarea'
  | 'entrega'
  | 'presentacion'
  | 'feriado'
  | 'sin_clases'
  | 'lectura'
  | 'otro';

export type Evento = {
  id: string;
  categoria_id: string | null;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  tipo: TipoEvento;
  origen: 'manual' | 'imagen';
  recurrente: boolean;
  created_at: string;
};
