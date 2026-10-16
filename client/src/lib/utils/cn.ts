import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* tailwind-merge only knows Tailwind's default scales; register the custom
   type scale and weight from globals.css so `text-ui` is treated as a font
   size (not a colour) and `cn("text-sm", "text-ui")` keeps only the last. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["2xs", "ui", "md"],
      "font-weight": ["strong"],
    },
  },
});

/** Join conditional class names and resolve Tailwind conflicts (last one wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
