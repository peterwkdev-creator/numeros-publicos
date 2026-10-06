/**
 * O filtro por estado do ranking de gasto com pessoal, sem React — o
 * comportamento sobre a marcação que `app/ranking/gasto-com-pessoal/page.tsx`
 * gera no servidor (M8 da auditoria de usabilidade, 06/10/2026).
 *
 * ## Por que existe
 *
 * A lista nacional tem centenas de linhas, e quem chega nela quer quase sempre
 * saber do próprio estado. Sem filtro, a resposta era rolar ou usar o Ctrl+F
 * com a sigla, que também acha a sigla dentro de nome de município.
 *
 * ## O que ele promete, e o que não
 *
 * - O controle nasce `hidden` e só aparece aqui: sem script, a tabela inteira
 *   continua na página e nada promete filtrar.
 * - A posição (#) continua a da lista NACIONAL. Renumerar faria o 1º do Ceará
 *   parecer o 1º do país; a contagem diz isso por extenso.
 * - A UF é lida da coluna "UF" da própria tabela, achada pelo cabeçalho: o que
 *   se filtra é exatamente o que se vê. Sem a coluna, o controle não aparece.
 * - `?uf=ce` no endereço abre filtrado, e trocar o filtro atualiza o endereço
 *   (sem nova entrada no histórico), para o link copiado levar ao que se via.
 */

const caixa = document.querySelector("[data-filtro-uf]");
const tabela = document.querySelector("table[data-filtro-alvo]");
if (caixa && tabela) iniciar(caixa, tabela);

function iniciar(caixa, tabela) {
  const select = caixa.querySelector("select");
  const limpar = caixa.querySelector("[data-limpar]");
  const status = caixa.querySelector("[role=status]");
  const cabecalho = tabela.tHead?.rows[0];
  const coluna = cabecalho
    ? [...cabecalho.cells].findIndex((c) => c.textContent.trim() === "UF")
    : -1;
  if (!select || !limpar || !status || coluna < 0 || !tabela.tBodies[0]) return;

  const linhas = [...tabela.tBodies[0].rows];
  const fmt = (n) => n.toLocaleString("pt-BR");

  function aplicar(uf) {
    let visiveis = 0;
    for (const linha of linhas) {
      const mostra = !uf || linha.cells[coluna]?.textContent.trim() === uf;
      linha.hidden = !mostra;
      if (mostra) visiveis += 1;
    }
    limpar.hidden = !uf;
    if (uf) {
      // "do Ceará", "de São Paulo": a contração vem de `deEstado`, no build,
      // e não de uma segunda tabela aqui.
      const de = select.selectedOptions[0].dataset.de;
      status.textContent = `${fmt(visiveis)} de ${fmt(linhas.length)} municípios, ` +
        `só ${visiveis === 1 ? "o" : "os"} ${de}. A posição (#) continua a da lista nacional.`;
    } else {
      status.textContent = `${fmt(linhas.length)} municípios`;
    }
  }

  function guardar(uf) {
    const url = new URL(location.href);
    if (uf) url.searchParams.set("uf", uf.toLowerCase());
    else url.searchParams.delete("uf");
    history.replaceState(history.state, "", url);
  }

  // O endereço manda, e não o valor que o navegador restaura no select ao
  // recarregar: os dois podem divergir, e a tabela tem de casar com o que a
  // barra de endereço diz. UF que não está entre as opções é ignorada.
  const pedida = (new URLSearchParams(location.search).get("uf") ?? "").toUpperCase();
  const valida = [...select.options].some((o) => o.value && o.value === pedida);
  select.value = valida ? pedida : "";
  aplicar(select.value);
  if (!valida && pedida) guardar("");

  select.addEventListener("change", () => {
    aplicar(select.value);
    guardar(select.value);
  });
  limpar.addEventListener("click", () => {
    select.value = "";
    aplicar("");
    guardar("");
    // O botão some ao limpar; o foco não pode ficar num elemento escondido.
    select.focus();
  });

  caixa.hidden = false;
}
