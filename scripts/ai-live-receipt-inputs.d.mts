export declare const AI_LIVE_RECEIPT_SOURCE_COUNT: 6;
export declare const AI_LIVE_RECEIPT_MAX_BYTES: number;
export declare const AI_LIVE_RECEIPT_TICKET_COUNT: 4;
export declare const AI_LIVE_RECEIPT_COMPLETION_BUDGET: 8;
export declare const AI_LIVE_RECEIPT_UNSUBMITTED_ONLY_SELECTION: 'unsubmitted-only';
export declare const AI_LIVE_RECEIPT_UNSUBMITTED_TICKET_COUNT: 2;
export declare const AI_LIVE_RECEIPT_UNSUBMITTED_COMPLETION_BUDGET: 4;

type AiLiveReceiptTicket = {
  readonly kind: 'pdf' | 'jpeg';
  readonly mimeType: 'application/pdf' | 'image/jpeg';
  readonly pageCount: number | null;
  readonly sourceFileCount: number;
  readonly buffer: Buffer;
};

type AiLiveReceiptPlan<TicketCount extends 2 | 4, Selection extends 'all' | 'unsubmitted-only'> = {
  readonly sourceCount: 6;
  readonly ticketCount: TicketCount;
  readonly selection: Selection;
  readonly tickets: readonly AiLiveReceiptTicket[];
};

type AiLiveReceiptPlanInput = {
  directory: string;
  preferredJpegOrdinal: number;
  readFileImpl?: (path: string) => Promise<Buffer>;
};

export declare function loadAiLiveReceiptPlan(
  input: AiLiveReceiptPlanInput & { selection: 'unsubmitted-only' }
): Promise<AiLiveReceiptPlan<2, 'unsubmitted-only'>>;
export declare function loadAiLiveReceiptPlan(
  input: AiLiveReceiptPlanInput & { selection?: 'all' }
): Promise<AiLiveReceiptPlan<4, 'all'>>;
