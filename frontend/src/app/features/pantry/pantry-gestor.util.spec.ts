import { pantryCategoryLabel } from '../../core/i18n/labels';
import { pantryEn, pantryEs } from '../../core/i18n/dict/pantry';
import type { PantryCategory } from '../../shared/models/pantry.model';
import { aliasVisibles, clavesNoElegiblesComoPadre, colorDeCategoria, normalizarAlias } from './pantry-gestor.util';

// El `es` del diccionario es la fuente de la verdad para estas pruebas: el semillero del server escribe los
// nombres en castellano, y lo que se comprueba aqui es como se lee ese texto, no como suena en otro idioma.
const castellano = pantryEs as unknown as Record<string, string>;
const ingles = pantryEn as unknown as Record<string, string>;
const t = (clave: string): string => castellano[clave] ?? clave;
const tEn = (clave: string): string => ingles[clave] ?? clave;

const fila = (parciales: Partial<PantryCategory>): PantryCategory => ({
  id: parciales.id ?? 'x',
  key: parciales.key ?? 'x',
  name: parciales.name ?? 'X',
  color: parciales.color ?? '#4CAF50',
  description: null,
  parentKey: parciales.parentKey ?? null,
  parentName: parciales.parentName ?? null,
  position: 0,
  counts: parciales.counts ?? { products: 0, children: 0, descendantProducts: 0 },
  protected: parciales.protected ?? false,
  canDelete: parciales.canDelete ?? true
});

describe('clavesNoElegiblesComoPadre (## 12x)', () => {
  const catalogo = [
    fila({ id: '1', key: 'alimentacion' }),
    fila({ id: '2', key: 'bebidas', parentKey: 'alimentacion' }),
    fila({ id: '3', key: 'de avena', parentKey: 'bebidas' }),
    fila({ id: '4', key: 'limpieza' })
  ];

  it('al crear no hay nada prohibido: la categoria todavia no tiene a nadie por debajo', () => {
    expect([...clavesNoElegiblesComoPadre(catalogo, null)]).toEqual([]);
  });

  it('la propia fila y lo que cuelga de ella, a cualquier profundidad —lo que tiene encima, no', () => {
    // Un antepasado SI se puede elegir como padre: subir un nivel es exactamente lo que alguien quiere decir
    // cuando abre este picker. Lo que cierra el arbol es elegir a un descendiente, y eso es lo que desaparece.
    const prohibidas = clavesNoElegiblesComoPadre(catalogo, '2');
    expect([...prohibidas].sort()).toEqual(['bebidas', 'de avena'].sort());
    expect(prohibidas.has('alimentacion')).toBe(false);
    expect(prohibidas.has('limpieza')).toBe(false);
  });

  it('una hoja solo se excluye a si misma: la unica colocacion que no puede hacer es debajo de si misma', () => {
    expect([...clavesNoElegiblesComoPadre(catalogo, '3')]).toEqual(['de avena']);
  });

  it('un id que ya no esta en el catalogo no convierte la lista entera en prohibida', () => {
    expect([...clavesNoElegiblesComoPadre(catalogo, 'no-existe')]).toEqual([]);
  });
});

describe('colorDeCategoria', () => {
  it('lo que no es un color del todo se pinta con el gris de la reserva, no se queda en blanco', () => {
    expect(colorDeCategoria({ color: '#4caf50' } as PantryCategory)).toBe('#4CAF50');
    expect(colorDeCategoria({ color: 'rojo' } as PantryCategory)).toBe('#8A8F98');
    expect(colorDeCategoria({ color: '' } as PantryCategory)).toBe('#8A8F98');
    expect(colorDeCategoria(null)).toBe('#8A8F98');
  });
});

describe('normalizarAlias', () => {
  it('el nombre del producto no es un alias de si mismo', () => {
    expect(normalizarAlias('Leche', 'Leche', [])).toEqual({ error: 'es-el-nombre' });
    expect(normalizarAlias('  leche ', 'Leche', [])).toEqual({ error: 'es-el-nombre' });
  });

  it('repetido es repetido sin importar las mayusculas, y los espacios se colapsan', () => {
    expect(normalizarAlias('del  dia', 'Leche', ['Del dia'])).toEqual({ error: 'repetido' });
    expect(normalizarAlias('Leche   del   dia', 'Leche', [])).toEqual({ valor: 'Leche del dia' });
  });

  it('veinte es el techo, y vacio no entra', () => {
    expect(normalizarAlias('   ', 'Leche', [])).toEqual({ error: 'vacio' });
    expect(normalizarAlias('otra', 'Leche', Array.from({ length: 20 }, (_, i) => `a-${i}`))).toBeNull();
  });
});

describe('aliasVisibles', () => {
  it('la fila no baile: tres y un «+n» con el resto', () => {
    expect(aliasVisibles(['a', 'b'])).toEqual({ visibles: ['a', 'b'], ocultos: 0 });
    expect(aliasVisibles(['a', 'b', 'c', 'd', 'e'])).toEqual({ visibles: ['a', 'b', 'c'], ocultos: 2 });
  });
});

describe('la etiqueta de una categoria (## 12x)', () => {
  it('de fabrica, en el idioma activo', () => {
    expect(pantryCategoryLabel({ key: 'vegetables', name: 'Verduras' }, t)).toBe('Verduras');
    expect(pantryCategoryLabel({ key: 'vegetables', name: 'Verduras' }, tEn)).toBe('Vegetables');
  });

  it('en cuanto la casa le cambia el nombre, gana lo que ella escribio: el diccionario no corrige datos', () => {
    expect(pantryCategoryLabel({ key: 'vegetables', name: 'Verduras de la huerta' }, tEn)).toBe('Verduras de la huerta');
  });

  it('una categoria creada por la casa se pinta cruda en los dos idiomas', () => {
    expect(pantryCategoryLabel({ key: 'frutos secos', name: 'Frutos secos' }, tEn)).toBe('Frutos secos');
  });

  it('una clave sin fila (la borraron y el articulo se quedo) se pinta como lo que es: una clave', () => {
    expect(pantryCategoryLabel('despensa-vieja', t)).toBe('despensa-vieja');
    expect(pantryCategoryLabel({ key: 'despensa-vieja' }, t)).toBe('despensa-vieja');
  });
});
