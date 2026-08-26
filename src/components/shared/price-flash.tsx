"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * PriceFlash — text that flashes green/red when its value changes direction.
 * The 400ms fade is the "terminal is alive" micro-interaction.
 */
export function PriceFlash({
  value,
  format,
  className,
}: {
  value: number;
  /** render helper, e.g. fmtPrice */
  format: (n: number) => string;
  className?: string;
}) {
  const prevRef = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value === prevRef.current) return;
    setFlash(value > prevRef.current ? "up" : "down");
    prevRef.current = value;
    const t = setTimeout(() => setFlash(null), 400);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span
      className={cn(
        "num rounded px-1 transition-colors duration-300",
        flash === "up" && "bg-green-dim",
        flash === "down" && "bg-red-dim",
        className,
      )}
    >
      {format(value)}
    </span>
  );
}
