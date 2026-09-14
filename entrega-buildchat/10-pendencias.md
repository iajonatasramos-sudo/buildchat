# 10. Pendências e decisões

## Pendências conhecidas

**Publicação na Chrome Web Store.** A extensão ainda é distribuída por arquivo, e a instalação
exige o modo desenvolvedor. Enquanto isso, **não existe atualização automática**: cada pessoa
precisa baixar de novo. Publicar resolve isso de vez, e a página de instalação já está
preparada para trocar o passo a passo por um botão quando houver o endereço da loja.

**Versão parada.** O manifesto está em `1.0.0` desde o começo. Antes de publicar, a versão
precisa passar a subir a cada envio, senão o Chrome não reconhece que há atualização.

**A aba não recarrega sozinha.** Depois de atualizar a extensão, a aba do WhatsApp continua com
o código antigo até alguém recarregar. É possível fazer o service worker recarregar as abas
quando detecta atualização; ainda não foi feito.

**Automações não sincronizam.** Bots, campanhas e notificações vivem só no computador de quem
criou. Levar para o servidor é trabalho pendente.

**Webhook de entrada.** A tela mostra o gatilho "lead chegou por webhook" desligado, porque
receber exige um endereço público ouvindo, o que a extensão não tem.

**Importar backup.** A exportação em JSON existe; a importação não.

## Decisões já tomadas, para não serem refeitas

- **Nada do Dental Chat.** Nenhum código, marca ou recurso dele. A biblioteca do WhatsApp é
  aberta, a interface veio do BuildClinic, e os dados extraídos do computador do usuário são
  dele.
- **Conversas nunca sobem.** Nem mídia recebida, nem o cache de mensagens apagadas. É promessa
  feita na política de privacidade.
- **A ficha do contato é da empresa; anotação e etiqueta são do departamento; a agenda é de
  quem marcou.** Foram três decisões separadas, tomadas depois de uso real.
- **Tudo que nasce na extensão é pessoal**, inclusive do administrador. O que é da clínica
  nasce no painel, onde há como escolher quem vê.
- **O login é obrigatório.** Sem conta, nenhuma função da extensão responde, e o WhatsApp segue
  funcionando normalmente.
- **Código, comentários e interface em português.**

## Como continuar sem quebrar

1. **Toda mudança de regra de acesso passa pela suíte primeiro.** Ela sobe um Postgres real e
   executa como o papel do aplicativo, igual ao Supabase.
2. **Depois de compilar, recarregue a extensão e a aba.**
3. **Teste no WhatsApp de verdade.** Layout e comportamento dentro do WhatsApp Web não se
   verificam de outro jeito. O roteiro está no fim de `02-arquitetura.md`.
4. **Migração nova nunca altera o passado.** As trinta e três existentes são reaplicáveis do
   zero, em ordem, quantas vezes for preciso. Mantenha assim.
