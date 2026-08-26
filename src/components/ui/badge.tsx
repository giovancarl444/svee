import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "green" | "red" | "accent" | "blue" | "outline";

const styles: Record<BadgeVariant, string> = {
  default: "bg-surface-4 text-fg-dim border-line",
  green: "border-green/25 bg-green-dim text-green",
  red: "border-red/25 bg-red-dim text-red",
  accent: "border-accent/30 bg-accent/10 text-accent",
  blue: "border-blue/25 bg-blue/10 text-blue",
  outline: "border-line-strong bg-transparent text-fg-dim",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center rounded border px-1.5 py-0.5",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
