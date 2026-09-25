import { z } from 'zod';
import { formDefault, formField, formPartial } from './form.js';

/**
 * Los esquemas de la lectura de tickets por IA (HOGARIA-SPEC ## 12aj).
 *
 * La respuesta del modelo es la hermana de `photoLinesSchema` con dos cosas que la foto de la
 * estanteria no tiene: la TIENDA (el ticket la dice en su cabecera) y el TOTAL (el dato que
 * permite que la revision ensene si la suma de lineas cuadra). Y el `category` de cada linea es
 * una clave del catalogo de la DESPENSA —no la seccion del carrito— porque lo que se clasifica
 * aqui es a donde va a parar la compra dentro del inventario de la casa.
 */

const offerTicket = formField(
  z
    .object({
      buy: z.coerce.number().int().min(2).max(20),
      take: z.coerce.number().int().min(1).max(19)
    })
    .refine((offer) => offer.take < offer.buy, {
      message: 'La oferta tiene que regalar algo (take < buy)'
    })
);

/** Lo que el modelo contesta al leer un ticket. */
export const ticketAnswerSchema = z.object({
  lines: z
    .array(
      z
        .object({
          name: z.string().trim().min(2).max(120),
          quantity: formDefault(z.coerce.number().positive().max(10000), 1),
          unit: formField(z.string().trim().max(24)),
          /** Clave del catalogo de la despensa de la casa (la que viaja en inventario.json). */
          category: formField(z.string().trim().max(64)),
          createCategory: formField(z.boolean()),
          priceMinor: formField(z.coerce.number().int().min(0).max(100_000_000)),
          offer: offerTicket,
          confidence: formDefault(z.coerce.number().min(0).max(1), 0.5),
          note: formField(z.string().trim().max(280))
        })
        .refine((line) => line.name.trim().length > 1, { message: 'NombreVacio' })
    )
    .max(300),
  store: formField(z.string().trim().max(80)),
  currency: formField(z.enum(['EUR', 'eur'])),
  totalMinor: formField(z.coerce.number().int().min(0).max(100_000_000)),
  warnings: formField(z.array(z.string().trim().max(280)).max(20))
});

/** Una linea escrita o corregida por la persona durante la revision. */
export const receiptItemInput = z.object({
  name: z.string().trim().min(2, 'Nombre demasiado corto').max(120),
  quantity: formDefault(z.coerce.number().positive().max(10000), 1),
  unit: formField(z.string().trim().max(24)),
  category: formField(z.string().trim().max(64)),
  priceMinor: formField(z.coerce.number().int().min(0).max(100_000_000)),
  offer: offerTicket,
  note: formField(z.string().trim().max(280))
});

export const createReceiptItemSchema = receiptItemInput;

export const updateReceiptItemSchema = formPartial(receiptItemInput);

/** El encabezado del ticket, corregible durante la revision. */
export const updateReceiptSchema = formPartial(
  z.object({
    store: formField(z.string().trim().max(80)),
    notes: formField(z.string().trim().max(500))
  })
);
