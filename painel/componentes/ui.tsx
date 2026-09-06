'use client';

// Peças reutilizadas nas telas do painel (retiradas da página de estilo do protótipo).

export function Cabecalho({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end gap-4">
      <div>
        <h1 className="mb-1 text-[27px] font-extrabold">{titulo}</h1>
        {subtitulo && <div className="text-tinta-3">{subtitulo}</div>}
      </div>
      {acao && <div className="ml-auto">{acao}</div>}
    </div>
  );
}

export function Botao({
  children,
  onClick,
  variante = 'principal',
  tipo = 'button',
  desabilitado,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variante?: 'principal' | 'secundario' | 'perigo';
  tipo?: 'button' | 'submit';
  desabilitado?: boolean;
}) {
  const estilos = {
    principal: 'bg-marca text-white hover:bg-marca-hover',
    secundario: 'bg-white text-tinta-2 border border-borda-forte hover:border-marca hover:text-marca',
    perigo: 'bg-white text-perigo border border-[#F0C9C9] hover:bg-[#FEF2F2]',
  }[variante];
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={desabilitado}
      className={`rounded-controle px-[18px] py-[11px] text-[13.5px] font-semibold transition disabled:opacity-50 ${estilos}`}
    >
      {children}
    </button>
  );
}

export function Chip({ nome, cor }: { nome: string; cor: string }) {
  return (
    <span className="rounded-chip px-2.5 py-[3px] text-[12px] font-medium text-white" style={{ background: cor }}>
      {nome}
    </span>
  );
}

export function Cartao({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`cartao ${className}`}>{children}</div>;
}

export function Modal({
  titulo,
  onFechar,
  children,
}: {
  titulo: string;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4" onClick={onFechar}>
      <div className="cartao w-full max-w-[440px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-borda px-5 py-4">
          <h3 className="text-[16px] font-extrabold">{titulo}</h3>
          <button onClick={onFechar} className="text-tinta-4 hover:text-tinta">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: React.ReactNode }) {
  return (
    <div className="cartao px-8 py-16 text-center">
      <div className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-cartao bg-marca-suave text-[20px] text-marca">
        ⚡
      </div>
      <div className="mb-1.5 text-[17px] font-extrabold">{titulo}</div>
      <p className="mx-auto mb-5 max-w-[420px] leading-relaxed text-tinta-3">{texto}</p>
      {acao}
    </div>
  );
}

/**
 * Senha com o botão "Gerar" ao lado. O botão fica na MESMA linha do input
 * (flex com stretch iguala as alturas) e a dica desce por baixo dos dois —
 * pendurar o botão no CampoTexto o desalinhava, porque a dica entra no meio.
 */
export function CampoSenha({
  valor,
  onChange,
  onGerar,
  rotulo = 'Senha',
  dica = 'Mínimo 6 caracteres.',
}: {
  valor: string;
  onChange: (v: string) => void;
  onGerar: () => void;
  rotulo?: string;
  dica?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 font-medium">
      <label className="flex flex-col gap-1.5">
        {rotulo}
        <span className="flex gap-2">
          <input
            value={valor}
            onChange={(e) => onChange(e.target.value)}
            className="campo focus:campo-foco min-w-0 flex-1 font-normal"
          />
          <Botao variante="secundario" onClick={onGerar}>
            Gerar
          </Botao>
        </span>
      </label>
      {dica && <span className="text-[12.5px] font-normal text-tinta-4">{dica}</span>}
    </div>
  );
}

export function CampoTexto({
  rotulo,
  valor,
  onChange,
  tipo = 'text',
  placeholder,
  dica,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  tipo?: string;
  placeholder?: string;
  dica?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 font-medium">
      {rotulo}
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="campo focus:campo-foco font-normal"
      />
      {dica && <span className="text-[12.5px] font-normal text-tinta-4">{dica}</span>}
    </label>
  );
}
