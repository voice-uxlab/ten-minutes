import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
// shadcn/ui button composition, styled for the existing tarot design.
const variants = cva(
  "inline-flex items-center justify-center gap-2 transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pink-300",
  {
    variants: {
      variant: {
        default: "glass",
        ghost: "text-button",
        primary: "glass primary",
      },
      size: { default: "px-4 py-3", sm: "mini", wide: "wide" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  asChild = false,
  className,
  variant,
  size,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(variants({ variant, size }), className)} {...props} />
  );
}
