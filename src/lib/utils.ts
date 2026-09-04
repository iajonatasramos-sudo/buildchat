import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefixo = 'id'): string {
  return `${prefixo}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function aguardar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ampliação da interface da extensão (25%). Aplicada via `zoom` no .bc-root,
 * portanto TODA coordenada medida no DOM do WhatsApp (px reais do viewport)
 * precisa ser dividida por ZOOM antes de virar `left`/`top` dentro das raízes.
 */
export const ZOOM = 1.25;
export const emPx = (v: number) => v / ZOOM;
