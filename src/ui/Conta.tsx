// Entrar / criar conta da clínica + estado da conta na barra do topo.

import { useEffect, useState } from 'react';
import {
  AlertCircle, ArrowRight, Building2, Check, Eye, EyeOff, Loader2, Lock, LogOut,
  Mail, ShieldAlert, ShieldCheck, User, X, Zap,
} from 'lucide-react';
import { cn, emPx } from '@/lib/utils';
import { ALTURA_TOPBAR } from './TopBar';
import { avaliarLicenca, cadastrar, carregarPerfil, entrar, sair, type Perfil } from '@/lib/auth';
import { servidorConfigurado } from '@/lib/config';
import { modalConta, perfilAtual } from '@/lib/store';
import { toast } from './toast';

/** Botão/estado da conta, mostrado no canto direito da barra do topo. */
export function ContaBotao() {
  const [perfil, setPerfil] = useState<Perfil | null>(perfilAtual.get());
  const [menu, setMenu] = useState(false);

  useEffect(() => perfilAtual.subscribe(setPerfil), []);

  if (!servidorConfigurado()) return null;

  if (!perfil) {
    return (
      <button
        type="button"
        onClick={() => modalConta.set(true)}
        className="flex-shrink-0 rounded-md border border-brand px-2.5 py-0.5 text-[11.5px] font-bold text-brand transition hover:bg-brand hover:text-white"
      >
        Entrar
      </button>
    );
  }

  const lic = avaliarLicenca(perfil);
  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        title={`${perfil.nome} — ${perfil.empresa.nome}`}
        className="flex items-center gap-1.5 rounded-md px-2 py-0.5 transition hover:bg-surface-2"
      >
        <span className="grid h-5 w-5 place-items-center rounded-md bg-brand text-[10px] font-bold text-white">
          {perfil.nome.slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[140px] truncate text-[11.5px] font-semibold">{perfil.empresa.nome}</span>
        <span
          className={cn(
            'rounded-md px-1.5 text-[9.5px] font-bold',
            lic.ativa ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger',
          )}
        >
          {lic.rotulo}
        </span>
      </button>

      {menu && (
        <div
          className="bc-anim-pop absolute right-0 top-full z-[70] mt-1 w-56 overflow-hidden rounded-md border border-border bg-surface shadow-lg"
          onMouseLeave={() => setMenu(false)}
        >
          <div className="border-b border-border px-3 py-2">
            <div className="truncate text-[12.5px] font-bold">{perfil.nome}</div>
            <div className="truncate text-[11px] text-muted">{perfil.email}</div>
            <div className="mt-1 text-[10.5px] text-muted">
              {perfil.papel === 'admin' ? 'Administrador' : 'Usuário'} · {perfil.empresa.nome}
            </div>
          </div>
          {!lic.ativa && (
            <div className="flex items-start gap-1.5 border-b border-border bg-danger/10 px-3 py-2 text-[11px] text-danger">
              <ShieldAlert size={13} className="mt-0.5 flex-shrink-0" />
              {lic.rotulo}. A sincronização fica pausada até a regularização.
            </div>
          )}
          <button
            type="button"
            onClick={async () => {
              await sair();
              perfilAtual.set(null);
              setMenu(false);
              toast.success('Você saiu da conta.');
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition hover:bg-surface-2"
          >
            <LogOut size={13} /> Sair
          </button>
        </div>
      )}
    </div>
  );
}

/** Modal de entrar / criar conta. */
export function ContaModal() {
  const [aba, setAba] = useState<'entrar' | 'criar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [empresa, setEmpresa] = useState('');
  const [nome, setNome] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fechar = () => modalConta.set(false);
  const criando = aba === 'criar';
  const podeEnviar =
    !carregando && /\S+@\S+\.\S+/.test(email) && senha.length >= 6 &&
    (!criando || (empresa.trim().length > 1 && nome.trim().length > 1));

  async function enviar() {
    if (!podeEnviar) return;
    setErro(null);
    setCarregando(true);
    const res = criando ? await cadastrar(empresa, nome, email, senha) : await entrar(email, senha);
    if (!res.ok) {
      setErro(res.erro);
      setCarregando(false);
      return;
    }
    const perfil = await carregarPerfil();
    perfilAtual.set(perfil);
    setCarregando(false);
    fechar();
    toast.success(
      perfil
        ? `Bem-vindo, ${perfil.nome.split(' ')[0]}.`
        : 'Conta criada. Confirme o e-mail e entre — sua clínica será criada no primeiro login.',
    );
  }

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-[70] flex items-center justify-center bg-text/50 p-4 backdrop-blur-[2px]"
      style={{ top: emPx(ALTURA_TOPBAR) }}
      onClick={fechar}
    >
      <div
        className="bc-anim-pop flex max-h-full w-full max-w-[380px] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Enter' && enviar()}
      >
        {/* Cabeçalho com a marca */}
        <div className="relative flex-shrink-0 overflow-hidden px-5 pb-3.5 pt-4" style={{ background: 'linear-gradient(135deg, var(--brand) 0%, var(--brand-400) 100%)' }}>
          <button
            type="button"
            onClick={fechar}
            className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md text-white/70 transition hover:bg-white/15 hover:text-white"
          >
            <X size={15} />
          </button>
          <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-md bg-white/15 px-2 py-1 text-[11px] font-bold text-white">
            <Zap size={12} /> BuildChat
          </div>
          <h3 className="text-[19px] font-extrabold leading-tight tracking-tight text-white">
            {criando ? 'Criar conta da clínica' : 'Entrar na sua conta'}
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-white/80">
            {criando
              ? '14 dias grátis, sem cartão de crédito.'
              : 'Entre com o e-mail e a senha que a clínica cadastrou para você.'}
          </p>
        </div>

        {/* Alternância */}
        <div className="flex flex-shrink-0 gap-0.5 border-b border-border bg-surface-2 p-1">
          <Aba ativa={!criando} onClick={() => { setAba('entrar'); setErro(null); }}>Já tenho conta</Aba>
          <Aba ativa={criando} onClick={() => { setAba('criar'); setErro(null); }}>Criar clínica</Aba>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
          {criando && (
            <>
              <Campo label="Nome da clínica" Icone={Building2} valor={empresa} onChange={setEmpresa} placeholder="Clínica Carvalho" autoFoco />
              <Campo label="Seu nome" Icone={User} valor={nome} onChange={setNome} placeholder="Dra. Kelly Carvalho" />
            </>
          )}
          <Campo label="E-mail" Icone={Mail} valor={email} onChange={setEmail} tipo="email" placeholder="voce@clinica.com.br" autoFoco={aba === 'entrar'} />
          <Campo
            label="Senha"
            Icone={Lock}
            valor={senha}
            onChange={setSenha}
            tipo={verSenha ? 'text' : 'password'}
            placeholder="mínimo 6 caracteres"
            acao={{ Icone: verSenha ? EyeOff : Eye, onClick: () => setVerSenha((v) => !v), titulo: verSenha ? 'Ocultar senha' : 'Mostrar senha' }}
          />

          {erro && (
            <p className="flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-[12px] text-danger">
              <AlertCircle size={14} className="mt-px flex-shrink-0" /> {erro}
            </p>
          )}

          <button
            type="button"
            onClick={enviar}
            disabled={!podeEnviar}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-2.5 text-[13.5px] font-bold text-white shadow-md transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {carregando ? <Loader2 size={15} className="animate-spin" /> : null}
            {criando ? 'Começar teste grátis' : 'Entrar'}
            {!carregando && aba === 'entrar' && <ArrowRight size={15} />}
          </button>

          {criando && (
            <ul className="space-y-1.5 pt-0.5">
              {[
                'Mensagens rápidas e pastas em todos os seus computadores',
                'Acervo compartilhado com a equipe da clínica',
                'Suas conversas nunca saem do seu computador',
              ].map((t) => (
                <li key={t} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-text-2">
                  <Check size={13} className="mt-px flex-shrink-0 text-success" /> {t}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5 border-t border-border bg-surface-2 px-4 py-2 text-[10.5px] text-muted">
          <ShieldCheck size={13} className="flex-shrink-0 text-success" />
          Conversas e arquivos recebidos ficam apenas neste computador.
        </div>
      </div>
    </div>
  );
}

function Aba({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md px-2.5 py-1.5 text-[12px] font-bold transition',
        ativa ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-text-2',
      )}
    >
      {children}
    </button>
  );
}

function Campo({
  label, valor, onChange, tipo = 'text', placeholder, Icone, acao, autoFoco,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  tipo?: string;
  placeholder?: string;
  Icone: typeof Mail;
  acao?: { Icone: typeof Eye; onClick: () => void; titulo: string };
  autoFoco?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <span className="relative block">
        <Icone size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          autoFocus={autoFoco}
          type={tipo}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            'h-9 w-full rounded-md border border-border-strong bg-surface pl-8 text-[13px] outline-none transition',
            'focus:border-brand focus:ring-2 focus:ring-brand/25',
            acao ? 'pr-9' : 'pr-2.5',
          )}
        />
        {acao && (
          <button
            type="button"
            title={acao.titulo}
            onClick={acao.onClick}
            className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-text-2"
          >
            <acao.Icone size={14} />
          </button>
        )}
      </span>
    </label>
  );
}
