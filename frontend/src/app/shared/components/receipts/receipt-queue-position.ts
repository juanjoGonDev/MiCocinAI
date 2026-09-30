export interface ReceiptQueueAnchor {
  left: number;
  top: number;
  bottom: number;
}

export interface ReceiptQueueViewport {
  width: number;
  height: number;
}

export interface ReceiptQueuePanelPosition {
  left: number;
  top: number | null;
  bottom: number | null;
  width: number;
  maxHeight: number;
}

const PANEL_MAX_WIDTH = 380;
const VIEWPORT_MARGIN = 16;
const TRIGGER_GAP = 8;
const MIN_PANEL_HEIGHT = 240;

/** Place the queue beside its trigger without inheriting the sidebar's narrow width. */
export function computeReceiptQueuePanelPosition(
  anchor: ReceiptQueueAnchor,
  viewport: ReceiptQueueViewport
): ReceiptQueuePanelPosition {
  const horizontalMargin = Math.min(VIEWPORT_MARGIN, Math.max(0, viewport.width / 2));
  const verticalMargin = Math.min(VIEWPORT_MARGIN, Math.max(0, viewport.height / 2));
  const width = Math.max(0, Math.min(PANEL_MAX_WIDTH, viewport.width - horizontalMargin * 2));
  const maxLeft = Math.max(horizontalMargin, viewport.width - horizontalMargin - width);
  const left = Math.min(maxLeft, Math.max(horizontalMargin, anchor.left));

  const topBelow = anchor.bottom + TRIGGER_GAP;
  const availableBelow = Math.max(0, viewport.height - verticalMargin - topBelow);
  const availableAbove = Math.max(0, anchor.top - TRIGGER_GAP - verticalMargin);
  const opensAbove = availableBelow < MIN_PANEL_HEIGHT && availableAbove > availableBelow;

  if (opensAbove) {
    return {
      left,
      top: null,
      bottom: Math.max(0, viewport.height - anchor.top + TRIGGER_GAP),
      width,
      maxHeight: availableAbove
    };
  }

  return { left, top: topBelow, bottom: null, width, maxHeight: availableBelow };
}
