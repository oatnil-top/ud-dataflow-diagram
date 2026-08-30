import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Tailwind-aware class merge, for the two shadcn primitives copied into src/ui.
 *
 * Copied from ud rather than imported: the package must not reach into the host app. Only
 * `cn` came across — ud's lib/utils.ts also carries byte and date formatters, which encode
 * product choices this library has no opinion about.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
