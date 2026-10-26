/**
 * Os caminhos da página das eleições (26/10/2026). Sem este arquivo a página
 * fica igual, só sem eles:
 * - o estado no mapa por vencedor leva à linha dele no placar por estado;
 * - o link "governador" do placar abre o estado na seção do governador;
 * - "Abrir todos" e "Fechar todos" nos governadores;
 * - a impressão sai com todo `<details>` aberto (as tabelas recolhidas
 *   também vão ao papel) e os fecha de novo depois.
 */
const mapa = document.querySelector("svg[data-mapa-vencedor]");
if (mapa) {
  // O mapa é `role="img"`: os estados não viram links (filhos de img são
  // apresentacionais); o placar, logo ao lado, é o caminho pelo teclado.
  mapa.setAttribute("data-clicavel", "");
  mapa.addEventListener("click", (ev) => {
    const uf = ev.target.closest?.("path[data-uf]")?.getAttribute("data-uf");
    if (!uf) return;
    const id = "uf-" + uf.toLowerCase();
    // O mesmo hash não dispara navegação: rola à mão.
    if (location.hash === "#" + id) document.getElementById(id)?.scrollIntoView();
    else location.hash = id;
  });
  const dica = document.querySelector("[data-dica-mapa]");
  if (dica) dica.hidden = false;
}

// O governador pedido pelo link (`#gov-ba`) abre ao chegar, na carga ou depois.
function abrirAlvo() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id.startsWith("gov-")) return;
  const d = document.getElementById(id);
  if (d instanceof HTMLDetailsElement) d.open = true;
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
