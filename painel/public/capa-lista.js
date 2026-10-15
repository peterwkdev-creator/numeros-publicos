/**
 * A lógica da tabela de municípios da capa, sem DOM: expandir, filtrar e
 * ordenar as 5.571 linhas de `/dados/capa.json`. O `capa.js` a usa no
 * navegador; o teste a importa e a compara com as 50 linhas que o build
 * escreve na página (15/10/2026, item 10 da revisão de 11/10).
 *
 * ## Por que um arquivo à parte
 *
 * A primeira tela da tabela sai do servidor, em `app/municipios.tsx`, e as
 * seguintes saem daqui. São duas implementações da mesma ordem, e duas
 * implementações divergem: se divergissem, a lista "pularia" no primeiro
 * clique. Separada do DOM, esta parte roda no Node, e o teste confere as duas
 * no snapshot real.
 */

import { chave } from "./busca.js";

export const PAGINA = 50;

/**
 * As linhas cruas viram objetos uma vez, com a chave de busca já calculada:
 * filtrar a cada tecla não refaz `normalize` em 5.571 nomes.
 */
export function expandir({ linhas, faixas }) {
  return linhas.map(([codigo, nome, uf, ...valores], i) => ({
    codigo, nome, uf, valores, faixa: faixas[i] ?? "", chave: chave(nome),
  }));
}

/**
 * Os filtros se somam. `faixa` é a letra de `LETRA_FAIXA`; `porte`, o par
 * `[min, max)` de população, na coluna `iPop`.
 */
export function selecionar(lista, { termo = "", uf = "", faixa = "", porte = null, iPop = 0 }) {
  const alvo = chave(termo);
  return lista.filter((x) => {
    if (uf && x.uf !== uf) return false;
    if (faixa && x.faixa !== faixa) return false;
    if (porte) {
      const pop = x.valores[iPop];
      // Sem população conhecida fica FORA de qualquer faixa de porte:
      // colocá-la na menor seria afirmar um tamanho que não se sabe.
      if (pop == null || pop < porte[0] || pop >= porte[1]) return false;
    }
    return !alvo || x.chave.includes(alvo);
  });
}

/**
 * `coluna` é `"nome"` ou o índice do indicador. A ordenação é estável: o
 * empate fica na ordem do snapshot, aqui e no build.
 */
export function ordenar(lista, coluna, desc) {
  return [...lista].sort((a, b) => {
    if (coluna === "nome") {
      return desc ? b.nome.localeCompare(a.nome, "pt-BR") : a.nome.localeCompare(b.nome, "pt-BR");
    }
    const va = a.valores[coluna];
    const vb = b.valores[coluna];
    // Ausente sempre no fim, independente da direção: "não sabemos" não é um
    // valor pequeno nem grande.
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return desc ? vb - va : va - vb;
  });
}

/** O `br` de `lib/dados.ts`, para inteiro: "—" quando falta, nunca zero. */
export const br = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
