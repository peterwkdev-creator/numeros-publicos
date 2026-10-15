/**
 * A tabela de municípios da capa, sem React — o comportamento sobre a
 * marcação que `app/municipios.tsx` gera no servidor (15/10/2026, item 10 da
 * revisão de 11/10).
 *
 * ## Por que existe
 *
 * Até ali a tabela era o único componente de cliente do site: a capa levava
 * o runtime do React e as 5.571 linhas no HTML para toda visita. Agora o
 * build escreve as 50 primeiras, e este script busca `/dados/capa.json` na
 * **primeira interação com a seção** (foco ou toque), como a busca do
 * cabeçalho faz com o `indice.json`. Depois disso, filtrar e ordenar são
 * locais e síncronos.
 *
 * ## O que ele promete, e o que não
 *
 * - Os controles nascem `hidden` e só aparecem aqui: sem script, nada promete
 *   filtrar.
 * - O que se digita antes de a lista chegar não se perde: ao chegar, ela é
 *   filtrada pelo que está nos campos naquele momento.
 * - Se os indicadores do JSON não forem os da página (um build e outro, no
 *   meio de uma publicação), ele desiste e diz para recarregar: melhor não
 *   filtrar do que pôr o PIB na coluna da população.
 * - As linhas saem dos `<template>` da página e o texto entra por
 *   `textContent`, nunca por `innerHTML`.
 * - A lógica sem DOM está em `capa-lista.js`, que o teste confere contra as
 *   50 linhas do build.
 */

import { slugDe } from "./busca.js";
import { PAGINA, br, expandir, ordenar, selecionar } from "./capa-lista.js";

const secao = document.querySelector("[data-municipios]");
if (secao) iniciar(secao);

function iniciar(secao) {
  const $ = (sel) => secao.querySelector(sel);
  const controles = $("[data-controles]");
  const campos = { busca: $("#busca"), uf: $("#uf"), faixa: $("#faixa"), porte: $("#porte") };
  const contagem = $("[data-contagem]");
  const aplicados = $("[data-aplicados]");
  const listaAplicados = $("[data-lista-aplicados]");
  const limparTudo = $("[data-limpar-tudo]");
  const corpo = $("[data-corpo]");
  const mais = $("[data-mais]");
  const modelo = (nome) => $(`template[data-modelo="${nome}"]`)?.content.firstElementChild;
  const modelos = { filtro: modelo("filtro"), linha: modelo("linha"), vazio: modelo("vazio") };
  const botoesOrdem = [...secao.querySelectorAll("button[data-ordenar]")];
  // Sem uma das peças, o controle prometeria o que não faz: fica a tabela
  // estática, que continua certa.
  const faltando = [controles, contagem, aplicados, listaAplicados, limparTudo, corpo, mais,
    ...Object.values(campos), ...Object.values(modelos)].some((x) => !x);
  if (faltando) return;

  const total = Number(secao.dataset.total);
  const iPop = Number(secao.dataset.ipop);
  const ausente = secao.dataset.ausente;
  const codigos = botoesOrdem.map((b) => b.dataset.codigo).filter(Boolean);

  let lista = null;
  let ordenada = null;
  let carregando = false;
  let desistiu = false;
  let ordem = { coluna: 0, desc: true };
  let mostrando = PAGINA;

  controles.hidden = false;
  if (total > PAGINA) {
    mais.hidden = false;
    mais.textContent = textoMais(total - PAGINA);
  }

  const dizer = (texto) => contagem.replaceChildren(texto);

  async function carregar() {
    if (lista || carregando || desistiu) return;
    carregando = true;
    dizer("Carregando a lista completa…");
    try {
      const r = await fetch("/dados/capa.json");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const dado = await r.json();
      if (dado.codigos?.join() !== codigos.join() || dado.linhas?.length !== total) {
        desistiu = true;
        dizer("A lista mudou com uma publicação nova. Recarregue a página para filtrar.");
        return;
      }
      lista = expandir(dado);
      secao.dataset.pronto = "";
      atualizar();
    } catch {
      // A próxima interação tenta de novo; as 50 linhas continuam lá.
      dizer("Não foi possível carregar a lista completa. Tente de novo em instantes.");
    } finally {
      carregando = false;
    }
  }
  secao.addEventListener("focusin", carregar);
  secao.addEventListener("pointerdown", carregar);

  /** Os filtros em vigor, com o rótulo que a pessoa reconhece e o campo de onde vieram. */
  function ativos() {
    const opcao = (c) => c.selectedOptions[0]?.textContent ?? c.value;
    return [
      campos.busca.value.trim() && { campo: campos.busca, rotulo: `“${campos.busca.value.trim()}”` },
      campos.uf.value && { campo: campos.uf, rotulo: `Estado: ${campos.uf.value}` },
      campos.faixa.value && { campo: campos.faixa, rotulo: opcao(campos.faixa) },
      campos.porte.value && { campo: campos.porte, rotulo: opcao(campos.porte) },
    ].filter(Boolean);
  }

  function filtros() {
    const p = campos.porte.selectedOptions[0];
    const porte = campos.porte.value
      ? [Number(p.dataset.min ?? 0), p.dataset.max ? Number(p.dataset.max) : Infinity]
      : null;
    return { termo: campos.busca.value, uf: campos.uf.value, faixa: campos.faixa.value, porte, iPop };
  }

  function linha(x) {
    const tr = modelos.linha.cloneNode(true);
    const a = tr.querySelector("a");
    a.href = `/municipio/${slugDe(x.nome, x.uf)}/`;
    a.textContent = x.nome;
    const tds = tr.querySelectorAll("td");
    tds[0].textContent = x.uf;
    x.valores.forEach((v, i) => {
      const td = tds[i + 1];
      if (!td) return;
      td.textContent = br(v);
      if (v == null && ausente) td.classList.add(ausente);
    });
    return tr;
  }

  function atualizar() {
    if (!lista) return;
    ordenada ??= ordenar(lista, ordem.coluna, ordem.desc);
    const achados = selecionar(ordenada, filtros());
    const emVigor = ativos();

    const linhas = document.createDocumentFragment();
    for (const x of achados.slice(0, mostrando)) linhas.append(linha(x));
    if (achados.length === 0) {
      const tr = modelos.vazio.cloneNode(true);
      tr.querySelector("td").textContent =
        `Nenhum município combina ${emVigor.map((f) => f.rotulo).join(" + ")}. ` +
        "Remova um filtro acima para alargar a busca.";
      linhas.append(tr);
    }
    corpo.replaceChildren(linhas);

    // A contagem traz o total junto quando o filtro corta: "38 municípios"
    // sozinho não diz se cortou muito ou pouco.
    const n = achados.length;
    const forte = document.createElement("strong");
    forte.textContent = br(n);
    contagem.replaceChildren(forte, ` ${n === 1 ? "município" : "municípios"}` +
      (n !== lista.length ? ` de ${br(lista.length)}` : ""));

    for (const b of botoesOrdem) {
      const coluna = b.dataset.ordenar === "nome" ? "nome" : Number(b.dataset.ordenar);
      const ativa = coluna === ordem.coluna;
      b.closest("th")?.setAttribute("aria-sort",
        ativa ? (ordem.desc ? "descending" : "ascending") : "none");
      const seta = b.querySelector("[data-seta]");
      if (seta) seta.textContent = ativa ? (ordem.desc ? "↓" : "↑") : "";
    }

    listaAplicados.replaceChildren(...emVigor.map((f) => {
      const li = modelos.filtro.cloneNode(true);
      li.querySelector("[data-rotulo]").textContent = f.rotulo;
      li.querySelector("button").addEventListener("click", () => {
        f.campo.value = "";
        mostrando = PAGINA;
        atualizar();
        // O botão some com o filtro: o foco volta ao campo de onde ele veio,
        // e não ao começo da página.
        f.campo.focus();
      });
      return li;
    }));
    aplicados.hidden = emVigor.length === 0;
    limparTudo.hidden = emVigor.length < 2;

    const resta = n - mostrando;
    mais.hidden = resta <= 0;
    if (resta > 0) mais.textContent = textoMais(resta);
  }

  const mudou = () => {
    mostrando = PAGINA;
    atualizar();
  };
  campos.busca.addEventListener("input", mudou);
  for (const c of [campos.uf, campos.faixa, campos.porte]) c.addEventListener("change", mudou);

  limparTudo.addEventListener("click", () => {
    for (const c of Object.values(campos)) c.value = "";
    mudou();
    campos.busca.focus();
  });

  for (const b of botoesOrdem) {
    b.addEventListener("click", () => {
      const coluna = b.dataset.ordenar === "nome" ? "nome" : Number(b.dataset.ordenar);
      ordem = ordem.coluna === coluna ? { coluna, desc: !ordem.desc } : { coluna, desc: true };
      ordenada = null;
      mudou();
    });
  }

  mais.addEventListener("click", () => {
    mostrando += PAGINA;
    atualizar();
  });
}

function textoMais(resta) {
  return `Mostrar mais ${Math.min(PAGINA, resta)} de ${br(resta)} restantes`;
}
