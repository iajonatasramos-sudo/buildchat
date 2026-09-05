'use client';

// Assinatura: plano, assentos e situação da cobrança.
// A cobrança automática entra na Fase 6 (gateway + webhook); por ora esta tela
// mostra a situação real da conta e orienta o contato.

import { useEffect, useState } from 'react';
import { avaliarLicenca, carregarPerfil, moeda, supabase, type Perfil } from '@/lib/supabase';
import { Botao, Cabecalho, Cartao } from '@/componentes/ui';

const PRECO_POR_ASSENTO = 49.8;

type MeuPlano = {
  slug: string;
  nome: string;
  assentos_inclusos: number;
  max_mensagens: number | null;
  mensagens_usadas: number;
  permite_equipes: boolean;
  permite_mensagens_empresa: boolean;
  permite_exportar: boolean;
};

export default function Assinatura() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [ativos, setAtivos] = useState(0);

  const [plano, setPlano] = useState<MeuPlano | null>(null);
  const [planos, setPlanos] = useState<{ slug: string; nome: string; preco_mensal_centavos: number; assentos_inclusos: number; max_mensagens: number | null; permite_equipes: boolean; permite_exportar: boolean }[]>([]);

  useEffect(() => {
    supabase.rpc('meu_plano').then(({ data }) => setPlano(data as MeuPlano));
    supabase
      .from('planos')
      .select('slug, nome, preco_mensal_centavos, assentos_inclusos, max_mensagens, permite_equipes, permite_exportar')
      .eq('ativo', true)
      .order('ordem')
      .then(({ data }) => setPlanos((data as never[]) ?? []));
  }, []);

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

      {plano && (
        <Cartao className="mb-3.5 px-[18px] py-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="rounded-chip bg-marca px-2.5 py-[3px] text-[12px] font-bold uppercase tracking-wide text-white">
              {plano.nome}
            </span>
            <span className="text-[13px] text-tinta-3">é o seu nível hoje</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Consumo
              titulo="Mensagens rápidas"
              usado={plano.mensagens_usadas}
              teto={plano.max_mensagens}
            />
            <div>
              <div className="rotulo mb-1.5">EQUIPES</div>
              <div className={`text-[13.5px] font-medium ${plano.permite_equipes ? 'text-sucesso' : 'text-tinta-4'}`}>
                {plano.permite_equipes ? 'Incluído' : 'A partir do Pro'}
              </div>
            </div>
            <div>
              <div className="rotulo mb-1.5">MENSAGENS DA EMPRESA</div>
              <div
                className={`text-[13.5px] font-medium ${plano.permite_mensagens_empresa ? 'text-sucesso' : 'text-tinta-4'}`}
              >
                {plano.permite_mensagens_empresa ? 'Incluído' : 'A partir do Pro'}
              </div>
            </div>
          </div>
        </Cartao>
      )}

      {planos.length > 0 && (
        <Cartao className="mb-3.5 px-[18px] py-4">
          <div className="rotulo mb-3">NÍVEIS DISPONÍVEIS</div>
          <div className="grid grid-cols-3 gap-3">
            {planos.map((p) => {
              const atual = plano?.slug === p.slug;
              return (
                <div
                  key={p.slug}
                  className={`rounded-cartao border p-3.5 ${atual ? 'border-marca bg-marca-suave' : 'border-borda'}`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[15px] font-extrabold">{p.nome}</span>
                    {atual && <span className="text-[11.5px] font-bold uppercase text-marca">atual</span>}
                  </div>
                  <div className="mb-2.5 text-[18px] font-extrabold">
                    {moeda(p.preco_mensal_centavos)}
                    <span className="text-[12.5px] font-normal text-tinta-4">/mês</span>
                  </div>
                  <ul className="flex flex-col gap-1 text-[12.5px] text-tinta-3">
                    <li>{p.assentos_inclusos} usuários</li>
                    <li>{p.max_mensagens === null ? 'Mensagens ilimitadas' : `${p.max_mensagens} mensagens rápidas`}</li>
                    <li className={p.permite_equipes ? '' : 'text-tinta-4'}>
                      {p.permite_equipes ? 'Equipes e mensagens da empresa' : 'Sem equipes'}
                    </li>
                    <li className={p.permite_exportar ? '' : 'text-tinta-4'}>
                      {p.permite_exportar ? 'Exportação do CRM' : 'Sem exportação'}
                    </li>
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[12.5px] text-tinta-4">
            Para mudar de nível, fale com o suporte do BuildChat.
          </p>
        </Cartao>
      )}

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

function Consumo({ titulo, usado, teto }: { titulo: string; usado: number; teto: number | null }) {
  const pct = teto ? Math.min(100, Math.round((usado / teto) * 100)) : 0;
  const cheio = teto !== null && usado >= teto;
  return (
    <div>
      <div className="rotulo mb-1.5">{titulo}</div>
      <div className="text-[13.5px] font-medium">
        {usado}
        {teto === null ? <span className="text-tinta-4"> · ilimitado</span> : ` de ${teto}`}
      </div>
      {teto !== null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-linha">
          <div
            className={`h-full rounded-full ${cheio ? 'bg-perigo' : 'bg-marca'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
