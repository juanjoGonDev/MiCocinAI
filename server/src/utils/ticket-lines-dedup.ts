import { productKeyOf, normalizeProductName } from './product-key.js';

type ReceiptLineIdentity = {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  priceMinor?: number | null;
  offer?: { buy?: number | null; take?: number | null } | null;
  confidence?: number | null;
  note?: string | null;
  category?: string | null;
};

/** Collapse repeated visual views of the same printed line while preserving distinct purchases. */
export function deduplicateTicketLines<T extends ReceiptLineIdentity>(lines: readonly T[]): T[] {
  const unique: T[] = [];
  const indexesByProduct = new Map<string, number[]>();

  for (const line of lines) {
    const key = productLineKey(line);
    const candidates = indexesByProduct.get(key) ?? [];
    const duplicateIndex = candidates.find((index) => compatibleDuplicate(unique[index]!, line));
    if (duplicateIndex === undefined) {
      indexesByProduct.set(key, [...candidates, unique.length]);
      unique.push(line);
      continue;
    }

    unique[duplicateIndex] = mergeRepeatedLine(unique[duplicateIndex]!, line);
  }

  return unique;
}

function productLineKey(line: ReceiptLineIdentity): string {
  const name = productKeyOf(line.name);
  const quantity = Number(line.quantity ?? 1);
  const unit = normalizeProductName(line.unit);
  return JSON.stringify([name, Number.isFinite(quantity) ? quantity : 1, unit]);
}

function compatibleDuplicate(left: ReceiptLineIdentity, right: ReceiptLineIdentity): boolean {
  const leftPrice = knownNumber(left.priceMinor);
  const rightPrice = knownNumber(right.priceMinor);
  if (leftPrice !== null && rightPrice !== null && leftPrice !== rightPrice) return false;

  const leftOffer = offerKey(left.offer);
  const rightOffer = offerKey(right.offer);
  return leftOffer === rightOffer;
}

function mergeRepeatedLine<T extends ReceiptLineIdentity>(left: T, right: T): T {
  const preferred = lineQuality(right) > lineQuality(left) ? right : left;
  return {
    ...preferred,
    priceMinor: knownNumber(left.priceMinor) ?? knownNumber(right.priceMinor),
    confidence: Math.max(knownNumber(left.confidence) ?? 0, knownNumber(right.confidence) ?? 0),
    note: nonEmpty(left.note) ?? nonEmpty(right.note) ?? null,
    offer: left.offer ?? right.offer ?? null
  } as T;
}

function lineQuality(line: ReceiptLineIdentity): number {
  const presentFields = [line.priceMinor, line.unit, line.category, line.offer, line.note].filter(
    (value) => value !== undefined && value !== null && value !== ''
  ).length;
  return presentFields + (knownNumber(line.confidence) ?? 0);
}

function knownNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function offerKey(value: ReceiptLineIdentity['offer']): string | null {
  if (!value || value.buy == null || value.take == null) return null;
  return JSON.stringify([value.buy, value.take]);
}

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
