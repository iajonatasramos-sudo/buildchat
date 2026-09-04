'use client';

// Assinatura: plano, assentos e situação da cobrança.
// A cobrança automática entra na Fase 6 (gateway + webhook); por ora esta tela
// mostra a situação real da conta e orienta o contato.

import { useEffect, useState } from 'react';
import { avaliarLicenca, carregarPerfil, supabase, type Perfil } from '@/lib/supabase';
import { Botao, Cabecalho, Cartao } from '@/componentes/ui';

const PRECO_POR_ASSENTO = 49.8;

export default function Assinatura() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [ativos, setAtivos] = useState(0);

  useEffect(() => {
    (async () => {
      setPerfil(await carregarPerfil());
      const { count } = await supabase
        .from('usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('ativo', true);
      setAtivos(count ?? 0);
    })();
  }, []);

  if (!perfil) return null;
  const lic = avaliarLicenca(perfil.empresa);
  const total = (perfil.empresa.assentos * PRECO_POR_ASSENTO).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  return (
    <div>
      <Cabecalho titulo="Assinatura" subtitulo={`Plano, cobrança e assentos de ${perfil.empresa.nome}.`} />

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-4">
        <div className="flex flex-col gap-4">
          <Cartao className="px-[22px] py-5">
            <div className="flex items-start gap-4">
              <div>
                <div className="rotulo mb-2">PLANO ATUAL</div>
                <div className="text-[20px] font-extrabold">
                  Clínica · {perfil.empresa.assentos} {perfil.empresa.assentos === 1 ? 'assento' : 'assentos'}
                </div>
                <div className="mt-1.5 text-tinta-3">
                  {lic.titulo}
                  {lic.detalhe ? ` — ${lic.detalhe}` : ''}
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[30px] font-extrabold">
                  {total}
                  <span className="text-[15px] font-normal text-tinta-3">/mês</span>
                </div>
                <div className="mt-1 text-tinta-3">
                  {PRECO_POR_ASSENTO.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por assento
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-2 border-t border-linha pt-[18px]">
              <Botao onClick={() => alert('A cobrança automática entra na próxima fase. Fale com o suporte para ajustar o plano.')}>
                Trocar de plano
              </Botao>
              <Botao
                variante="secundario"
                onClick={() => alert('Para aumentar assentos agora, fale com o suporte.')}
              >
                Aumentar assentos
              </Botao>
            </div>
          </Cartao>

          <Cartao className="px-[22px] py-5">
            <div className="rotulo mb-3.5">USO DOS ASSENTOS</div>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-[30px] font-extrabold">{ativos}</span>
              <span className="text-tinta-3">de {perfil.empresa.assentos} em uso</span>
            </div>
            <div className="h-[6px] overflow-hidden rounded-[3px] bg-borda">
              <div
                className="h-full rounded-[3px] bg-marca"
                style={{ width: `${Math.min(100, (ativos / perfil.empresa.assentos) * 100)}%` }}
              />
            </div>
            <p className="mt-3 leading-relaxed text-tinta-3">
              Cada usuário ativo ocupa um assento. Convites pendentes também reservam.
            </p>
          </Cartao>
        </div>

        <div className="flex flex-col gap-3">
          <Cartao className="px-[18px] py-4">
            <div className="rotulo mb-3">SITUAÇÃO</div>
            <div className="text-[17px] font-extrabold">{lic.titulo}</div>
            {lic.dias !== null && <div className="mt-1 text-tinta-3">{lic.dias} dia(s) restantes</div>}
          </Cartao>

          <div className="rounded-cartao border border-borda bg-[#F0F1FB] px-4 py-3.5 leading-relaxed text-tinta-3">
            Pagamento por Pix, boleto ou cartão entra na próxima fase, com emissão automática de nota fiscal.
          </div>
        </div>
      </div>
    </div>
  );
}
