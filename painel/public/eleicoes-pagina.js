/**
 * Os caminhos de /eleicoes-2026/dados/ (26/10/2026). Sem este arquivo a
 * página fica igual, só sem eles:
 * - o link que chega com o alvo dentro de um `<details>` fechado
 *   (`#gov-ba`, `#sen-ba`, `#depf-ba`, `#depe-df`, `#pres1-ba`, `#uf-ba`,
 *   vindos do cartão do mapa em /eleicoes-2026/) abre o `<details>` e rola
 *   até o alvo, na carga e depois;
 * - "Abrir todos" e "Fechar todos" nos governadores;
 * - a impressão sai com todo `<details>` aberto (as tabelas recolhidas
 *   também vão ao papel) e os fecha de novo depois.
 */

// Abre todo `<details>` que contém o alvo (ele mesmo, se for um): sem isso o
// navegador não rola até uma linha escondida num `<details>` fechado.
function abrirAlvo() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const alvo = document.getElementById(id);
  if (!alvo) return;
  let fechado = false;
  for (let d = alvo.closest("details"); d; d = d.parentElement?.closest("details")) {
    if (!d.open) { d.open = true; fechado = true; }
  }
  if (fechado) alvo.scrollIntoView();
}
addEventListener("hashchange", abrirAlvo);
// O mesmo link de novo (governador fechado à mão) não muda o hash: abre no clique.
for (const a of document.querySelectorAll("a[data-link-gov]")) {
  a.addEventListener("click", () => {
    const d = document.getElementById(a.getAttribute("href").slice(1));
    if (d instanceof HTMLDetailsElement) d.open = true;
  });
}
abrirAlvo();

const acoes = document.querySelector("[data-gov-acoes]");
if (acoes) {
  const todos = (aberto) => { for (const d of document.querySelectorAll("details[data-gov]")) d.open = aberto; };
  acoes.querySelector("[data-gov-abrir]")?.addEventListener("click", () => todos(true));
  acoes.querySelector("[data-gov-fechar]")?.addEventListener("click", () => todos(false));
  acoes.hidden = false;
}

// Impressão: abre só o que estava fechado e, depois, fecha só esses.
let abertosParaImprimir = [];
addEventListener("beforeprint", () => {
  abertosParaImprimir = [...document.querySelectorAll("main details:not([open])")];
  for (const d of abertosParaImprimir) d.open = true;
});
addEventListener("afterprint", () => {
  for (const d of abertosParaImprimir) d.open = false;
  abertosParaImprimir = [];
});
