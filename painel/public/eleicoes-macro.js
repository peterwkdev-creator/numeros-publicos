/**
 * A visão macro das eleições, /eleicoes-2026/ (26/10/2026). Sem este arquivo
 * a página é o 2º turno de presidente: mapa, legenda, resumo e a dica nativa
 * de cada estado. Com ele:
 * - os botões de cargo trocam a cor do mapa (de `data-c-<cargo>` para
 *   `data-cor`, que a paleta pinta), a legenda e o resumo do Brasil;
 * - o cursor sobre um estado mostra a dica; o clique, ou a escolha no
 *   "Escolha o estado" (o caminho do teclado), abre o cartão do estado ao
 *   lado do mapa, sem rolar a página;
 * - dica e cartão vêm de /dados/eleicoes-2026-mapa.json; sem ele, o cartão
 *   traz só o link para a parte certa de /eleicoes-2026/dados/.
 *
 * E antes de tudo: a página era única até 26/10, com a consulta de seção e
 * as tabelas. Os links velhos (`?secao=`, `#gov-ba`, `#consulta`...) vão
 * para /eleicoes-2026/dados/, que tem os mesmos ids.
 */
const DADOS = "/eleicoes-2026/dados/";
const VELHO = /^(gov|uf)-[a-z]{2}$|^(consulta|prorrogacao|presidente|presidente-1|sumario|por-uf|participacao|governador|metodo)$/;
const alvo = decodeURIComponent(location.hash.slice(1));
if (new URLSearchParams(location.search).has("secao") || VELHO.test(alvo)) {
  location.replace(DADOS + location.search + location.hash);
} else {
  iniciar();
}

function iniciar() {
  const mapa = document.querySelector("svg[data-mapa-cargo]");
  const cartao = document.querySelector("[data-cartao]");
  const escolha = document.getElementById("escolha-uf");
  const radios = [...document.querySelectorAll('input[name="cargo"]')];
  if (!mapa || !cartao || !escolha || !radios.length) return;
  const caixa = mapa.closest("[data-caixa-mapa]");
  const dica = document.querySelector("[data-dica]");
  const estados = [...mapa.querySelectorAll("path[data-uf]")];
  const nomeDe = (uf) => escolha.querySelector(`option[value="${uf}"]`)?.textContent ?? uf.toUpperCase();
  // A âncora de cada cargo em /dados/, se o arquivo da dica não chegar.
  const ANCORA = { p2: "uf", p1: "pres1", gov: "gov", sen: "sen", depf: "depf", depe: "depe" };

  let cargo = radios.find((r) => r.checked)?.value ?? radios[0].value;
  let ativa = "";
  let dados = null;

  for (const el of document.querySelectorAll("[data-cargos], [data-escolha], [data-instrucao]")) el.hidden = false;
  mapa.setAttribute("data-clicavel", "");

  // O `<title>` nativo diz o 2º turno: some quando o cargo muda ou a dica chega.
  const semTitulos = () => { for (const t of mapa.querySelectorAll("title")) t.remove(); };

  function trocarCargo(ch) {
    cargo = ch;
    for (const p of estados) p.setAttribute("data-cor", p.getAttribute(`data-c-${ch}`) || "sem");
    for (const l of document.querySelectorAll("[data-legenda]")) l.hidden = l.getAttribute("data-legenda") !== ch;
    for (const r of document.querySelectorAll("[data-resumo]")) r.hidden = r.getAttribute("data-resumo") !== ch;
    mapa.setAttribute("aria-labelledby", `leg-${ch}`);
    if (ch !== "p2") semTitulos();
    esconderDica();
    if (ativa) abrirCartao(ativa);
  }

  // ---- A dica ----
  function mostrarDica(uf, x, y) {
    const texto = dados?.ufs?.[cargo]?.[uf]?.d;
    if (!dica || !caixa || !texto) return esconderDica();
    dica.textContent = texto;
    dica.hidden = false;
    const largura = caixa.clientWidth;
    const w = dica.offsetWidth;
    const esquerda = Math.max(0, Math.min(x + 14, largura - w));
    dica.style.setProperty("left", `${esquerda}px`);
    dica.style.setProperty("top", `${Math.max(0, y + 14)}px`);
  }
  function esconderDica() { if (dica) dica.hidden = true; }
  function dicaNoCentro(uf) {
    const p = estados.find((e) => e.getAttribute("data-uf") === uf);
    if (!p || !caixa) return;
    const r = p.getBoundingClientRect();
    const c = caixa.getBoundingClientRect();
    mostrarDica(uf, r.left + r.width / 2 - c.left, r.top + r.height / 2 - c.top);
  }

  mapa.addEventListener("pointermove", (ev) => {
    if (ev.pointerType === "touch") return;
    const uf = ev.target.closest?.("path[data-uf]")?.getAttribute("data-uf");
    if (!uf) return esconderDica();
    const c = caixa.getBoundingClientRect();
    mostrarDica(uf, ev.clientX - c.left, ev.clientY - c.top);
  });
  mapa.addEventListener("pointerleave", esconderDica);
  // WCAG 1.4.13: a dica se dispensa sem mover o cursor.
  addEventListener("keydown", (ev) => { if (ev.key === "Escape") esconderDica(); });

  // ---- O cartão ----
  const el = (tag, classe, texto) => {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto !== undefined) n.textContent = texto;
    return n;
  };

  function abrirCartao(uf) {
    ativa = uf;
    const d = dados?.ufs?.[cargo]?.[uf];
    const topo = el("div", "cartao-topo");
    topo.append(el("h3", "cartao-uf", nomeDe(uf)));
    const fechar = el("button", "cartao-fechar", "Fechar");
    fechar.type = "button";
    fechar.setAttribute("aria-label", `Fechar o cartão de ${nomeDe(uf)}`);
    fechar.addEventListener("click", fecharCartao);
    topo.append(fechar);
    const partes = [topo];
    if (d) {
      partes.push(el("p", "cartao-sub", d.s));
      const lista = el("ol", "cartao-linhas");
      for (const l of d.l) {
        const li = el("li");
        const linha = el("div", "cartao-linha");
        const rotulo = el("span", l.e ? "cartao-eleito" : "", l.r);
        if (l.e) rotulo.append(" (eleito)");
        linha.append(rotulo, el("span", "cartao-valor", l.v));
        li.append(linha);
        if (typeof l.p === "number") {
          const trilho = el("span", "cartao-trilho");
          trilho.setAttribute("aria-hidden", "true");
          const barra = el("span", "cartao-barra");
          barra.setAttribute("data-cor", l.c || "outros");
          barra.style.setProperty("width", `${Math.max(0, Math.min(100, l.p))}%`);
          trilho.append(barra);
          li.append(trilho);
        }
        lista.append(li);
      }
      partes.push(lista);
      if (d.n) partes.push(el("p", "cartao-nota", d.n));
    } else {
      partes.push(el("p", "cartao-sub", "O resumo do estado não carregou; os números estão na página de dados."));
    }
    const link = el("a", "cartao-link", d ? d.t : "Ver os dados do estado");
    link.href = d ? d.h : `${DADOS}#${ANCORA[cargo] ?? "uf"}-${uf}`;
    const p = el("p");
    p.append(link);
    partes.push(p);
    cartao.replaceChildren(...partes);

    for (const e of estados) e.removeAttribute("data-ativo");
    const path = estados.find((e) => e.getAttribute("data-uf") === uf);
    if (path) {
      path.setAttribute("data-ativo", "");
      // Desenhado por último: a borda grossa não some sob o vizinho.
      mapa.append(path);
    }
    if (escolha.value !== uf) escolha.value = uf;
  }

  function fecharCartao() {
    ativa = "";
    cartao.replaceChildren();
    for (const e of estados) e.removeAttribute("data-ativo");
    escolha.value = "";
    escolha.focus();
  }

  mapa.addEventListener("click", (ev) => {
    const uf = ev.target.closest?.("path[data-uf]")?.getAttribute("data-uf");
    if (uf) abrirCartao(uf);
  });
  escolha.addEventListener("change", () => {
    if (!escolha.value) { fecharCartao(); return; }
    abrirCartao(escolha.value);
    dicaNoCentro(escolha.value);
  });
  escolha.addEventListener("focus", () => { if (escolha.value) dicaNoCentro(escolha.value); });
  escolha.addEventListener("blur", esconderDica);

  for (const r of radios) r.addEventListener("change", () => { if (r.checked) trocarCargo(r.value); });

  // O navegador pode devolver o rádio e o estado de uma visita anterior (voltar).
  if (cargo !== radios[0].value || !radios[0].checked) trocarCargo(cargo);
  if (escolha.value) abrirCartao(escolha.value);

  fetch("/dados/eleicoes-2026-mapa.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      // Página de um build e arquivo de outro: melhor sem dica que com a de outro cargo.
      if (!j || (j.cargos ?? []).join() !== radios.map((r) => r.value).join()) return;
      dados = j;
      semTitulos();
      if (ativa) abrirCartao(ativa);
    })
    .catch(() => {});
}
