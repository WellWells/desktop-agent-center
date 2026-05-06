import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

interface ElementSize {
  width: number;
  height: number;
}

export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled = true,
): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    if (!enabled) {
      setSize({ width: 0, height: 0 });
      return;
    }

    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, ref]);

  return size;
}
