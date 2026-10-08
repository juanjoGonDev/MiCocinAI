export declare const AI_LIVE_RECEIPT_SOURCE_COUNT: 6;
export declare const AI_LIVE_RECEIPT_MAX_BYTES: number;
export declare const AI_LIVE_RECEIPT_TICKET_COUNT: 4;
export declare const AI_LIVE_RECEIPT_COMPLETION_BUDGET: 8;

export declare function loadAiLiveReceiptPlan(input: {
  directory: string;
  preferredJpegOrdinal: number;
}): Promise<{
  readonly sourceCount: 6;
  readonly ticketCount: 4;
  readonly tickets: readonly {
    readonly kind: 'pdf' | 'jpeg';
    readonly mimeType: 'application/pdf' | 'image/jpeg';
    readonly pageCount: number | null;
    readonly sourceFileCount: number;
    readonly buffer: Buffer;
  }[];
}>;
