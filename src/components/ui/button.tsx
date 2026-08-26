import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-surface-4 text-fg hover:bg-[#26262e] border border-line",
        buy: "bg-green text-black font-semibold hover:brightness-110 shadow-glow-green/0 hover:shadow-glow-green btn-press",
        sell: "bg-red text-white font-semibold hover:brightness-110 shadow-glow-red/0 hover:shadow-glow-red btn-press",
        accent:
          "bg-accent text-white hover:bg-accent-hover shadow-glow-accent/0 hover:shadow-glow-accent btn-press",
        outline:
          "border border-line-strong bg-transparent text-fg hover:bg-surface-4",
        ghost: "text-fg-dim hover:text-fg hover:bg-surface-4",
        danger:
          "border border-red/30 bg-red-dim text-red hover:bg-red hover:text-white btn-press",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        default: "h-9 px-3.5",
        lg: "h-11 px-6 text-base",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
