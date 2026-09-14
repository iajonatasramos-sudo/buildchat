# Índice das migrações

As trinta e três migrações desta pasta, em ordem, com o que cada uma resolve.
Todas são reaplicáveis do zero, quantas vezes for preciso.

| Arquivo | O que faz |
|---|---|
| `0001_schema.sql` | schema base (multiempresa) |
| `0002_rls.sql` | Row Level Security (isolamento entre empresas) |
| `0003_supabase_auth.sql` | integração com o Supabase Auth e onboarding |
| `0004_storage.sql` | Storage das mídias das respostas rápidas |
| `0005_assentos.sql` | limite de assentos garantido no banco |
| `0006_equipes_contatos.sql` | equipes, visibilidade das mensagens padrão e ficha do contato |
| `0007_visibilidade_explicita.sql` | visibilidade explícita das mensagens/pastas da empresa |
| `0008_operador_sistema.sql` | painel do gestor do sistema (dono do produto) |
| `0009_vendas.sql` | controle comercial (assinaturas e faturas) |
| `0010_planos.sql` | níveis de cliente: Start → Pro → Master |
| `0011_integracoes.sql` | integrações externas (APIs) administradas pelo gestor |
| `0012_cadastro_empresa.sql` | cadastro de empresa pelo gestor e novos ciclos de assinatura |
| `0013_integracao_escopo.sql` | mudar o escopo de uma integração já cadastrada |
| `0014_pastas_da_equipe.sql` | pasta/etiqueta é da equipe inteira, em qualquer plano |
| `0015_propostas.sql` | propostas geradas pela extensão |
| `0016_contato_telefone.sql` | telefone real do contato |
| `0017_usuario_numeros.sql` | com quais números de WhatsApp cada usuário conectou |
| `0018_perfil_operador.sql` | perfil do gestor do sistema |
| `0019_teste_7_dias.sql` | conta de teste por 7 dias |
| `0020_pastas_padrao_e_pessoais.sql` | pastas padrão (do admin) e pastas pessoais (de cada usuário) |
| `0021_contato_compartilhado.sql` | compartilhamento por contato |
| `0022_categoria_acompanha_mensagem.sql` | categoria acompanha a mensagem publicada |
| `0023_compartilhamento_por_item.sql` | compartilhamento por item, tudo compartilhado por padrão |
| `0024_contato_da_empresa.sql` | as informações são DO CONTATO na empresa, não do número que atendeu |
| `0025_anotacao_do_autor.sql` | anotação: quem escreveu (ou o admin) é quem edita e apaga |
| `0026_marca_do_produto.sql` | duas marcas, o mesmo sistema |
| `0027_agenda.sql` | agenda da clínica |
| `0028_agenda_por_equipe.sql` | a agenda enxerga até onde vai a equipe |
| `0029_agenda_etiqueta.sql` | etiqueta na atividade da agenda |
| `0030_acesso_recursos.sql` | quem enxerga cada função da extensão |
| `0031_departamento.sql` | anotações e etiquetas ficam no departamento |
| `0032_agenda_do_autor.sql` | o compromisso é de quem marcou |
| `0033_acao_pasta.sql` | ações de pasta na sequência da mensagem rápida |
