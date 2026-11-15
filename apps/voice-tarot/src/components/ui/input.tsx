import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "w-full min-w-0 rounded-md border border-white/20 bg-white/5 px-3 py-2 focus-visible:outline-2 focus-visible:outline-pink-300",
        className,
      )}
      {...props}
    />
  );
}
