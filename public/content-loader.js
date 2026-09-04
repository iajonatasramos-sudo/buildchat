// Content scripts MV3 não suportam módulos ES diretamente.
// Este loader clássico importa o bundle real (com React) como módulo.
(async () => {
  try {
    await import(chrome.runtime.getURL('assets/content.js'));
  } catch (e) {
    console.error('[BuildChat] falha ao carregar o bundle:', e);
  }
})();
