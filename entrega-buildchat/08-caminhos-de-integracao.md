# 8. Caminhos para integrar com a BuildClinic

O pedido do Jonatas é que o BuildChat fique "100% integrado" à BuildClinic. Essa frase comporta
três profundidades muito diferentes de trabalho. Este documento existe para a escolha ser
consciente.

O ponto de partida: **hoje a extensão não precisa de nada além do que já tem para funcionar.**
Qualquer integração é um ganho, não um conserto.

---

## Caminho 1 — Login único

**O que muda.** A pessoa entra com a conta da BuildClinic; não há cadastro separado.

**Como fazer.** A extensão guarda a sessão no armazenamento dela e já sabe repassá-la ao
painel por um fragmento na URL, o mesmo mecanismo dos links mágicos. O caminho inverso é
equivalente: a BuildClinic devolve um token que a extensão guarda.

Se o Supabase continuar sendo o banco do BuildChat, dá para manter os dois mundos com o mesmo
login usando um provedor de identidade comum, ou criando o usuário nos dois lugares no momento
em que a BuildClinic cria a pessoa.

**Custo.** Baixo. Dias, não semanas.

**Ganho.** Some um cadastro e uma senha da vida de quem usa.

---

## Caminho 2 — Os dados conversando

**O que muda.** O contato etiquetado no WhatsApp vira lead na BuildClinic. A anotação aparece
lá. A proposta gerada fica registrada. O retorno marcado entra na agenda de lá.

**Como fazer.** Quase tudo já existe:

- o **webhook** dispara a cada mensagem recebida, com o contato, as pastas e quem está
  atendendo (ver [06-integracoes.md](06-integracoes.md));
- a **API de proposta** já é da BuildClinic, então ela já sabe o que foi gerado;
- para anotações e agenda, o caminho é o mesmo: um endpoint que recebe.

Uma alternativa mais direta, se a BuildClinic puder ler o banco do BuildChat: uma rotina que
copia contatos, anotações e agendamentos para lá. O esquema está em [sql/](sql/) e é estável.

**Custo.** Moderado. Depende de quantos objetos vocês querem espelhar.

**Ganho.** É aqui que mora quase todo o valor prático. A equipe deixa de ter dois lugares para
olhar.

---

## Caminho 3 — A extensão sem backend próprio

**O que muda.** Não há mais Supabase para o BuildChat. A extensão lê e escreve direto na
BuildClinic.

**O que precisa existir do lado de vocês.** Este é o tamanho real do trabalho:

- autenticação com sessão renovável;
- as tabelas do sistema, com as regras de acesso equivalentes (por empresa, por departamento,
  por autor, por visibilidade de item) — são vinte e uma tabelas, e as regras são a parte
  difícil, não o esquema;
- armazenamento de arquivos com controle por caminho;
- as funções que a extensão chama, listadas em
  [03-contrato-do-servidor.md](03-contrato-do-servidor.md);
- leitura incremental com data de atualização e exclusão lógica, **mais** o aviso do que deixou
  de ser visível (a armadilha número 11).

**Custo.** Alto. Semanas, e o resultado é um sistema que já funciona, só que em outro endereço.

**Ganho.** Um banco só, uma operação só. Real, mas pago caro.

---

## O que eu recomendaria

Começar pelo caminho 2, e fazer o caminho 1 junto se o incômodo do login duplo for grande.
Deixar o caminho 3 para quando houver um motivo concreto que os dois primeiros não resolvam.

O motivo é simples: o caminho 3 gasta semanas para chegar ao mesmo lugar funcional onde o
sistema já está, enquanto o caminho 2 entrega, em muito menos tempo, aquilo que a equipe
realmente sente falta.

Se a escolha for o caminho 3 mesmo assim, a suíte de [testes/](testes/) é o melhor ponto de
partida: ela descreve, em português e em asserções, o comportamento que as regras de acesso
precisam ter. Reimplementar até fazer aqueles testes passarem é um roteiro pronto.
