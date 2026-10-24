/**
 * Os filtros da página /explorar (Fase 3, 24/10/2026). Espec:
 * `especs/numeros-publicos-explorar.md`, §3, §6 e §10.
 *
 * O build escreve o recorte padrão inteiro (Brasil, `INDICADOR_PADRAO`), com
 * os controles desligados. Este script os liga e, a cada mudança, baixa o
 * arquivo do indicador e redesenha as quatro vistas: resumo, mapa, extremos e
 * tabela. Toda conta vem de `explorar-conta.js`, que o teste compara com a do
 * build; aqui só fica o DOM.
 *
 * ## O endereço manda
 *
 * Como em `filtro-uf.js`: o recorte sai de `?i=&regiao=&uf=&pop=`, e não do
 * valor que o navegador restaura nos selects ao recarregar. O que não existe
 * cai fora, e o endereço é limpo com `replaceState` (armadilha 4).
 *
 * ## Por que clonar o que o build escreveu
 *
 * As classes vêm de CSS Modules, com hash no nome. Em vez de repetir esses
 * nomes aqui, o script guarda a primeira linha da tabela e o primeiro item de
 * cada lista como modelo; o que só o script cria (os filtros aplicados, a
 * paginação) lê a classe de um `data-classe-*` que o build preencheu.
 */

import {
  casaComIndice, escreverFiltro, expandirIndice, FAIXAS, dominio,
  faixaDoValor, formatar, formatarExtremo, legendaDoMapa, lerFiltro, nomeDoRecorte,
  passoDoMapa, recorte,
} from "./explorar-conta.js";
import { slugDe } from "./busca.js";

const POR_PAGINA = 50;
const RANKING = 10;
const CAMADA = "valor";

const form = document.getElementById("explorar-filtros");
if (form) iniciar(form);

function iniciar(form) {
  const campos = form.querySelector("fieldset");
  const sel = {
    i: form.elements.namedItem("i"),
    regiao: form.elements.namedItem("regiao"),
    uf: form.elements.namedItem("uf"),
    pop: form.elements.namedItem("pop"),
  };
  const padrao = form.dataset.padrao;
  const indicadores = [...sel.i.options].map((o) => o.value);
  const ufs = [...sel.uf.options].filter((o) => o.value)
    .map((o) => ({ sigla: o.value, regiao: o.dataset.regiao, nome: o.textContent }));
  const nomeDaUf = (s) => ufs.find((u) => u.sigla === s)?.nome ?? s;
  const siglaDoNome = new Map(ufs.map((u) => [u.nome, u.sigla]));

  const el = (id) => document.getElementById(id);
  const aviso = el("explorar-sem-script");
  const aplicados = el("explorar-aplicados");
  const listaAplicados = aplicados.querySelector("ul");
  const tbody = el("explorar-linhas");
  const modeloLinha = tbody.rows[0]?.cloneNode(true);
  const maiores = el("explorar-maiores");
  const menores = el("explorar-menores");
  const modeloItem = maiores.querySelector("li")?.cloneNode(true);
  const paginas = el("explorar-paginas");
  const mapa = el("explorar-mapa-secao");
  const tituloOriginal = document.title;

  let entradas = null;
  const arquivos = new Map();
  let pedido = 0;
  let atual = null;
  // Igual ao `aria-sort` que o build escreve no cabeçalho do valor.
  let ordem = { coluna: "valor", sobe: false };
  let pagina = 0;

  // Sem o arquivo do indicador não há o que mostrar além do padrão; com ele,
  // o resto é conta local.
  async function carregar(indicador) {
    if (!entradas) {
      const r = await fetch("/dados/indice.json");
      if (!r.ok) throw new Error(`indice.json: ${r.status}`);
      entradas = expandirIndice(await r.json());
    }
    if (!arquivos.has(indicador)) {
      const r = await fetch(`/dados/explorar/${indicador}/dados.json`);
      if (!r.ok) throw new Error(`${indicador}: ${r.status}`);
      arquivos.set(indicador, await r.json());
    }
    return arquivos.get(indicador);
  }

  function indicadorDe(chave) {
    const o = [...sel.i.options].find((x) => x.value === chave);
    return {
      chave, rotulo: o.textContent, tipo: o.dataset.tipo, formato: o.dataset.formato,
      casas: Number(o.dataset.casas), mult: Number(o.dataset.mult ?? 1),
      fonte: o.dataset.fonte ?? "",
    };
  }

  function filtroDosCampos() {
    const filtro = {};
    if (sel.regiao.value) filtro.regiao = sel.regiao.value;
    if (sel.uf.value) filtro.uf = sel.uf.value;
    if (sel.pop.value) filtro.faixa = FAIXAS.findIndex((f) => f.chave === sel.pop.value);
    return filtro;
  }

  function camposDoFiltro(indicador, filtro) {
    sel.i.value = indicador;
    sel.regiao.value = filtro.regiao ?? "";
    sel.uf.value = filtro.uf ?? "";
    sel.pop.value = filtro.faixa === undefined ? "" : FAIXAS[filtro.faixa].chave;
    ufsDaRegiao();
  }

  // A UF fora da região escolhida não se escolhe (o endereço a recusaria).
  function ufsDaRegiao() {
    for (const o of sel.uf.options) {
      o.disabled = Boolean(o.value && sel.regiao.value && o.dataset.regiao !== sel.regiao.value);
    }
  }

  function avisar(texto) {
    aviso.textContent = texto;
    aviso.hidden = !texto;
  }

  // `aviso`: o texto que fica depois de desenhar (o do link inválido); a
  // mudança seguinte, sem ele, o apaga.
  async function aplicar(indicador, filtro, { endereco = true, aviso: texto = "" } = {}) {
    const meu = ++pedido;
    if (endereco) {
      history.replaceState(history.state, "",
        location.pathname + escreverFiltro(indicador, filtro, padrao) + location.hash);
    }
    form.setAttribute("aria-busy", "true");
    try {
      const arquivo = await carregar(indicador);
      if (meu !== pedido) return;
      // Arquivo de outro build no cache: cada linha mostraria o valor do
      // vizinho. Melhor não desenhar (armadilha 1).
      if (!casaComIndice(arquivo, entradas)) {
        avisar("Os dados do site mudaram desde que esta página foi aberta. " +
          "Recarregue a página para ver o recorte.");
        return;
      }
      const ind = indicadorDe(indicador);
      atual = { ind, filtro, r: recorte(ind, arquivo, entradas, ufs, filtro) };
      pagina = 0;
      avisar(texto);
      desenhar();
    } catch {
      if (meu === pedido) avisar("Não foi possível baixar os dados deste recorte. Tente de novo.");
    } finally {
      if (meu === pedido) form.removeAttribute("aria-busy");
    }
  }

  function desenhar() {
    const { ind, filtro, r } = atual;
    const nome = nomeDoRecorte(filtro, nomeDaUf);
    const valor = (v) => formatar(v, ind);
    el("explorar-rotulo-agregado").textContent = `${ind.rotulo}, ${nome}`;
    el("explorar-agregado").textContent = valor(r.agregado);
    el("explorar-municipios").textContent = r.municipios.toLocaleString("pt-BR");
    el("explorar-sem-dado").textContent = r.semDado.toLocaleString("pt-BR");
    el("explorar-nota").textContent = el("explorar-nota").dataset[ind.tipo] ?? "";
    el("explorar-fonte").textContent = ind.fonte;
    const padraoAgora = ind.chave === padrao && !Object.keys(filtro).length;
    document.title = padraoAgora ? tituloOriginal : `${ind.rotulo}, ${nome}: ${tituloOriginal}`;
    desenharAplicados(filtro);
    desenharMapa(ind, r);
    desenharExtremos(r, valor);
    desenharTabela();
  }

  function desenharAplicados(filtro) {
    const itens = [];
    if (filtro.regiao) itens.push(["regiao", `Região: ${filtro.regiao}`]);
    if (filtro.uf) itens.push(["uf", `Estado: ${nomeDaUf(filtro.uf)}`]);
    if (filtro.faixa !== undefined) itens.push(["pop", `População: ${FAIXAS[filtro.faixa].rotulo}`]);
    listaAplicados.replaceChildren(...itens.map(([campo, texto]) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = listaAplicados.dataset.classeChip ?? "";
      b.dataset.tirar = campo;
      b.textContent = texto;
      b.setAttribute("aria-label", `Tirar o filtro ${texto}`);
      const x = document.createElement("span");
      x.setAttribute("aria-hidden", "true");
      x.textContent = " ×";
      b.append(x);
      li.append(b);
      return li;
    }));
    aplicados.hidden = !itens.length;
    aplicados.querySelector("[data-limpar]").hidden = itens.length < 2;
  }

  function desenharMapa(ind, r) {
    if (!mapa) return;
    const { min, max } = dominio(r.porUf, passoDoMapa(r.porUf, ind));
    // A UF fora do recorte também fica em hachura: ela não tem valor nele.
    for (const p of mapa.querySelectorAll(`path[data-${CAMADA}]`)) {
      const sigla = p.querySelector("title")?.textContent;
      const f = faixaDoValor(r.porUf[sigla] ?? null, min, max);
      p.setAttribute(`data-${CAMADA}`, f === null ? "sem" : String(f));
    }
    // Dois elementos levam o `data-de` da camada: o texto da legenda e a
    // rampa com os extremos, que é o único com filhos.
    const daCamada = [...mapa.querySelectorAll(`[data-de="${CAMADA}"]`)];
    const legenda = daCamada.find((e) => !e.firstElementChild);
    if (legenda) legenda.textContent = legendaDoMapa(ind);
    const extremos = daCamada.find((e) => e.firstElementChild);
    if (extremos) {
      extremos.firstElementChild.textContent = formatarExtremo(min, ind);
      extremos.lastElementChild.textContent = formatarExtremo(max, ind);
    }
    const rotulo = mapa.querySelector(`label[for="mapa-${CAMADA}"]`);
    if (rotulo) rotulo.textContent = ind.rotulo;
    const tabela = mapa.querySelector("details table");
    if (tabela) {
      tabela.tHead.rows[0].cells[1].textContent = ind.rotulo;
      for (const linha of tabela.tBodies[0].rows) {
        const v = r.porUf[siglaDoNome.get(linha.cells[0].textContent)];
        linha.cells[1].textContent = v === undefined || v === null ? "—" : formatar(v, ind);
      }
    }
  }

  function item(l, valor) {
    const li = modeloItem.cloneNode(true);
    const a = li.querySelector("a");
    a.href = `/municipio/${slugDe(l.nome, l.uf)}/`;
    a.textContent = `${l.nome} (${l.uf})`;
    li.querySelector("span").textContent = valor(l.valor);
    return li;
  }

  function desenharExtremos(r, valor) {
    if (!modeloItem) return;
    const comValor = r.linhas.filter((l) => l.valor !== null);
    maiores.replaceChildren(...comValor.slice(0, RANKING).map((l) => item(l, valor)));
    menores.replaceChildren(...comValor.slice(-RANKING).reverse().map((l) => item(l, valor)));
  }

  // A posição é a do recorte, do maior para o menor, e acompanha a linha em
  // qualquer ordem da tabela. "Sem dado" vai sempre para o fim.
  function ordenadas() {
    const { r } = atual;
    const linhas = r.linhas.map((l, k) => ({ ...l, posicao: k + 1 }));
    const { coluna, sobe } = ordem;
    const sinal = sobe ? 1 : -1;
    const primeiro = {
      posicao: (a, b) => a.posicao - b.posicao,
      nome: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
      uf: (a, b) => a.uf.localeCompare(b.uf, "pt-BR"),
      valor: (a, b) => a.valor - b.valor,
    }[coluna];
    // O empate fica na ordem da posição nos dois sentidos, como no build.
    const comparar = (a, b) => sinal * primeiro(a, b) || a.posicao - b.posicao;
    const sem = linhas.filter((l) => l.valor === null);
    return [...linhas.filter((l) => l.valor !== null).sort(comparar), ...sem];
  }

  // No padrão, a página abre sem baixar nada: o arquivo só vem no primeiro
  // clique de ordenar ou paginar. Devolve se há recorte para desenhar.
  async function garantirAtual() {
    if (atual) return true;
    const meu = pedido;
    try {
      const arquivo = await carregar(padrao);
      if (atual || meu !== pedido) return Boolean(atual);
      if (!casaComIndice(arquivo, entradas)) {
        avisar("Os dados do site mudaram desde que esta página foi aberta. " +
          "Recarregue a página para ver o recorte.");
        return false;
      }
      const ind = indicadorDe(padrao);
      atual = { ind, filtro: {}, r: recorte(ind, arquivo, entradas, ufs, {}) };
      return true;
    } catch {
      avisar("Não foi possível baixar os dados deste recorte. Tente de novo.");
      return false;
    }
  }

  function desenharTabela() {
    if (!modeloLinha) return;
    const { ind, filtro, r } = atual;
    const linhas = ordenadas();
    const total = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
    pagina = Math.min(pagina, total - 1);
    const daPagina = linhas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
    tbody.replaceChildren(...daPagina.map((l) => {
      const tr = modeloLinha.cloneNode(true);
      tr.cells[0].textContent = `${l.posicao}º`;
      const a = tr.cells[1].querySelector("a");
      a.href = `/municipio/${slugDe(l.nome, l.uf)}/`;
      a.textContent = l.nome;
      tr.cells[2].textContent = l.uf;
      tr.cells[3].textContent = formatar(l.valor, ind);
      return tr;
    }));

    const legenda = el("explorar-legenda-tabela");
    if (!r.municipios) {
      // Vazio diz o que está em vigor e como alargar (`ux-padroes.md`).
      legenda.textContent = `Nenhum município no recorte ${nomeDoRecorte(filtro, nomeDaUf)}. ` +
        "Tire um dos filtros aplicados para alargar.";
    } else {
      const de = (pagina * POR_PAGINA + 1).toLocaleString("pt-BR");
      const ate = (pagina * POR_PAGINA + daPagina.length).toLocaleString("pt-BR");
      legenda.textContent = `Municípios ${de} a ${ate} de ${r.municipios.toLocaleString("pt-BR")}. ` +
        `${ind.rotulo}. A posição é a do recorte, do maior para o menor.`;
    }
    el("explorar-col-valor-texto").textContent = ind.rotulo;
    for (const th of tbody.closest("table").tHead.rows[0].cells) {
      if (th.dataset.ordem === ordem.coluna) {
        th.setAttribute("aria-sort", ordem.sobe ? "ascending" : "descending");
      } else th.removeAttribute("aria-sort");
    }

    paginas.hidden = total < 2;
    paginas.querySelector("[data-pagina]").textContent =
      `Página ${(pagina + 1).toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`;
    paginas.querySelector("[data-ir='-1']").disabled = pagina === 0;
    paginas.querySelector("[data-ir='1']").disabled = pagina >= total - 1;
  }

  // Cabeçalhos ordenáveis: um botão dentro do `th`, que leva o `aria-sort`.
  // O primeiro clique no valor ordena do maior para o menor; nas outras
  // colunas (a posição, o nome, o estado), do começo para o fim.
  for (const th of tbody.closest("table").tHead.rows[0].cells) {
    const coluna = th.dataset.ordem;
    if (!coluna) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = th.closest("table").dataset.classeOrdenar ?? "";
    b.append(...th.childNodes);
    th.replaceChildren(b);
    b.addEventListener("click", async () => {
      if (!(await garantirAtual())) return;
      const sobe = ordem.coluna === coluna ? !ordem.sobe : coluna !== "valor";
      ordem = { coluna, sobe };
      pagina = 0;
      desenharTabela();
    });
  }

  paginas.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-ir]");
    if (!b || !(await garantirAtual())) return;
    pagina += Number(b.dataset.ir);
    desenharTabela();
    tbody.closest("section").querySelector("h2").scrollIntoView({ block: "start" });
  });

  form.addEventListener("change", (ev) => {
    if (ev.target === sel.regiao) {
      ufsDaRegiao();
      const uf = ufs.find((u) => u.sigla === sel.uf.value);
      if (uf && sel.regiao.value && uf.regiao !== sel.regiao.value) sel.uf.value = "";
    }
    aplicar(sel.i.value, filtroDosCampos());
  });

  // Sem botão "aplicar": o resultado se refaz a cada mudança. Enviar o
  // formulário (Enter num select) não recarrega a página.
  form.addEventListener("submit", (ev) => ev.preventDefault());

  aplicados.addEventListener("click", (ev) => {
    const tirar = ev.target.closest("[data-tirar]")?.dataset.tirar;
    const limpar = ev.target.closest("[data-limpar]");
    if (!tirar && !limpar) return;
    if (limpar) for (const k of ["regiao", "uf", "pop"]) sel[k].value = "";
    else sel[tirar].value = "";
    ufsDaRegiao();
    aplicar(sel.i.value, filtroDosCampos());
    sel.i.focus();
  });

  const { indicador, filtro, invalido } = lerFiltro(
    new URLSearchParams(location.search), indicadores, ufs, padrao);
  camposDoFiltro(indicador, filtro);
  campos.disabled = false;
  avisar("");
  if (invalido || indicador !== padrao || Object.keys(filtro).length) {
    aplicar(indicador, filtro, {
      endereco: invalido,
      aviso: invalido ? "O endereço tinha um filtro que não existe; ele foi retirado." : "",
    });
  } else {
    // O padrão já está na página; só a paginação, que o build não escreve,
    // sai do total do cartão (`garantirAtual` baixa o resto no clique).
    const total = Math.ceil(Number(el("explorar-municipios").textContent.replace(/\D/g, "")) / POR_PAGINA);
    paginas.hidden = total < 2;
    paginas.querySelector("[data-pagina]").textContent =
      `Página 1 de ${total.toLocaleString("pt-BR")}`;
    paginas.querySelector("[data-ir='-1']").disabled = true;
  }
}
