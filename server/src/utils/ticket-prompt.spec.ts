import { describe, expect, it } from 'vitest';
import { buildInventarioJson, buildTicketPrompt, TICKET_SHAPE } from './ticket-prompt.js';

/**
 * El prompt del ticket (## 12aj) se prueba como el de la foto: sin montar un proveedor. Lo que
 * se fija aqui es que el «inventario.json» viaje entero (tiendas, categorias, productos), que
 * las reglas de dinero y de no-inventar esten escritas, y que el PDF se anuncie como PDF.
 */
describe('buildTicketPrompt (## 12aj)', () => {
  const inventario = {
    tiendas: ['Mercadona', 'Lidl'],
    categorias: [
      { clave: 'dairy', nombre: 'Lácteos' },
      { clave: 'other', nombre: 'Otros' }
    ],
    productos: [{ categoria: 'dairy', nombre: 'Leche entera', unidad: 'unit' }]
  };

  it('el inventario adjunto lleva tiendas, categorias y productos con sus claves', () => {
    const json = buildInventarioJson(inventario);
    const parsed = JSON.parse(json);
    expect(parsed.tiendas).toEqual(['Mercadona', 'Lidl']);
    expect(parsed.categorias).toEqual(inventario.categorias);
    expect(parsed.productos).toEqual(inventario.productos);
    // Y viaja en el prompt, presentado como el adjunto que es.
    const { user } = buildTicketPrompt({ inventarioJson: json, esPdf: false });
    expect(user).toContain('inventario.json');
    expect(user).toContain('"Mercadona"');
    expect(user).toContain('"dairy"');
    expect(user).toContain('"Leche entera"');
  });

  it('las reglas que no se pueden romper: centimos, no inventar, tienda, total', () => {
    const { system } = buildTicketPrompt({
      inventarioJson: buildInventarioJson(inventario),
      esPdf: false
    });
    expect(system).toContain('CENTIMOS ENTEROS');
    expect(system).toContain('NO inventes precios');
    expect(system).toContain('lo PAGADO por esa cantidad');
    expect(system).toContain('`store` es la tienda de la cabecera');
    expect(system).toContain('`totalMinor` es el total final');
    expect(system).toContain('usa su misma categoria');
    expect(system).toContain('createCategory: true');
  });

  it('la forma prometida tiene todo lo que el esquema va a validar', () => {
    expect(TICKET_SHAPE).toContain('"store"');
    expect(TICKET_SHAPE).toContain('"priceMinor"');
    expect(TICKET_SHAPE).toContain('"totalMinor"');
    expect(TICKET_SHAPE).toContain('"warnings"');
    expect(TICKET_SHAPE).toContain('"offer"');
  });

  it('el PDF se anuncia como PDF y la imagen como imagen', () => {
    const pdf = buildTicketPrompt({ inventarioJson: '{}', esPdf: true });
    const imagen = buildTicketPrompt({ inventarioJson: '{}', esPdf: false });
    expect(pdf.user).toContain('como PDF');
    expect(imagen.user).toContain('como imagen');
  });
});
