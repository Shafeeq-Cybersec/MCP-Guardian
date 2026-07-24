import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes without style conflicts.
 * Combines `clsx` conditional logic with `tailwind-merge` de-duplication.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Clamp a number into an inclusive range. */
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Format a number with thousands separators (e.g. 12345 -> "12,345"). */
export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

/** Compact number formatting (e.g. 12345 -> "12.3K"). */
export function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
