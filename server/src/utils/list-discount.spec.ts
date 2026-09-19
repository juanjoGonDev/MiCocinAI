import { describe, expect, it } from 'vitest';
import type { Offer } from './list-discount.js';
import { basketMoney, describeDiscount, normalizeOffer, paidUnits, shareDiscount } from './list-discount.js';

/**
 * El unico modulo del proyecto donde se puede perder un centavo. Las tablas de aqui
 * son las que sostienen los numeros que alguien va a contrastar con un ticket, asi
 * que cada caso escribe tambien POR QUE existe (que es lo que falta cuando alguien
 * «simplifica» la formula dentro de seis meses).
 */

describe('paidUnits', () => {
  it('sin oferta se paga lo que se lleva', () => {
    expect(paidUnits(3, null)).toBe(3);
    expect(paidUnits(3, undefined)).toBe(3);
  });

  it('3×2: cada tres, se pagan dos', () => {
    expect(paidUnits(6, { buy: 3, take: 2 })).toBe(4);
    // La cola que no llena un pack se paga suelta, pero nunca mas de lo que cuesta
    // dentro de un pack: dos sueltas de un 3×2 valen dos, no tres.
    expect(paidUnits(5, { buy: 3, take: 2 })).toBe(4);
    expect(paidUnits(8, { buy: 3, take: 2 })).toBe(6);
    expect(paidUnits(2, { buy: 3, take: 2 })).toBe(2);
    expect(paidUnits(1, { buy: 3, take: 2 })).toBe(1);
  });

  it('2×1: la mitad, redondeando hacia arriba', () => {
    expect(paidUnits(4, { buy: 2, take: 1 })).toBe(2);
    expect(paidUnits(5, { buy: 2, take: 1 })).toBe(3);
    expect(paidUnits(1, { buy: 2, take: 1 })).toBe(1);
  });

  it('funciona con cantidades fraccionales (el kilo no es entero)', () => {
    // Un 3×2 sobre 1,5 kg: no hay pack completo, se paga lo que hay. Nadie deberia
    // poner una oferta por peso, pero el numero no puede salir negativo ni raro.
    expect(paidUnits(1.5, { buy: 3, take: 2 })).toBe(1.5);
    expect(paidUnits(4.5, { buy: 3, take: 2 })).toBe(3.5);
  });

  it('una oferta que no ahorra nada no es una oferta', () => {
    expect(paidUnits(4, { buy: 4, take: 4 })).toBe(4);
    expect(paidUnits(4, { buy: 2, take: 0 })).toBe(4);
    expect(paidUnits(0, { buy: 3, take: 2 })).toBe(0);
  });
});

describe('normalizeOffer', () => {
  it('lo que no ahorra se convierte en «sin oferta»', () => {
    expect(normalizeOffer({ buy: 3, take: 3 })).toBeNull();
    expect(normalizeOffer({ buy: 1, take: 1 })).toBeNull();
    expect(normalizeOffer(null)).toBeNull();
    expect(normalizeOffer({ buy: 3, take: 2 })).toEqual({ buy: 3, take: 2 });
  });

  it('redondea hacia abajo: 2,7 unidades de un pack no existen', () => {
    expect(normalizeOffer({ buy: 3.9, take: 2.9 })).toEqual({ buy: 3, take: 2 });
  });
});

describe('basketMoney', () => {
  const line = (itemId: string, quantity: number, unitMinor: number | null, offer: Offer | null = null) => ({
    itemId,
    quantity,
    unitMinor,
    offer
  });

  it('sin oferta ni descuento es lo de siempre: precio por unidad por cantidad', () => {
    const money = basketMoney({ lines: [line('a', 3, 100), line('b', 1, 250)] });
    expect(money.subtotalMinor).toBe(550);
    expect(money.totalMinor).toBe(550);
    expect(money.discount).toBeNull();
    expect(money.discountMinor).toBe(0);
  });

  it('la oferta baja lo que se paga ANTES de sumar', () => {
    const money = basketMoney({ lines: [line('a', 6, 100, { buy: 3, take: 2 })] });
    expect(money.lines[0]).toMatchObject({ grossMinor: 400, offerSavingsMinor: 200, paidUnits: 4 });
    expect(money.subtotalMinor).toBe(400);
    expect(money.offerSavingsMinor).toBe(200);
  });

  it('un porcentaje en puntos porcentuales no comete errores de float', () => {
    // 12,5 % de 800 son 100 exactos; con floats «0.125 * 800» tambien, pero
    // 12,34 % de 12 345 no, y esa es la forma en la que se rompe una cesta.
    const money = basketMoney({
      lines: [line('a', 8, 100)],
      discount: { kind: 'percent', percentBps: 1250, valueMinor: null, scope: 'all', firstUnits: null }
    });
    expect(money.subtotalMinor).toBe(800);
    expect(money.discountMinor).toBe(100);
    expect(money.totalMinor).toBe(700);
  });

  it('un importe se aplica y no deja el total en negativo', () => {
    const money = basketMoney({
      lines: [line('a', 3, 100)],
      discount: { kind: 'amount', valueMinor: 200, percentBps: null, scope: 'all', firstUnits: null }
    });
    expect(money.totalMinor).toBe(100);

    const over = basketMoney({
      lines: [line('a', 3, 100)],
      discount: { kind: 'amount', valueMinor: 10_000, percentBps: null, scope: 'all', firstUnits: null }
    });
    expect(over.discountMinor).toBe(300);
    expect(over.totalMinor).toBe(0);
    // Y se dice, en vez de pintar «-97,00 €» o de callar el recorte.
    expect(over.discount?.reason).toBe('clampedToZero');
  });

  it('«descuento en las primeras N unidades» solo recorta el porcentaje de esas N', () => {
    const money = basketMoney({
      lines: [line('a', 5, 100)],
      discount: {
        kind: 'percent',
        percentBps: 1000,
        valueMinor: null,
        scope: 'firstUnits',
        firstUnits: 2
      }
    });
    // 10 % de los 200 centimos de las dos primeras unidades, no de los 500.
    expect(money.discount?.applicableMinor).toBe(200);
    expect(money.discountMinor).toBe(20);
  });

  it('un importe minimo por unidades no alcanzado no descuenta, y lo explica', () => {
    const money = basketMoney({
      lines: [line('a', 2, 100)],
      discount: { kind: 'amount', valueMinor: 200, percentBps: null, scope: 'firstUnits', firstUnits: 3 }
    });
    expect(money.discountMinor).toBe(0);
    expect(money.totalMinor).toBe(200);
    expect(money.discount?.reason).toBe('thresholdNotReached');
  });

  it('la linea sin precio cuenta como unidad pero no como importe', () => {
    const money = basketMoney({
      lines: [line('a', 3, 100), line('b', 2, null)],
      discount: { kind: 'percent', percentBps: 5000, valueMinor: null, scope: 'firstUnits', firstUnits: 4 }
    });
    // Las 2 unidades sin precio no aportan importe y tampoco comen tope: «el 50 % de
    // las 4 primeras unidades» sobre 3 con precio sale de 300, no de repartir el
    // descuento por cartones que nadie ha valorado.
    expect(money.discount?.applicableUnits).toBe(3);
    expect(money.discount?.applicableMinor).toBe(300);
    expect(money.discountMinor).toBe(150);
  });

  it('una cesta vacia no divide por cero', () => {
    const money = basketMoney({
      lines: [],
      discount: { kind: 'percent', percentBps: 1000, valueMinor: null, scope: 'all', firstUnits: null }
    });
    expect(money.totalMinor).toBe(0);
    expect(money.discount?.reason).toBe('emptyBasket');
  });
});

describe('shareDiscount', () => {
  it('los trozos suman EXACTAMENTE el descuento, ni un centimo suelto', () => {
    const lines = [
      { itemId: 'a', netMinor: 100 },
      { itemId: 'b', netMinor: 100 },
      { itemId: 'c', netMinor: 100 }
    ];
    const shares = shareDiscount(lines, 100);
    const sum = [...shares.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
    expect([...shares.values()].sort()).toEqual([33, 33, 34]);
  });

  it('una cesta sin importe reparte ceros', () => {
    const shares = shareDiscount([{ itemId: 'a', netMinor: 0 }], 100);
    expect(shares.get('a')).toBe(0);
  });
});

describe('describeDiscount', () => {
  it('un porcentaje se lee como se escribe en el cartel', () => {
    expect(
      describeDiscount({ kind: 'percent', percentBps: 1250, valueMinor: null, scope: 'all', firstUnits: null })
    ).toBe('12,5 %');
  });

  it('un importe lleva sus decimales y la capa de unidades si la hay', () => {
    expect(
      describeDiscount({ kind: 'amount', valueMinor: 200, percentBps: null, scope: 'firstUnits', firstUnits: 3 })
    ).toBe('2,00 € en 3 unidades');
  });

  it('la etiqueta que puso la persona va delante', () => {
    expect(
      describeDiscount({
        kind: 'amount',
        valueMinor: 300,
        percentBps: null,
        scope: 'all',
        firstUnits: null,
        label: 'Fidelidad'
      })
    ).toBe('Fidelidad · 3,00 €');
  });

  it('sin descuento, nada que decir', () => {
    expect(describeDiscount(null)).toBeNull();
  });
});
