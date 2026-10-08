import Database from 'better-sqlite3';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, test } from './fixtures';
import { seededEmail } from './helpers/seed';

test.skip(process.env.E2E_NGINX_INGRESS !== '1', 'requiere el runner aislado con Nginx real');

const TICKET_BYTES = 513 * 1024;

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.byteLength);
  chunk.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.byteLength)), 8 + data.byteLength);
  return chunk;
}

function pngSynthetic(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const beforeText = [
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 0])))
  ];
  const afterText = [pngChunk('IEND', Buffer.alloc(0))];
  const keyword = Buffer.from('Comment\0', 'latin1');
  const textPaddingBytes =
    TICKET_BYTES -
    signature.byteLength -
    [...beforeText, ...afterText].reduce((total, chunk) => total + chunk.byteLength, 0) -
    12 -
    keyword.byteLength;
  if (textPaddingBytes < 0) throw new Error('PNG fixture no cabe en el límite solicitado.');
  const text = pngChunk('tEXt', Buffer.concat([keyword, Buffer.alloc(textPaddingBytes, 0x20)]));
  const png = Buffer.concat([signature, ...beforeText, text, ...afterText]);
  if (png.byteLength !== TICKET_BYTES) throw new Error('La PNG fixture no tiene el tamaño exacto.');
  return png;
}

function ticketState(receiptId: string): {
  bytes: number;
  status: string;
  errorCode: string | null;
} {
  const runDir = process.env.E2E_RUN_DIR;
  const databasePath = process.env.DATABASE_PATH;
  if (!runDir || !databasePath) throw new Error('Ingress E2E requiere SQLite temporal aislado.');
  if (resolve(databasePath) !== join(resolve(runDir), 'hogaria.sqlite')) {
    throw new Error('DATABASE_PATH debe permanecer dentro del directorio temporal del run.');
  }

  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const receipt = db
      .prepare('SELECT file_bytes AS bytes, status FROM receipts WHERE id = ?')
      .get(receiptId) as { bytes: number; status: string } | undefined;
    const job = db
      .prepare(
        `SELECT status, error_code AS errorCode FROM ai_jobs
         WHERE receipt_id = ? AND kind = 'receipt' ORDER BY created_at DESC LIMIT 1`
      )
      .get(receiptId) as { status: string; errorCode: string | null } | undefined;
    if (!receipt || !job) throw new Error('La subida aún no creó el ticket y su trabajo de IA.');
    return { bytes: receipt.bytes, status: job.status, errorCode: job.errorCode };
  } finally {
    db.close();
  }
}

test('el ingress acepta 513 KiB y entrega el ticket al backend sin proveedor IA', async ({
  page
}) => {
  const registration = await page.request.post('/api/auth/register', {
    data: { name: 'Ingress E2E', email: seededEmail(), password: 'Test1234' }
  });
  expect(registration.status()).toBe(201);
  const registrationBody = (await registration.json()) as { data: { token: string } };
  const healthResponse = await page.goto('/api/health');
  expect(healthResponse?.status()).toBe(200);

  const upload = await page.evaluate(
    async ({ token, encodedPng }) => {
      const rawBytes = atob(encodedPng);
      const bytes = Uint8Array.from(rawBytes, (character) => character.charCodeAt(0));
      const file = new File([bytes], 'ticket-513-kib.png', { type: 'image/png' });
      const decoded = await createImageBitmap(file);
      const dimensions = { width: decoded.width, height: decoded.height };
      decoded.close();
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/receipts', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form
      });
      return {
        status: response.status,
        dimensions,
        body: (await response.json().catch(() => null)) as { data?: { id?: string } } | null
      };
    },
    { token: registrationBody.data.token, encodedPng: pngSynthetic().toString('base64') }
  );
  expect(upload.status).toBe(201);
  expect(upload.dimensions).toEqual({ width: 1, height: 1 });
  const receiptId = upload.body?.data?.id;
  expect(receiptId).toBeTruthy();
  if (!receiptId) throw new Error('El backend no devolvió id para el ticket subido.');

  await expect
    .poll(() => ticketState(receiptId), { timeout: 20000 })
    .toEqual({ bytes: TICKET_BYTES, status: 'failed', errorCode: 'NO_CONFIG' });

  const unrelatedOversize = await page.evaluate(async (size) => {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'x'.repeat(size) })
    });
    return response.status;
  }, TICKET_BYTES);
  expect(unrelatedOversize).toBe(413);
});
