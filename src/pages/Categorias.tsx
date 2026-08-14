import { useEffect, useState } from 'react';
import { supabase, Categoria } from '../lib/supabase';

const COLORES_SUGERIDOS = ['#3E7C7C', '#C1272D', '#D6A419', '#5B6EE1', '#8A5CF6', '#1B2430'];

export default function Categorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState(COLORES_SUGERIDOS[0]);

  useEffect(() => {
    cargar();
  }, []);

  async function cargar() {
    const { data } = await supabase.from('categorias').select('*').order('created_at');
    setCategorias(data ?? []);
  }

  async function crearCategoria(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('categorias').insert({ nombre: nombre.trim(), color, user_id: user.id });
    setNombre('');
    cargar();
  }

  async function eliminarCategoria(id: string) {
    await supabase.from('categorias').delete().eq('id', id);
    cargar();
  }

  return (
    <div className="min-h-screen bg-paper px-6 pt-8 pb-24">
      <h1 className="font-display text-3xl text-ink mb-1">Tus categorías</h1>
      <p className="font-body text-sm text-ink/50 mb-6">
        Agrupa tus fechas por ramo o tema, con un color propio, para distinguirlas de un vistazo en
        el Dashboard.
      </p>

      <form onSubmit={crearCategoria} className="bg-white rounded-lg p-4 shadow-sm mb-6">
        <label className="font-mono text-xs uppercase tracking-wide text-ink/50 block mb-2">
          Nueva categoría
        </label>
        <input
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          placeholder="Ej: Prueba de actualidad"
          className="w-full font-body border border-ink/10 rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-teal"
        />
        <div className="flex gap-2 mb-3">
          {COLORES_SUGERIDOS.map(c => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full ${color === c ? 'ring-2 ring-offset-2 ring-ink' : ''}`}
              style={{ backgroundColor: c }}
              aria-label={`Elegir color ${c}`}
            />
          ))}
        </div>
        <button
          type="submit"
          className="font-body bg-ink text-paper rounded px-4 py-2 text-sm font-medium"
        >
          Crear categoría
        </button>
      </form>

      {categorias.length > 0 && (
        <p className="font-mono text-xs uppercase tracking-widest text-ink/40 mb-2">
          Existentes ({categorias.length})
        </p>
      )}
      <div className="space-y-2">
        {categorias.length === 0 && (
          <p className="font-body text-sm text-ink/40">Todavía no has creado ninguna.</p>
        )}
        {categorias.map(cat => (
          <div key={cat.id} className="bg-white rounded-lg p-3 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
              <span className="font-body text-ink">{cat.nombre}</span>
            </div>
            <button
              onClick={() => eliminarCategoria(cat.id)}
              className="font-mono text-xs text-ink/40 hover:text-crimson"
            >
              eliminar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
