# 4. Armadilhas

Cada item aqui é um problema que já aconteceu e custou tempo. Nenhum é óbvio olhando o código.
Ler isto antes de mexer economiza dias.

## No WhatsApp Web

**1. O `@lid` não é telefone.** O WhatsApp identifica parte das conversas por um id interno de
quinze dígitos terminado em `@lid`. Derivar o número dele mostra esse id como se fosse celular.
O número real vem de `WPP.contact.getPnLidEntry`. Onde não se sabe o número, mostra-se um
traço, nunca o id.

**2. O id no DOM e o id do WPP são strings diferentes.** A mesma mensagem aparece como
`false_123@lid_HASH` no HTML e `false_5511…@c.us_HASH` na biblioteca. O que coincide é o
**hash**, o terceiro pedaço. Passar o id cru do HTML para a biblioteca estoura com um erro sem
sentido sobre `_serialized`. Tudo que casa mensagem usa o hash.

**3. A lista de mensagens é virtualizada.** A bolha some ao rolar e volta remontada, sem o que
você tinha inserido. Todo botão injetado precisa de um observador que o reinsira, e de um
cache por id para não refazer trabalho (nem repagar uma API).

**4. Achar a bolha não pode depender de classe nem do `<audio>`.** As classes mudam a cada
versão do WhatsApp, e o elemento de áudio só existe depois que a pessoa toca o áudio. A bolha é
encontrada por **geometria**: o elemento mais externo dentro da linha que tem fundo próprio e é
mais estreito que ela.

**5. O editor de mensagem é assíncrono.** No caminho alternativo de envio (sem a biblioteca),
é preciso limpar, **colar** um evento de área de transferência, esperar, e só então conferir.
Conferir logo depois faz a mensagem sair duas vezes.

**6. Mídia precisa do tipo forçado.** O Chrome serve um `.ogg` da extensão como vídeo, e a
biblioteca recusa. O tipo é reescrito antes de enviar. Áudio vai como mensagem de voz, com onda.

**7. O menu do WhatsApp se posiciona pela janela, não pela área visível.** Como a extensão
encolhe a área do WhatsApp para caber a barra lateral, o menu de uma mensagem sua abria por
baixo da nossa barra. A correção mede a borda útil e reposiciona.

## Na interface da extensão

**8. A interface está ampliada em 25%.** Há um `zoom` na raiz. Toda coordenada lida do WhatsApp
precisa ser convertida antes de virar posição, senão aparece deslocada. Existe uma função só
para isso.

**9. `@property` não vale dentro de shadow DOM.** As utilidades do Tailwind leem variáveis cujo
valor inicial vem de regras `@property`, e a especificação manda ignorá-las dentro de uma
shadow tree — que é justo onde o nosso CSS vive. Sem isso, bordas ficam invisíveis e sombras
somem. Um passo da compilação repete os valores iniciais na raiz. **Se uma classe do Tailwind
não tiver efeito visual, suspeite disto primeiro.**

**10. Os seletores do WhatsApp mudam.** Todos ficam num lugar só, sempre com alternativa e com
observador, porque o cabeçalho e o rodapé são remontados a cada troca de conversa.

## No servidor

**11. Tirar visibilidade não é o mesmo que apagar.** Explicado em
[03-contrato-do-servidor.md](03-contrato-do-servidor.md). Vale relembrar porque o sintoma é
cruel: a pasta continua na tela de quem já não deveria vê-la, para sempre.

**12. Falhar na adoção não pode derrubar o ciclo.** Se a subida do acervo local falha, o resto
da sincronização tem de continuar. Quando isso não era assim, uma recusa de permissão deixava a
pessoa sem licença, sem acervo e sem integração, com a nuvem riscada na barra.

**13. Erro que não é de rede também precisa de nova tentativa.** Descartar com um aviso no
console fez anotações sumirem sem nunca chegar ao servidor.

**14. Inserção em lote exige as mesmas chaves em todos os objetos.** É uma regra do PostgREST.
Por isso o envio das ações manda todos os campos, mesmo os nulos.

**15. Mudança de tipo de retorno de função exige apagar a função antes.** E `create policy` não
é idempotente: sem um `drop policy if exists` antes, reaplicar as migrações falha no meio.

## Na extensão do Chrome

**16. `chrome.permissions` não existe no content script.** Dentro do WhatsApp a API é
indefinida, e um `try/catch` engole o erro em silêncio. Pedir permissão só funciona numa página
da própria extensão, e só dentro de um clique de verdade.

**17. Padrão de origem não aceita porta.** `http://1.2.3.4:8088/*` é inválido; o certo é
`http://1.2.3.4/*`, que já vale para qualquer porta.

**18. Sem permissão do domínio, o envio vai às cegas.** O POST é refeito num modo que dispensa
a verificação prévia: o corpo chega ao destino, mas não dá para ler a resposta. É o
comportamento certo, e a tela avisa.

**19. A sessão não pode viver no `localStorage`.** Aquele `localStorage` é o do WhatsApp. A
sessão fica no armazenamento da extensão.

## No teste

**20. O Chrome do usuário não carrega extensão por linha de comando.** Para testar de verdade é
preciso o Chrome for Testing.

**21. Cuidado ao entrar com uma conta real pelo navegador de teste.** A pasta de
desenvolvimento ainda carrega dados de exemplo, e o primeiro login **adota** tudo aquilo como
pastas da conta no servidor. Já aconteceu, e foi preciso limpar o banco na mão.
