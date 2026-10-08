import { describe, expect, it } from 'vitest';
import { deduplicateTicketLines } from './ticket-lines-dedup.js';

describe('deduplicateTicketLines', () => {
  it('quita una línea repetida con variación de mayúsculas/acentos y conserva el dato más completo', () => {
    const unique = deduplicateTicketLines([
      {
        name: 'Yogur natural',
        quantity: 2,
        unit: 'ud',
        priceMinor: null,
        confidence: 0.4,
        category: 'other'
      },
      {
        name: 'YÓGUR natural',
        quantity: 2,
        unit: 'unidades',
        priceMinor: 240,
        confidence: 0.9,
        category: 'dairy'
      }
    ]);

    expect(unique).toHaveLength(1);
    expect(unique[0]).toMatchObject({
      name: 'YÓGUR natural',
      priceMinor: 240,
      confidence: 0.9,
      category: 'dairy'
    });
  });

  it('conserva líneas reales del mismo producto con distinta cantidad, precio u oferta', () => {
    const lines = [
      { name: 'Leche entera', quantity: 1, unit: 'l', priceMinor: 110 },
      { name: 'Leche entera', quantity: 2, unit: 'l', priceMinor: 220 },
      { name: 'Leche entera', quantity: 1, unit: 'l', priceMinor: 125 },
      {
        name: 'Leche entera',
        quantity: 1,
        unit: 'l',
        priceMinor: 110,
        offer: { buy: 3, take: 2 }
      }
    ];

    expect(deduplicateTicketLines(lines)).toEqual(lines);
  });

  it('mantiene la primera posición cuando una repetición aporta un campo que faltaba', () => {
    const unique = deduplicateTicketLines([
      { name: 'Pan integral', quantity: 1, unit: 'ud', priceMinor: 150 },
      { name: 'Pan integral', quantity: 1, unit: 'ud', priceMinor: null, note: 'Sin etiqueta' },
      { name: 'Manzana', quantity: 1, unit: 'kg', priceMinor: 299 }
    ]);

    expect(unique.map(({ name }) => name)).toEqual(['Pan integral', 'Manzana']);
    expect(unique[0]).toMatchObject({ priceMinor: 150, note: 'Sin etiqueta' });
  });
});
