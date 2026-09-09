'use client';

// A marca vem do servidor (decidida pelo domínio) e desce por contexto — as
// páginas são componentes de cliente e não podem ler o host sozinhas.

import { createContext, useContext } from 'react';
import { MARCAS, type IdMarca, type Marca } from '@/lib/marca';

const Ctx = createContext<Marca>(MARCAS.buildchat);

export function MarcaProvider({ id, children }: { id: IdMarca; children: React.ReactNode }) {
  return <Ctx.Provider value={MARCAS[id]}>{children}</Ctx.Provider>;
}

/** A marca deste painel. */
export function useMarca(): Marca {
  return useContext(Ctx);
}
