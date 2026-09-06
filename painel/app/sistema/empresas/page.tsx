'use client';

// Todas as clínicas: cadastro, situação da assinatura, uso e ações comerciais.

import { useCallback, useEffect, useState } from 'react';
import { formatarData, formatarDia, moeda, supabase } from '@/lib/supabase';
import { Botao, Cabecalho, CampoSenha, CampoTexto, Cartao, Modal, Vazio } from '@/componentes/ui';

type Ciclo = 'mensal' | 'trimestral' | 'anual' | 'vitalicio';
type Status = 'trial' | 'ativa' | 'inadimplente' | 'cancelada';

type Empresa = {
  id: string;
  nome: string;
  plano: string;
  status: Status;
  trial_ate: string | null;
  assentos: number;
  usuarios_ativos: number;
  admin_email: string | null;
  mensagens: number;
  pastas: number;
  contatos: number;
  ultimo_acesso: string | null;
  criado_em: string;
  valor_mensal_centavos: number;
  ciclo: Ciclo;
  proxima_cobranca: string | null;
  observacao: string | null;
  faturas_abertas: number;
  aberto_centavos: number;
  plano_slug: 'start' | 'pro' | 'master';
};

type Plano = { slug: string; nome: string; preco_mensal_centavos: number; assentos_inclusos: number };

const CORES: Record<Status, string> = {
  ativa: 'bg-sucesso-fundo text-sucesso',
  trial: 'bg-marca-suave text-marca-hover',
  inadimplente: 'bg-alerta-fundo text-alerta',
  cancelada: 'bg-linha text-tinta-3',
};
const ROTULOS: Record<Status, string> = {
  ativa: 'Ativa',
  trial: 'Teste',
  inadimplente: 'Inadimplente',
  cancelada: 'Cancelada',
};

/** Tipos de assinatura. `meses` = quantos meses o valor cobre (0 = pagamento único). */
const CICLOS: { valor: Ciclo; rotulo: string; campo: string; meses: number }[] = [
  { valor: 'mensal', rotulo: 'Mensal', campo: 'Valor mensal (R$)', meses: 1 },
  { valor: 'trimestral', rotulo: 'Trimestral', campo: 'Valor do trimestre (R$)', meses: 3 },
  { valor: 'anual', rotulo: 'Anual', campo: 'Valor do ano (R$)', meses: 12 },
  { valor: 'vitalicio', rotulo: 'Vitalício', campo: 'Valor único (R$)', meses: 0 },
];
const cicloDe = (c: Ciclo) => CICLOS.find((x) => x.valor === c) ?? CICLOS[0];

const emReais = (centavos: number) => (centavos / 100).toFixed(2).replace('.', ',');
const emCentavos = (texto: string) =>
  texto.trim() ? Math.round(Number(texto.replace(/\./g, '').replace(',', '.')) * 100) : null;

export default function EmpresasSistema() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [criando, setCriando] = useState(false);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    const [{ data }, { data: pl }] = await Promise.all([
      supabase.rpc('sistema_empresas'),
      supabase.from('planos').select('slug, nome, preco_mensal_centavos, assentos_inclusos').eq('ativo', true).order('ordem'),
    ]);
    setEmpresas((data as Empresa[]) ?? []);
    setPlanos((pl as Plano[]) ?? []);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const lista = empresas.filter((e) => {
    const q = busca.trim().toLowerCase();
    return !q || e.nome.toLowerCase().includes(q) || (e.admin_email ?? '').toLowerCase().includes(q);
  });

  return (
    <div>
      <Cabecalho
        titulo="Empresas"
        subtitulo={`${empresas.length} clínica(s) usando o BuildChat.`}
        acao={<Botao onClick={() => setCriando(true)}>Nova clínica</Botao>}
      />

      {empresas.length === 0 ? (
        <Vazio
          titulo="Nenhuma clínica ainda"
          texto="Cadastre a primeira aqui ou espere alguém criar a conta pelo site."
          acao={<Botao onClick={() => setCriando(true)}>Nova clínica</Botao>}
        />
      ) : (
        <>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail do administrador"
            className="mb-3.5 h-10 w-full max-w-[420px] rounded-controle border border-borda bg-white px-3.5 text-[13.5px] outline-none focus:border-marca"
          />

          <Cartao className="overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-fundo text-left">
                  {['CLÍNICA', 'SITUAÇÃO', 'ASSENTOS', 'ASSINATURA', 'COBRANÇA', 'ÚLTIMO USO', ''].map((h) => (
                    <th key={h} className="rotulo border-b border-borda px-[18px] py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => {
                  const dias = e.trial_ate
                    ? Math.ceil((new Date(e.trial_ate).getTime() - Date.now()) / 86400000)
                    : null;
                  return (
                    <tr key={e.id}>
                      <td className="border-b border-linha px-[18px] py-3.5">
                        <div className="font-medium">{e.nome}</div>
                        <div className="text-[12px] text-tinta-4">{e.admin_email ?? 'sem admin'}</div>
                      </td>
                      <td className="border-b border-linha px-[18px] py-3.5">
                        <span className={`rounded-chip px-2 py-[3px] text-[12px] font-medium ${CORES[e.status]}`}>
                          {ROTULOS[e.status]}
                        </span>
                        {e.status === 'trial' && dias !== null && (
                          <div className="mt-1 text-[12px] text-tinta-4">
                            {dias > 0 ? `${dias} dia(s)` : 'expirado'}
                          </div>
                        )}
                        <div className="mt-0.5">
                          <span className="rounded-chip bg-linha px-2 py-[2px] text-[11.5px] font-bold uppercase tracking-wide text-tinta-2">
                            {e.plano_slug}
                          </span>
                        </div>
                      </td>
                      <td className="border-b border-linha px-[18px] py-3.5">
                        <span className="font-medium">{e.usuarios_ativos}</span>
                        <span className="text-tinta-4"> / {e.assentos}</span>
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5">
                        {e.valor_mensal_centavos > 0 ? (
                          <>
                            <span className="font-medium">{moeda(e.valor_mensal_centavos)}</span>
                            <div className="text-[12px] text-tinta-4">{cicloDe(e.ciclo).rotulo}</div>
                          </>
                        ) : (
                          <span className="text-tinta-4">sem valor</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-tinta-3">
                        {e.ciclo === 'vitalicio' ? (
                          <span className="text-tinta-4">não recorre</span>
                        ) : (
                          formatarDia(e.proxima_cobranca)
                        )}
                        {e.faturas_abertas > 0 && (
                          <div className="text-[12px] font-medium text-alerta">
                            {moeda(e.aberto_centavos)} em aberto
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-tinta-3">
                        {e.ultimo_acesso ? formatarData(e.ultimo_acesso) : <span className="text-tinta-4">nunca</span>}
                        <div className="text-[12px] text-tinta-4">
                          {e.mensagens} msg · {e.contatos} contatos
                        </div>
                      </td>
                      <td className="border-b border-linha px-[18px] py-3.5 text-right">
                        <button onClick={() => setEditando(e)} className="font-medium text-marca">
                          Gerenciar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Cartao>
        </>
      )}

      {criando && (
        <NovaEmpresaModal
          planos={planos}
          onFechar={() => setCriando(false)}
          onPronto={() => {
            setCriando(false);
            carregar();
          }}
        />
      )}

      {editando && (
        <GerenciarModal
          planos={planos}
          empresa={editando}
          onFechar={() => setEditando(null)}
          onPronto={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

// ────────────────────────────── Cadastro ──────────────────────────────

function NovaEmpresaModal({
  planos,
  onFechar,
  onPronto,
}: {
  planos: Plano[];
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [nome, setNome] = useState('');
  const [planoSlug, setPlanoSlug] = useState('start');
  const [status, setStatus] = useState<'trial' | 'ativa'>('trial');
  const [trialDias, setTrialDias] = useState('14');
  const [ciclo, setCiclo] = useState<Ciclo>('mensal');
  const [valor, setValor] = useState('');
  const [valorTocado, setValorTocado] = useState(false);
  const [adminNome, setAdminNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState(senhaSugerida());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  const plano = planos.find((p) => p.slug === planoSlug);
  const info = cicloDe(ciclo);

  // Enquanto o gestor não digitar um valor próprio, sugerimos o de tabela:
  // preço do plano × meses do ciclo (o vitalício vale 12 meses de referência).
  const sugerido = plano ? plano.preco_mensal_centavos * (info.meses || 12) : 0;
  const valorExibido = valorTocado ? valor : sugerido ? emReais(sugerido) : '';

  async function criar() {
    setSalvando(true);
    setErro(null);

    // O signUp troca a sessão do navegador pela da conta nova — guardamos a do
    // gestor antes e voltamos a ser ele para chamar a RPC do sistema.
    const { data: antes } = await supabase.auth.getSession();
    const { data: novo, error: erroAuth } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password: senha,
    });
    if (antes.session) await supabase.auth.setSession(antes.session);

    if (erroAuth || !novo.user) {
      setErro(traduzir(erroAuth?.message ?? 'Não consegui criar o acesso do administrador.'));
      setSalvando(false);
      return;
    }

    const { error } = await supabase.rpc('sistema_criar_empresa', {
      p_nome: nome.trim(),
      p_admin_id: novo.user.id,
      p_admin_nome: adminNome.trim(),
      p_admin_email: email.trim().toLowerCase(),
      p_plano: planoSlug,
      p_status: status,
      p_trial_dias: Number(trialDias) || 14,
      p_ciclo: ciclo,
      p_valor_centavos: emCentavos(valorExibido),
    });

    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setPronto(true);
  }

  if (pronto) {
    return (
      <Modal titulo="Clínica cadastrada" onFechar={onPronto}>
        <div className="flex flex-col gap-4">
          <p className="leading-relaxed text-tinta-3">
            Entregue estas credenciais para o responsável da <strong>{nome}</strong>. Com elas ele entra na extensão e
            no painel da clínica, e já pode cadastrar a equipe.
          </p>
          <div className="flex flex-col gap-2 rounded-controle border border-borda bg-fundo p-4 font-mono text-[13px]">
            <div>
              <span className="text-tinta-4">e-mail:</span> {email}
            </div>
            <div>
              <span className="text-tinta-4">senha:</span> {senha}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Botao
              variante="secundario"
              onClick={() =>
                navigator.clipboard.writeText(
                  `BuildChat — ${nome}\nPainel: https://chat.buildclinic.com.br/entrar\nE-mail: ${email}\nSenha: ${senha}`,
                )
              }
            >
              Copiar
            </Botao>
            <Botao onClick={onPronto}>Concluir</Botao>
          </div>
        </div>
      </Modal>
    );
  }

  const valido = nome.trim().length >= 2 && adminNome.trim().length >= 2 && email.includes('@') && senha.length >= 6;

  return (
    <Modal titulo="Nova clínica" onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <CampoTexto rotulo="Nome da clínica" valor={nome} onChange={setNome} placeholder="Odonto Sorriso" />

        <label className="flex flex-col gap-1.5 font-medium">
          Nível do cliente
          <select
            value={planoSlug}
            onChange={(e) => setPlanoSlug(e.target.value)}
            className="campo focus:campo-foco font-normal"
          >
            {planos.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.nome} — {moeda(p.preco_mensal_centavos)}/mês · {p.assentos_inclusos} assentos
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 font-medium">
            Situação
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'trial' | 'ativa')}
              className="campo focus:campo-foco font-normal"
            >
              <option value="trial">Teste grátis</option>
              <option value="ativa">Ativa (pagante)</option>
            </select>
          </label>
          {status === 'trial' ? (
            <label className="flex flex-col gap-1.5 font-medium">
              Dias de teste
              <input
                type="number"
                min={1}
                value={trialDias}
                onChange={(e) => setTrialDias(e.target.value)}
                className="campo focus:campo-foco font-normal"
              />
            </label>
          ) : (
            <div />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 font-medium">
            Tipo de assinatura
            <select
              value={ciclo}
              onChange={(e) => setCiclo(e.target.value as Ciclo)}
              className="campo focus:campo-foco font-normal"
            >
              {CICLOS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 font-medium">
            {info.campo}
            <input
              value={valorExibido}
              onChange={(e) => {
                setValorTocado(true);
                setValor(e.target.value);
              }}
              placeholder="297,00"
              className="campo focus:campo-foco font-normal"
            />
          </label>
        </div>

        <p className="text-[12.5px] leading-relaxed text-tinta-4">
          {status === 'trial'
            ? 'Em teste grátis a clínica usa os recursos do Pro até o prazo acabar; a cobrança só começa quando você marcar como ativa.'
            : ciclo === 'vitalicio'
              ? 'Pagamento único: não entra no MRR e não gera próxima cobrança.'
              : `A primeira cobrança fica agendada para daqui a ${info.meses} mês(es).`}
        </p>

        <div className="border-t border-linha pt-4 text-[12.5px] font-bold uppercase tracking-wide text-tinta-4">
          Administrador da clínica
        </div>

        <CampoTexto rotulo="Nome do responsável" valor={adminNome} onChange={setAdminNome} placeholder="Dra. Kelly Souza" />
        <CampoTexto
          rotulo="E-mail"
          tipo="email"
          valor={email}
          onChange={setEmail}
          placeholder="kelly@odontosorriso.com.br"
          dica="Será o login dele no painel e na extensão."
        />
        <CampoSenha valor={senha} onChange={setSenha} onGerar={() => setSenha(senhaSugerida())} />

        {erro && (
          <p className="rounded-controle border border-perigo-borda bg-perigo-fundo px-3 py-2 text-[12.5px] text-perigo">
            {erro}
          </p>
        )}

        <div className="flex justify-end gap-2.5">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao onClick={criar} desabilitado={salvando || !valido}>
            {salvando ? 'Cadastrando…' : 'Cadastrar clínica'}
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── Gerenciamento ──────────────────────────

function GerenciarModal({
  empresa,
  planos,
  onFechar,
  onPronto,
}: {
  empresa: Empresa;
  planos: Plano[];
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [status, setStatus] = useState(empresa.status);
  const [planoSlug, setPlanoSlug] = useState(empresa.plano_slug);
  const [ajustarAssentos, setAjustarAssentos] = useState(false);
  const [assentos, setAssentos] = useState(String(empresa.assentos));
  const [valor, setValor] = useState(empresa.valor_mensal_centavos ? emReais(empresa.valor_mensal_centavos) : '');
  const [ciclo, setCiclo] = useState<Ciclo>(empresa.ciclo);
  const [proxima, setProxima] = useState(empresa.proxima_cobranca ?? '');
  const [observacao, setObservacao] = useState(empresa.observacao ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const menosQueUsados = Number(assentos) < empresa.usuarios_ativos;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    if (planoSlug !== empresa.plano_slug || ajustarAssentos) {
      const { error: erroPlano } = await supabase.rpc('sistema_definir_plano', {
        p_empresa: empresa.id,
        p_plano: planoSlug,
        p_ajustar_assentos: ajustarAssentos,
      });
      if (erroPlano) {
        setErro(erroPlano.message);
        setSalvando(false);
        return;
      }
    }
    const { error } = await supabase.rpc('sistema_atualizar_empresa', {
      p_empresa: empresa.id,
      p_status: status,
      p_plano: null,
      p_assentos: ajustarAssentos ? null : Number(assentos) || null,
      p_trial_ate: null,
    });
    const { error: erroComercial } = await supabase.rpc('sistema_definir_comercial', {
      p_empresa: empresa.id,
      p_valor_centavos: emCentavos(valor),
      p_ciclo: ciclo,
      p_proxima: proxima || null,
      p_observacao: observacao.trim() || null,
    });
    setSalvando(false);
    if (error || erroComercial) {
      setErro((error ?? erroComercial)!.message);
      return;
    }
    onPronto();
  }

  return (
    <Modal titulo={empresa.nome} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 font-medium">
          Situação da assinatura
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="campo focus:campo-foco font-normal"
          >
            <option value="trial">Teste grátis</option>
            <option value="ativa">Ativa (pagante)</option>
            <option value="inadimplente">Inadimplente</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 font-medium">
          Nível do cliente
          <select
            value={planoSlug}
            onChange={(e) => {
              setPlanoSlug(e.target.value as Empresa['plano_slug']);
              setAjustarAssentos(true);
            }}
            className="campo focus:campo-foco font-normal"
          >
            {planos.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.nome} — {moeda(p.preco_mensal_centavos)}/mês · {p.assentos_inclusos} assentos
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[12.5px] font-normal text-tinta-3">
            <input
              type="checkbox"
              checked={ajustarAssentos}
              onChange={(e) => setAjustarAssentos(e.target.checked)}
            />
            Aplicar os assentos do plano
          </label>
        </label>

        <label className="flex flex-col gap-1.5 font-medium">
          Assentos contratados
          <input
            type="number"
            min={1}
            value={assentos}
            onChange={(e) => setAssentos(e.target.value)}
            className="campo focus:campo-foco font-normal"
          />
          <span className="text-[12.5px] font-normal text-tinta-4">
            {empresa.usuarios_ativos} usuário(s) ativo(s) hoje.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 font-medium">
            Tipo de assinatura
            <select
              value={ciclo}
              onChange={(e) => setCiclo(e.target.value as Ciclo)}
              className="campo focus:campo-foco font-normal"
            >
              {CICLOS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 font-medium">
            {cicloDe(ciclo).campo}
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="297,00"
              className="campo focus:campo-foco font-normal"
            />
          </label>
        </div>

        {ciclo === 'vitalicio' ? (
          <p className="text-[12.5px] leading-relaxed text-tinta-4">
            Vitalício é pagamento único: não entra no MRR e a próxima cobrança é limpa ao salvar.
          </p>
        ) : (
          <label className="flex flex-col gap-1.5 font-medium">
            Próxima cobrança
            <input
              type="date"
              value={proxima}
              onChange={(e) => setProxima(e.target.value)}
              className="campo focus:campo-foco font-normal"
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5 font-medium">
          Observação comercial
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="Ex.: fechado com 10% de desconto, indicação da Dra. Kelly"
            className="campo focus:campo-foco resize-none font-normal"
          />
        </label>

        {menosQueUsados && (
          <p className="rounded-controle border border-alerta-borda bg-alerta-fundo px-3 py-2 text-[12.5px] leading-relaxed text-alerta">
            A clínica tem mais usuários ativos do que assentos. Ninguém é desativado automaticamente —
            só não conseguirão cadastrar novas pessoas.
          </p>
        )}

        {erro && (
          <p className="rounded-controle border border-perigo-borda bg-perigo-fundo px-3 py-2 text-[12.5px] text-perigo">
            {erro}
          </p>
        )}

        <div className="flex justify-end gap-2.5">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao onClick={salvar} desabilitado={salvando}>
            Salvar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function senhaSugerida(): string {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 10 }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
}

function traduzir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) return 'Este e-mail já tem conta.';
  if (m.includes('rate limit')) return 'Muitos cadastros seguidos. Aguarde alguns minutos.';
  if (m.includes('password')) return 'Senha muito curta (mínimo 6 caracteres).';
  if (m.includes('invalid')) return 'E-mail inválido.';
  return msg;
}
