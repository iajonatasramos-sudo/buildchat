// Página da própria extensão: é o ÚNICO lugar onde `chrome.permissions.request`
// funciona. No content script (dentro do WhatsApp) a API nem existe — foi por
// isso que o "Liberar agora" não fazia nada.
//
// A chamada precisa sair de um clique de verdade e antes de qualquer espera,
// senão o Chrome descarta o gesto.

const params = new URLSearchParams(location.search);
const origem = params.get('origem') || '';
const dominio = document.getElementById('dominio');
const estado = document.getElementById('estado');
const botao = document.getElementById('liberar');

dominio.textContent = origem.replace(/\/\*$/, '') || '(endereço não informado)';

if (!origem) {
  botao.disabled = true;
  estado.textContent = 'Volte ao WhatsApp e informe a URL do WebHook primeiro.';
}

botao.addEventListener('click', () => {
  chrome.permissions.request({ origins: [origem] }, (ok) => {
    const erro = chrome.runtime.lastError?.message;
    if (ok) {
      estado.className = 'estado ok';
      estado.textContent = 'Liberado. Pode fechar esta aba e voltar ao WhatsApp.';
      botao.disabled = true;
      setTimeout(() => window.close(), 1500);
    } else {
      estado.className = 'estado erro';
      estado.textContent = erro
        ? `Não consegui liberar: ${erro}`
        : 'Você não autorizou. O envio continua funcionando às cegas.';
    }
  });
});
