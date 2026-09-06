'use client';

// Visão geral: assinatura, assentos, acervo e quem usou a extensão.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  avaliarLicenca,
  carregarPerfil,
  ehAdmin,
  formatarData,
  formatarTelefone,
  iniciais,
  meusNumeros,
  supabase,
  type MeuNumero,
  type Perfil,
} from '@/lib/supabase';
import { Cartao, Chip } from '@/componentes/ui';

type Pasta = { id: string; nome: string; cor: string };
type Usuario = { id: string; nome: string; ultimo_acesso: string | null; ativo: boolean };

export default function VisaoGeral() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  useEffect(() => {
    carregarPerfil().then(setPerfil);
  }, []);
  if (!perfil) return null;
  return ehAdmin(perfil) ? <VisaoDaEmpresa perfil={perfil} /> : <VisaoDoAtendente perfil={perfil} />;
}

// ─────────────────────────── Visão do atendente ──────────────────────────
// Só o que é dele: os números que conectou, os contatos desses números, as
// propostas e anotações que fez, as mensagens pessoais. Nada de assinatura,
// assentos ou equipe.
function VisaoDoAtendente({ perfil }: { perfil: Perfil }) {
  const [numeros, setNumeros] = useState<MeuNumero[]>([]);
  const [contatos, setContatos] = useState(0);
  const [propostas, setPropostas] = useState({ total: 0, enviadas: 0 });
  const [anotacoes, setAnotacoes] = useState(0);
  const [pessoais, setPessoais] = useState(0);
  const [ultimoAcesso, setUltimoAcesso] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    (async () => {
      const nums = await meusNumeros();
      setNumeros(nums);
      const meusWa = nums.map((n) => n.wa_number);
      const [ct, pr, an, pe, eu] = await Promise.all([
        meusWa.length
          ? supabase.from('contatos').select('id', { count: 'exact', head: true }).is('deleted_at', null).in('wa_number', meusWa)
          : Promise.resolve({ count: 0 }),
        supabase.from('propostas').select('enviada_em').is('deleted_at', null).eq('criado_por', perfil.id),
        supabase.from('anotacoes').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('autor_id', perfil.id),
        supabase
          .from('respostas')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .eq('escopo', 'pessoal')
          .eq('owner_id', perfil.id),
        supabase.from('usuarios').select('ultimo_acesso').eq('id', perfil.id).maybeSingle(),
      ]);
      setContatos(ct.count ?? 0);
      const lista = (pr.data as { enviada_em: string | null }[]) ?? [];
      setPropostas({ total: lista.length, enviadas: lista.filter((p) => p.enviada_em).length });
      setAnotacoes(an.count ?? 0);
      setPessoais(pe.count ?? 0);
      setUltimoAcesso((eu.data as { ultimo_acesso: string | null } | null)?.ultimo_acesso ?? null);
      setPronto(true);
    })();
  }, [perfil.id]);

  if (!pronto) return null;
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div>
      <div className="mb-[22px]">
        <h1 className="mb-1 text-[27px] font-extrabold">Olá, {perfil.nome.split(' ')[0]}</h1>
        <div className="text-tinta-3">
          {perfil.empresa.nome} · {hoje}
          {ultimoAcesso && <> · última sincronização {formatarData(ultimoAcesso)}</>}
        </div>
      </div>

      <div className="mb-3.5 grid grid-cols-4 gap-3.5">
        <Cartao className="px-5 py-[18px]">
          <div className="rotulo mb-2.5">MEUS CONTATOS</div>
          <div className="text-[30px] font-extrabold">{contatos}</div>
          <Link href="/painel/contatos" className="mt-2.5 inline-block font-medium text-marca">
            Ver contatos
          </Link>
        </Cartao>
        <Cartao className="px-5 py-[18px]">
          <div className="rotulo mb-2.5">PROPOSTAS QUE GEREI</div>
          <div className="text-[30px] font-extrabold">{propostas.total}</div>
          <div className="mt-2.5 text-tinta-3">{propostas.enviadas} enviada(s) na conversa</div>
        </Cartao>
        <Cartao className="px-5 py-[18px]">
          <div className="rotulo mb-2.5">ANOTAÇÕES</div>
          <div className="text-[30px] font-extrabold">{anotacoes}</div>
          <div className="mt-2.5 text-tinta-3">feitas por você</div>
        </Cartao>
        <Cartao className="px-5 py-[18px]">
          <div className="rotulo mb-2.5">MENSAGENS PESSOAIS</div>
          <div className="text-[30px] font-extrabold">{pessoais}</div>
          <div className="mt-2.5 text-tinta-3">suas mensagens rápidas</div>
        </Cartao>
      </div>

      <Cartao className="px-5 py-[18px]">
        <div className="rotulo mb-3.5">MEUS NÚMEROS DE WHATSAPP</div>
        {numeros.length === 0 ? (
          <p className="leading-relaxed text-tinta-3">
            Nenhum ainda. Abra o WhatsApp Web com a extensão e entre com este usuário — o número conectado aparece aqui e
            os contatos dele passam a ser listados em <Link href="/painel/contatos" className="font-medium text-marca">Meus contatos</Link>.
          </p>
        ) : (
          <div className="flex flex-col">
            {numeros.map((n, i) => (
              <div
                key={n.wa_number}
                className={`flex items-center gap-3 py-2.5 ${i < numeros.length - 1 ? 'border-b border-linha' : ''}`}
              >
                <div className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-marca-suave text-[11px] font-extrabold text-marca">
                  {iniciais(n.nome_whatsapp ?? 'W')}
                </div>
                <div className="min-w-0">
                  <div className="font-medium">{n.nome_whatsapp ?? 'WhatsApp'}</div>
                  <div className="font-mono text-[12.5px] text-tinta-3">{formatarTelefone(n.wa_number)}</div>
                </div>
                <span className="ml-auto text-tinta-3">usado {formatarData(n.ultimo_uso)}</span>
              </div>
            ))}
          </div>
        )}
      </Cartao>

      <div className="mt-3.5 flex items-center gap-3 rounded-cartao border border-borda bg-[#F0F1FB] px-[18px] py-3.5 leading-relaxed text-tinta-3">
        <span className="text-[16px] text-marca">⚡</span>
        As conversas e os arquivos recebidos ficam apenas no seu computador. Aqui sincronizam somente suas
        configurações, mensagens, pastas e a ficha dos contatos.
      </div>
    </div>
  );
}

// ─────────────────────────── Visão da empresa (admin) ────────────────────
function VisaoDaEmpresa({ perfil }: { perfil: Perfil }) {
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [totalMensagens, setTotalMensagens] = useState(0);

  useEffect(() => {
    (async () => {
      const [p, u, m] = await Promise.all([
        supabase.from('pastas').select('id, nome, cor').is('deleted_at', null).order('ordem'),
        supabase.from('usuarios').select('id, nome, ultimo_acesso, ativo').order('nome'),
        supabase.from('respostas').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      ]);
      setPastas((p.data as Pasta[]) ?? []);
      setUsuarios((u.data as Usuario[]) ?? []);
      setTotalMensagens(m.count ?? 0);
    })();
  }, []);

  const lic = avaliarLicenca(perfil.empresa);
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div>
      <div className="mb-[22px]">
        <h1 className="mb-1 text-[27px] font-extrabold">Visão geral</h1>
        <div className="text-tinta-3">
          {perfil.empresa.nome} · {hoje}
        </div>
      </div>

      <div className="mb-3.5 grid grid-cols-4 gap-3.5">
        <Cartao className="col-span-2 px-5 py-[18px]">
          <div className="rotulo mb-2.5">ASSINATURA</div>
          <div className="mb-1.5 text-[20px] font-extrabold">{lic.titulo}</div>
          <div className="mb-3.5 text-tinta-3">{lic.detalhe}</div>
          <Link
            href="/painel/assinatura"
            className="inline-block rounded-controle bg-marca px-3.5 py-2.5 text-[13px] font-medium text-white transition hover:bg-marca-hover"
          >
            Ver assinatura
          </Link>
        </Cartao>

        <Cartao className="px-5 py-[18px]">
          <div className="rotulo mb-2.5">ASSENTOS USADOS</div>
          <div className="text-[30px] font-extrabold">
            {usuarios.filter((u) => u.ativo).length} de {perfil.empresa.assentos}
          </div>
          <Link href="/painel/usuarios" className="mt-2.5 inline-block font-medium text-marca">
            Gerenciar usuários
          </Link>
        </Cartao>

        <Cartao className="px-5 py-[18px]">
          <div className="rotulo mb-2.5">MENSAGENS PUBLICADAS</div>
          <div className="text-[30px] font-extrabold">{totalMensagens}</div>
          <Link href="/painel/mensagens" className="mt-2.5 inline-block font-medium text-marca">
            Ver acervo
          </Link>
        </Cartao>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <Cartao className="px-5 py-[18px]">
          <div className="mb-3.5 flex items-baseline justify-between">
            <div className="rotulo">PASTAS DA EMPRESA</div>
            <Link href="/painel/pastas" className="font-medium text-marca">
              Ver todas
            </Link>
          </div>
          <div className="mb-3 text-[30px] font-extrabold">
            {pastas.length} {pastas.length === 1 ? 'pasta' : 'pastas'}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pastas.slice(0, 5).map((p) => (
              <Chip key={p.id} nome={p.nome} cor={p.cor} />
            ))}
            {pastas.length > 5 && (
              <span className="rounded-chip bg-linha px-2.5 py-[3px] text-[12px] font-medium text-tinta-3">
                +{pastas.length - 5}
              </span>
            )}
          </div>
        </Cartao>

        <Cartao className="px-5 py-[18px]">
          <div className="rotulo mb-3.5">QUEM USOU A EXTENSÃO NOS ÚLTIMOS 7 DIAS</div>
          <div className="flex flex-col">
            {usuarios.slice(0, 5).map((u, i) => (
              <div
                key={u.id}
                className={`flex items-center gap-2.5 py-2.5 ${i < usuarios.length - 1 ? 'border-b border-linha' : ''}`}
              >
                <div
                  className={`grid h-[26px] w-[26px] place-items-center rounded-lg text-[11px] font-extrabold ${
                    u.ultimo_acesso ? 'bg-marca-suave text-marca' : 'bg-linha text-tinta-4'
                  }`}
                >
                  {iniciais(u.nome)}
                </div>
                <span className={u.ultimo_acesso ? 'font-medium' : 'text-tinta-3'}>{u.nome}</span>
                <span className={`ml-auto ${u.ultimo_acesso ? 'text-tinta-3' : 'text-tinta-4'}`}>
                  {u.ultimo_acesso ? formatarData(u.ultimo_acesso) : 'não usou'}
                </span>
              </div>
            ))}
            {usuarios.length === 0 && <span className="py-4 text-tinta-3">Nenhum usuário ainda.</span>}
          </div>
        </Cartao>
      </div>

      <div className="mt-3.5 flex items-center gap-3 rounded-cartao border border-borda bg-[#F0F1FB] px-[18px] py-3.5 leading-relaxed text-tinta-3">
        <span className="text-[16px] text-marca">⚡</span>
        As conversas e os arquivos recebidos ficam apenas no computador de cada usuário. Aqui sincronizam somente
        configurações, mensagens padrão e pastas.
      </div>
    </div>
  );
}
