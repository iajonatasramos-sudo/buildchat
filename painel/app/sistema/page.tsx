'use client';

// Visão geral do negócio: quantas clínicas, em que situação e quanto de uso.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Cabecalho, Cartao } from '@/componentes/ui';

type Resumo = {
  empresas: number;
  ativas: number;
  trial: number;
  inadimplentes: number;
  canceladas: number;
  assentos_pagos: number;
  usuarios_ativos: number;
  ativos_7d: number;
  contatos: number;
};

export default function VisaoGeralSistema() {
  const [r, setR] = useState<Resumo | null>(null);

  useEffect(() => {
    supabase.rpc('sistema_resumo').then(({ data }) => setR(data as Resumo));
  }, []);

  if (!r) return null;

  return (
    <div>
      <Cabecalho
        titulo="Visão geral do sistema"
        subtitulo="Como está a base de clínicas do BuildChat."
        acao={
          <Link
            href="/sistema/empresas"
            className="rounded-controle bg-marca px-4 py-[9px] text-[13.5px] font-semibold text-white"
          >
            Ver empresas
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-4 gap-3.5">
        <Metrica titulo="Clínicas" valor={r.empresas} detalhe="cadastradas" />
        <Metrica titulo="Assinaturas ativas" valor={r.ativas} detalhe={`${r.assentos_pagos} assento(s) pagos`} destaque />
        <Metrica titulo="Em teste grátis" valor={r.trial} detalhe="podem virar clientes" />
        <Metrica
          titulo="Inadimplentes"
          valor={r.inadimplentes}
          detalhe={r.canceladas > 0 ? `${r.canceladas} cancelada(s)` : 'nenhuma cancelada'}
          alerta={r.inadimplentes > 0}
        />
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <Metrica titulo="Usuários ativos" valor={r.usuarios_ativos} detalhe="contas habilitadas" />
        <Metrica titulo="Usaram nos últimos 7 dias" valor={r.ativos_7d} detalhe="engajamento real" />
        <Metrica titulo="Contatos no CRM" valor={r.contatos} detalhe="somados de todas as clínicas" />
      </div>

      <p className="mt-6 max-w-[640px] text-[12.5px] leading-relaxed text-tinta-4">
        Estes números são agregados. O conteúdo das clínicas — mensagens, contatos, anotações e
        conversas — não é acessível por esta área, nem para o gestor do sistema.
      </p>
    </div>
  );
}

function Metrica({
  titulo,
  valor,
  detalhe,
  destaque,
  alerta,
}: {
  titulo: string;
  valor: number;
  detalhe: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <Cartao className="px-[18px] py-4">
      <div className="rotulo mb-2">{titulo}</div>
      <div
        className={`text-[28px] font-extrabold leading-none ${
          alerta && valor > 0 ? 'text-perigo' : destaque ? 'text-marca' : ''
        }`}
      >
        {valor}
      </div>
      <div className="mt-1.5 text-[12.5px] text-tinta-4">{detalhe}</div>
    </Cartao>
  );
}
