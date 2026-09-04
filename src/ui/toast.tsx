// Toasts mínimos (substituem o `sonner`, que não funciona dentro do shadow DOM).

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Toast = { id: number; tipo: 'success' | 'error'; msg: string };

let seq = 0;
const listeners = new Set<(t: Toast) => void>();

export const toast = {
  success(msg: string) {
    listeners.forEach((fn) => fn({ id: ++seq, tipo: 'success', msg }));
  },
  error(msg: string) {
    listeners.forEach((fn) => fn({ id: ++seq, tipo: 'error', msg }));
  },
};

export function Toaster() {
  const [itens, setItens] = useState<Toast[]>([]);

  useEffect(() => {
    const fn = (t: Toast) => {
      setItens((arr) => [...arr, t]);
      setTimeout(() => setItens((arr) => arr.filter((x) => x.id !== t.id)), 3500);
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-24 right-5 z-[80] flex flex-col items-end gap-2">
      {itens.map((t) => (
        <div
          key={t.id}
          className={cn(
            'bc-anim-pop pointer-events-auto max-w-[320px] rounded-lg border px-3.5 py-2.5 text-[12.5px] font-medium shadow-lg',
            t.tipo === 'success'
              ? 'border-border bg-surface text-text'
              : 'border-danger/40 bg-surface text-danger',
          )}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
