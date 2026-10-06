"use client";
/** Track price ticks; returns the tick direction while the flash is active. */
import { useEffect, useState } from "react";

export const FLASH_MS = 500;

interface Flash {
  dir: "up" | "down";
  id: number;
}

export function useFlash(price: number | null | undefined): Flash | null {
  const [last, setLast] = useState(price);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [count, setCount] = useState(0);

  if (price !== last) {
    setLast(price);
    if (price != null && last != null) {
      setFlash({ dir: price > last ? "up" : "down", id: count + 1 });
      setCount(count + 1);
    }
  }

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  return flash;
}
