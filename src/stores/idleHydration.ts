import { useEffect } from "react";
import { useTaskStore } from "./taskStore";

/** When the browser goes idle, opportunistically pre-warm the long-tail slices
 *  (Someday and the recent Done window) so navigating to those views is
 *  instant. Cheap and bounded — each call is the standard paginated slice
 *  fetch (≤500 rows). Hard-yields back to the foreground if the user
 *  interacts with the page. */
export function useIdleHydration() {
  const loadStatus = useTaskStore((s) => s.loadStatus);

  useEffect(() => {
    if (typeof window === "undefined") return;
    type IdleHandle = { id: number; kind: "ric" | "timeout" };
    const handles: IdleHandle[] = [];

    // requestIdleCallback is widely supported but not in Safari. Fall back to
    // a deferred setTimeout so we still hydrate, just less elegantly.
    const ric: (cb: () => void, options?: { timeout?: number }) => IdleHandle = (
      cb,
      options,
    ) => {
      if (typeof window.requestIdleCallback === "function") {
        return { id: window.requestIdleCallback(cb, options), kind: "ric" };
      }
      return { id: window.setTimeout(cb, 1200), kind: "timeout" };
    };

    // Stagger the warm-ups so we don't fire two concurrent fetches and force
    // both to fight for the same connection. Each runs independently — failures
    // don't block the next slice.
    handles.push(
      ric(
        () => {
          void loadStatus("someday");
        },
        { timeout: 4000 },
      ),
    );
    handles.push(
      ric(
        () => {
          void loadStatus("done");
        },
        { timeout: 8000 },
      ),
    );

    return () => {
      for (const h of handles) {
        if (h.kind === "ric" && typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(h.id);
        } else if (h.kind === "timeout") {
          window.clearTimeout(h.id);
        }
      }
    };
  }, [loadStatus]);
}
