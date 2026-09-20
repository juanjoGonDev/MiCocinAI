import {
  formatMoney,
  productKeyOf,
  formatQuantity,
  groupItemsByCategory,
  parseMoneyToMinor,
  ShoppingListItem
} from './shopping.model';

/**
 * Las dos unicas funciones de dinero de la pantalla. Se prueban aqui y no en el
 * backend porque el backend solo sabe sumar centimts: quien traduce lo que teclea
 * una persona con coma decimal es la app, y ahi es donde se pierden los centimos.
 */
describe('shopping.model — dinero', () => {
  it('lee la coma como separador decimal, como un teclado español', () => {
    expect(parseMoneyToMinor('12,40')).toBe(1240);
    expect(parseMoneyToMinor('1,20')).toBe(120);
    expect(parseMoneyToMinor('0,01')).toBe(1);
  });

  it('respeta el punto de miles cuando la cantidad viene larga', () => {
    expect(parseMoneyToMinor('1.290')).toBe(129000);
    expect(parseMoneyToMinor('1.290,50')).toBe(129050);
  });

  it('un punto suelto con uno o dos decimales es decimal, no miles', () => {
    expect(parseMoneyToMinor('1.5')).toBe(150);
    expect(parseMoneyToMinor('1.20')).toBe(120);
    expect(parseMoneyToMinor('.5')).toBe(50);
  });

  it('acepta basura de portapapeles: moneda, espacios y prefijos', () => {
    expect(parseMoneyToMinor('1 234,50 €')).toBe(123450);
    expect(parseMoneyToMinor('2')).toBe(200);
    expect(parseMoneyToMinor('0')).toBe(0);
  });

  it('redondea el tercer decimal en lugar de perderlo', () => {
    expect(parseMoneyToMinor('3,999')).toBe(400);
    expect(parseMoneyToMinor('1,290')).toBe(129);
  });

  it('devuelve null en vez de adivinar: ni texto, ni negativos, ni importes de dedo resbalado', () => {
    expect(parseMoneyToMinor('')).toBeNull();
    expect(parseMoneyToMinor(null)).toBeNull();
    expect(parseMoneyToMinor('abc')).toBeNull();
    expect(parseMoneyToMinor('-3')).toBeNull();
    expect(parseMoneyToMinor('1,2,3')).toBeNull();
    expect(parseMoneyToMinor('1000000')).toBeNull();
  });

  it('pinta la raya donde no hay dato, y el cero donde si lo hay', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
    expect(formatMoney(0)).toBe('0,00 €');
    expect(formatMoney(85)).toBe('0,85 €');
    expect(formatMoney(129050)).toBe('1290,50 €');
  });
});

describe('shopping.model — cantidades y secciones', () => {
  it('una unidad suelta no se pinta: el 1 de «1 Leche» es ruido', () => {
    expect(formatQuantity(1, null)).toBe('');
    expect(formatQuantity(2, null)).toBe('2×');
    expect(formatQuantity(2, 'kg')).toBe('2 kg');
    expect(formatQuantity(0.5, 'kg')).toBe('0,5 kg');
  });

  function item(name: string, category: string | null, position = 0): ShoppingListItem {
    return { id: name, name, category, position } as ShoppingListItem;
  }

  it('agrupa por seccion de tienda y manda lo suelto al final', () => {
    const groups = groupItemsByCategory([
      item('Leche', 'Lacteos'),
      item('Tomate', 'Frutas y verduras'),
      item('Velas', null),
      item('Pan', 'Panaderia')
    ]);

    expect(groups.map(group => group.category)).toEqual([
      'Frutas y verduras',
      'Panaderia',
      'Lacteos',
      'Otros'
    ]);
  });

  it('una seccion inventada se queda con las demas, no se pierde', () => {
    const groups = groupItemsByCategory([item('X', 'Charcuteria'), item('Y', 'Otros')]);

    expect(groups.map(group => group.category)).toEqual(['Charcuteria', 'Otros']);
  });

  it('no crea grupo fantasma cuando la lista esta vacia', () => {
    expect(groupItemsByCategory([])).toEqual([]);
  });
});

describe('productKeyOf (la clave con la que se enlaza un producto)', () => {
  it('quita acentos y mayusculas, que es lo que hace que «Jamón» sea «jamon»', () => {
    expect(productKeyOf('Jamón Serrano')).toBe('jamon serrano');
    expect(productKeyOf('  JAMON  SERRANO ')).toBe('jamon serrano');
  });

  it('los simbolos se convierten en espacios, no en basura: «1/2 pieza» sigue siendo legible', () => {
    expect(productKeyOf('Leche 1L')).toBe('leche 1l');
    expect(productKeyOf('Pan de molde (grande)')).toBe('pan de molde grande');
  });

  it('lo vacio es clave vacia: «sin enlace» tiene que ser distinguishle de «el nombre raro»', () => {
    expect(productKeyOf('')).toBe('');
    expect(productKeyOf(null)).toBe('');
    expect(productKeyOf(undefined)).toBe('');
  });

  it('dos nombres que son el mismo producto dan la misma clave, y «pan» y «pan de molde» no', () => {
    expect(productKeyOf('Jamón')).not.toBe(productKeyOf('Jamón Serrano'));
    expect(productKeyOf('Leche semidesnatada')).toBe(productKeyOf('leche  semidesnatada'));
  });
});
