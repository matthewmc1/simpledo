import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface Props<T> {
  items: T[];
  /** Estimated row height in px. Doesn't need to be exact — the virtualizer
   *  re-measures actual rendered rows via `measureElement`. */
  estimateSize: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Extra rows kept rendered above/below the viewport. Higher = smoother
   *  fast scrolls, lower = less DOM. */
  overscan?: number;
  /** Don't bother virtualizing below this row count — rendering everything
   *  is cheaper than the wrapper + absolute positioning. */
  activateAt?: number;
  /** Scroll container max height. The list itself sets `overflow: auto`. */
  maxHeight?: number | string;
  /** Optional outer style. Useful for borders/backgrounds since we own the
   *  scroll container. */
  style?: React.CSSProperties;
  getKey?: (item: T, index: number) => React.Key;
}

/** Headless virtualized list. Below `activateAt` rows it renders every item
 *  inline (no scroll container) so small lists feel natural inside flow
 *  layouts. Above the threshold it switches to absolute-positioned rows
 *  inside a fixed-height scroller — only the visible rows are in the DOM. */
export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  overscan = 8,
  activateAt = 50,
  maxHeight = "70vh",
  style,
  getKey,
}: Props<T>) {
  // Hooks must run unconditionally — but we only consult them when virtualized.
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    measureElement:
      typeof window !== "undefined" &&
      window.navigator.userAgent.indexOf("Firefox") === -1
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });

  if (items.length <= activateAt) {
    return (
      <div style={style}>
        {items.map((item, i) => (
          <div key={getKey ? getKey(item, i) : i}>{renderItem(item, i)}</div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{ ...style, overflowY: "auto", maxHeight, contain: "strict" }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={getKey ? getKey(items[vi.index], vi.index) : vi.key}
            data-index={vi.index}
            ref={(node) => {
              if (node) virtualizer.measureElement(node);
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start}px)`,
            }}
          >
            {renderItem(items[vi.index], vi.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
