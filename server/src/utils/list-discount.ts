/**
 * Dinero de la cesta con ofertas y descuentos (HOGARIA-SPEC §8f).
 *
 * Funciones puras a proposito: es el unico sitio del proyecto donde se puede perder
 * un centavo, y eso solo se puede afirmar con tablas de verdad en un spec. Todo
 * entra y sale en centimos enteros; la unica multiplicacion con decimales es
 * `unitMinor * unidades`, y se redondea una vez por linea.
 *
 * Las dos cosas que se parecen y no lo son:
 * - La OFERTA (3×2, 2×1) es de la LINEA y cambia CUANTAS unidades se pagan.
 * - El DESCUENTO es de la LISTA y cambia CUANTO se paga del subtotal.
 * Mezclarlos en un solo campo es lo que hace que una cesta de ticket no cuadre
 * nunca: la oferta se aplica antes de sumar, el descuento despues.
 */

export type Offer = { buy: number; take: number };

/** Unidades que se pagan de una linea con oferta. Sin oferta, todas. */
export function paidUnits(quantity: number, offer: Offer | null | undefined): number {
  const units = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  if (!offer || !Number.isFinite(offer.buy) || !Number.isFinite(offer.take)) return units;
  if (offer.buy < 1 || offer.take < 1 || offer.take >= offer.buy) return units;

  const packs = Math.floor(units / offer.buy);
  const leftover = units - packs * offer.buy;
  return packs * offer.take + Math.min(leftover, offer.take);
}

/**
 * Lo que entra como oferta y no lo es (pagar todo, o medio paquete) se convierte en
 * «sin oferta» en un unico sitio: si la norma viviera en cada ruta, la siguiente que
 * se escriba la olvidaria y guardaria un 3×3 que no baja nada.
 */
export function normalizeOffer(offer: { buy: number; take: number } | null | undefined): Offer | null {
  if (!offer) return null;
  const buy = Math.floor(Number(offer.buy));
  const take = Math.floor(Number(offer.take));
  if (!Number.isFinite(buy) || !Number.isFinite(take) || buy < 2 || take < 1 || take >= buy) return null;
  return { buy, take };
}

export function offerOf(row: { promo_buy?: number | null; promo_take?: number | null } | null | undefined): Offer | null {
  const buy = row?.promo_buy;
  const take = row?.promo_take;
  if (typeof buy !== 'number' || typeof take !== 'number') return null;
  if (buy < 1 || take < 1 || take >= buy) return null;
  return { buy, take };
}

export type DiscountKind = 'amount' | 'percent';
export type DiscountScope = 'all' | 'firstUnits' | 'product' | 'category';

export type Discount = {
  kind: DiscountKind;
  /** Centimos, cuando `kind === 'amount'`. */
  valueMinor: number | null;
  /** Puntos porcentuales: 12,5 % son 1250. Un float de porcentaje no entra. */
  percentBps: number | null;
  scope: DiscountScope;
  /** Unidades pagadas a las que se le aplica (solo con `scope: 'firstUnits'`). */
  firstUnits: number | null;
  /**
   * Que linea entra en el descuento con `scope: 'product'` (clave de producto) o
   * `'category'` (nombre de la seccion). Con los demas alcances es `null`.
   *
   * Existe porque en la nevera real el cartel no dice «-2 € en la cesta»: dice «2 € de
   * descuento en jamon», y sin esta columna la unica forma de anotarlo era mentir con el
   * importe de todo el carro. Opcional porque los alcances viejos nunca lo tuvieron.
   */
  target?: string | null;
  label?: string | null;
};

/** Clave de comparacion de producto: la misma normalizacion que guarda las lineas. */
function keyOf(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Si la linea entra en el descuento. Con `product` se compara por CLAVE, no por texto:
 * «Jamón Serrano» y «jamon serrano » son el mismo producto, y un descuento que depende
 * de un acento no es un descuento, es una sorpresa.
 */
export function isEligibleForDiscount(
  line: { productKey?: string | null; category?: string | null; name?: string | null },
  discount: Discount | null | undefined
): boolean {
  if (!discount || discount.scope === 'all' || discount.scope === 'firstUnits') return true;
  const wanted = keyOf(discount.target);
  if (!wanted) return false;
  if (discount.scope === 'category') return keyOf(line.category) === wanted;
  return keyOf(line.productKey ?? line.name) === wanted;
}

export type MoneyLine = {
  itemId: string;
  quantity: number;
  unitMinor: number | null;
  offer: Offer | null;
  /** Para los descuentos por producto o seccion (`scope: 'product' | 'category'`). */
  productKey?: string | null;
  category?: string | null;
};

export type LineMoney = {
  itemId: string;
  units: number;
  paidUnits: number;
  grossMinor: number;
  netMinor: number;
  offerSavingsMinor: number;
  /** Solo para el desglose: a cuanto asciende la parte no pagada. */
  unitMinor: number | null;
  /** Si a esta linea le toca el descuento de la lista. */
  discounted: boolean;
};

export type BasketMoney = {
  lines: LineMoney[];
  subtotalMinor: number;
  offerSavingsMinor: number;
  discountMinor: number;
  totalMinor: number;
  /** Que paso con el descuento, para poder decirlo en la pantalla en vez de callarlo. */
  discount: {
    applied: boolean;
    reason:
      | 'applied'
      | 'thresholdNotReached'
      | 'noValue'
      | 'emptyBasket'
      | 'clampedToZero'
      | 'noMatchingLine';
    /** Importe sobre el que se calculo (las primeras N unidades, si aplica). */
    applicableMinor: number;
    applicableUnits: number;
  } | null;
};

const HALF_UP = (value: number): number => Math.max(0, Math.round(value));

/**
 * Cuanto vale la primera fraccion de la cesta. `upTo` en unidades pagadas; `null`
 * = todo. Se recorre en el orden que llega (el de la lista), que es lo que hace una
 * caja: el descuento come por delante, no por lo mas caro.
 */
function sliceValue(lines: LineMoney[], upTo: number | null): { minor: number; units: number } {
  // Una linea SIN precio no consume tope de unidades: el tope limita el dinero al que
  // se aplica el descuento, no los cartones que hay en el carro.
  if (upTo == null || !Number.isFinite(upTo)) {
    return {
      minor: lines.reduce((sum, line) => sum + line.netMinor, 0),
      units: lines.reduce((sum, line) => sum + line.paidUnits, 0)
    };
  }
  let remaining = Math.max(0, upTo);
  let minor = 0;
  let units = 0;
  for (const line of lines) {
    if (remaining <= 0 || line.unitMinor == null) continue;
    const taken = Math.min(remaining, line.paidUnits);
    if (taken <= 0) continue;
    minor += HALF_UP(line.unitMinor * taken);
    units += taken;
    remaining -= taken;
  }
  return { minor, units };
}

/**
 * El dinero de la cesta entera. `unitMinor` es el precio POR UNIDAD ya resuelto
 * (manual u observado); una linea sin precio entra en el conteo de unidades pero
 * no aporta importe — es «sin dato», no «gratis».
 */
export function basketMoney(input: { lines: MoneyLine[]; discount?: Discount | null }): BasketMoney {
  const earlyDiscount = input.discount ?? null;
  const lines: LineMoney[] = input.lines.map((line) => {
    const units = Number.isFinite(line.quantity) && line.quantity > 0 ? line.quantity : 0;
    const payable = paidUnits(units, line.offer);
    const unit = line.unitMinor;
    // La oferta se aplica ANTES de sumar: se paga menos, no mas barato por unidad.
    const grossMinor = unit == null ? 0 : HALF_UP(unit * payable);
    const fullMinor = unit == null ? 0 : HALF_UP(unit * units);
    return {
      itemId: line.itemId,
      units,
      paidUnits: payable,
      unitMinor: unit,
      grossMinor,
      netMinor: grossMinor,
      offerSavingsMinor: Math.max(0, fullMinor - grossMinor),
      discounted: isEligibleForDiscount(line, earlyDiscount)
    };
  });

  const subtotalMinor = lines.reduce((sum, line) => sum + line.netMinor, 0);
  const offerSavingsMinor = lines.reduce((sum, line) => sum + line.offerSavingsMinor, 0);

  const discount = earlyDiscount;
  // Las lineas a las que si les toca. Se decide aqui, antes de cualquier suma, porque el
  // descuento por producto cambia a la vez la BASE de calculo y a quien se le reparte:
  // una de las dos por separado es un resultado que no cuadra con la pantalla.
  const baseLines = discount ? lines.filter((line) => line.discounted) : lines;
  if (!discount) {
    return {
      lines,
      subtotalMinor,
      offerSavingsMinor,
      discountMinor: 0,
      totalMinor: subtotalMinor,
      discount: null
    };
  }

  if (discount.scope === 'product' || discount.scope === 'category') {
    if (!baseLines.length || baseLines.every((line) => line.netMinor === 0)) {
      // «-2 € en jamon» y en la cesta no hay jamon: no es un descuento de 0, es un aviso.
      return {
        lines,
        subtotalMinor,
        offerSavingsMinor,
        discountMinor: 0,
        totalMinor: subtotalMinor,
        discount: { applied: false, reason: 'noMatchingLine', applicableMinor: 0, applicableUnits: 0 }
      };
    }
  }

  if (subtotalMinor === 0) {
    return {
      lines,
      subtotalMinor,
      offerSavingsMinor,
      discountMinor: 0,
      totalMinor: 0,
      discount: { applied: false, reason: 'emptyBasket', applicableMinor: 0, applicableUnits: 0 }
    };
  }

  const capped = discount.scope === 'firstUnits' ? discount.firstUnits ?? null : null;
  const slice = sliceValue(baseLines, capped);

  let discountMinor = 0;
  let reason: NonNullable<BasketMoney['discount']>['reason'] = 'applied';

  if (discount.kind === 'percent') {
    const bps = discount.percentBps ?? 0;
    if (bps <= 0) {
      reason = 'noValue';
    } else {
      // El redondeo va al total, no por linea: por linea se fugaria un centavo y la
      // suma dejaria de cuadrar con lo que se ve en pantalla.
      discountMinor = HALF_UP((slice.minor * bps) / 10_000);
    }
  } else {
    const value = discount.valueMinor ?? 0;
    if (value <= 0) {
      reason = 'noValue';
    } else if (capped != null && slice.units < capped) {
      // «3 € de descuento comprando 6»: si no llegan las 6, no hay recorte que valga.
      reason = 'thresholdNotReached';
    } else {
      discountMinor = value;
    }
  }

  let clamped = false;
  if (discountMinor > slice.minor) {
    // Un descuento mayor que lo que cubre no devuelve dinero: se recorta y se dice,
    // porque «-97,00 €» en la pantalla no es un fallo del parser, es el cartel de
    // la promocion mal entendido, y eso lo tiene que poder leer la persona.
    discountMinor = slice.minor;
    clamped = true;
  }
  if (discountMinor <= 0) {
    if (reason === 'applied') reason = 'noValue';
  } else if (clamped) {
    reason = 'clampedToZero';
  }

  const shares = shareDiscount(baseLines, discountMinor);
  const totalMinor = Math.max(0, subtotalMinor - discountMinor);

  return {
    lines: lines.map((line) => ({ ...line, netMinor: line.netMinor - (shares.get(line.itemId) ?? 0) })),
    subtotalMinor,
    offerSavingsMinor,
    discountMinor,
    totalMinor,
    discount: {
      applied: discountMinor > 0,
      reason,
      applicableMinor: slice.minor,
      applicableUnits: slice.units
    }
  };
}

/**
 * Reparto del descuento entre las lineas con residuo mayor: la suma de los trozos
 * ES el descuento, ni un centimo de mas ni de menos. Hace falta para que «lo que
 * he pagado por cada cosa» cuadre con el total, que es lo que alguien mirara el
 * dia que quiera repartir el gasto.
 */
export function shareDiscount(lines: { itemId: string; netMinor: number }[], discountMinor: number): Map<string, number> {
  const result = new Map<string, number>();
  const total = lines.reduce((sum, line) => sum + line.netMinor, 0);
  if (discountMinor <= 0 || total <= 0) {
    lines.forEach((line) => result.set(line.itemId, 0));
    return result;
  }

  const pieces = lines.map((line) => {
    const exact = (discountMinor * line.netMinor) / total;
    const floor = Math.floor(exact);
    return { itemId: line.itemId, floor, residue: exact - floor };
  });
  let handed = pieces.reduce((sum, piece) => sum + piece.floor, 0);

  // El residuo se reparte de mayor a menor resto; a igualdad, la linea mas cara.
  const order = [...pieces].sort((a, b) => b.residue - a.residue || b.floor - a.floor);
  for (const piece of order) {
    if (handed >= discountMinor) break;
    result.set(piece.itemId, piece.floor + 1);
    handed += 1;
  }
  pieces.forEach((piece) => {
    if (!result.has(piece.itemId)) result.set(piece.itemId, piece.floor);
  });
  return result;
}

/**
 * Como se pinta el descuento, en una linea. Se calcula en el server y no en la
 * pantalla para que la lista, el detalle y el «ya esta la compra» digan lo mismo.
 */
export function describeDiscount(discount: Discount | null | undefined): string | null {
  if (!discount) return null;
  const core =
    discount.kind === 'percent'
      ? `${((discount.percentBps ?? 0) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`
      : `${((discount.valueMinor ?? 0) / 100).toLocaleString('es-ES', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })} €`;
  const cap =
    discount.scope === 'firstUnits' && discount.firstUnits
      ? ` en ${discount.firstUnits.toLocaleString('es-ES', { maximumFractionDigits: 2 })} unidades`
      : discount.scope === 'product' && discount.target
        ? ` en ${discount.target}`
        : discount.scope === 'category' && discount.target
          ? ` en ${discount.target}`
          : '';
  return discount.label?.trim() ? `${discount.label.trim()} · ${core}${cap}` : `${core}${cap}`;
}
