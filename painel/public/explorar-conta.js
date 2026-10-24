/**
 * A conta da página /explorar, sem DOM: recorte, agregado pelas células,
 * formato e impressão digital da ordem. O `explorar.js` a usa no navegador;
 * o teste a importa e a compara com `recorteDe` de `lib/explorar.ts`, que
 * escreve a primeira tela no build (Fase 3, 24/10/2026).
 *
 * ## Por que um arquivo à parte
 *
 * São duas implementações da mesma conta: a do build (TypeScript, que não
 * importa do `public/`) e esta. Se divergissem, a página mostraria um número
 * no HTML e outro no primeiro clique. Separada do DOM, esta parte roda no
 * Node, e o teste confere as duas nos 16 indicadores × Brasil, cada região,
 * cada UF e cada faixa, sobre o snapshot real.
 *
 * ## O que difere de `recorteDe`
 *
 * Só a entrada: o `indice.json` não traz o código do município (cada linha é
 * `[nome, uf]`, ou `[nome, uf, 1]` no estado). A linha do recorte leva a
 * posição no índice (`i`) no lugar do código; o resto é a mesma regra.
 */

/** As 7 faixas de `FAIXAS_POPULACAO`, só os rótulos, na mesma ordem. */
export const FAIXAS = [
  "Até 5 mil", "De 5 mil a 10 mil", "De 10 mil a 20 mil", "De 20 mil a 50 mil",
  "De 50 mil a 100 mil", "De 100 mil a 500 mil", "Mais de 500 mil",
];

/** As linhas cruas do `indice.json` viram `{ nome, uf, estado }`. */
export function expandirIndice(indice) {
  return indice.map(([nome, uf, estado]) => ({ nome, uf, estado: estado === 1 }));
}

/** Igual a `impressaoDaOrdem`: FNV-1a de 32 bits sobre "nome\tuf\n". */
export function impressaoDaOrdem(linhas) {
  let h = 0x811c9dc5;
  const texto = linhas.map((l) => `${l.nome}\t${l.uf}\n`).join("");
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * O arquivo serve para este índice? Ordem divergente (um arquivo de outro
 * build no cache) ou tamanho diferente: cada linha mostraria o valor do
 * vizinho, e a página não desenha nada (espec, §10, armadilha 1).
 */
export function casaComIndice(arquivo, entradas) {
  return arquivo.valores.length === entradas.length
    && arquivo.faixas.length === entradas.length
    && arquivo.ordem === impressaoDaOrdem(entradas);
}

/**
 * O filtro do endereço (`?i=&regiao=&uf=&pop=`), validado. O que não existe
 * cai fora, e `invalido` diz que o endereço precisa ser limpo (espec, §10,
 * armadilha 4): a UF fora da região pedida também é inválida.
 */
export function lerFiltro(params, indicadores, ufs, padrao) {
  const filtro = {};
  let invalido = false;
  let indicador = padrao;
  const i = params.get("i");
  if (i !== null) {
    if (indicadores.includes(i)) indicador = i;
    else invalido = true;
  }
  const regiao = params.get("regiao");
  if (regiao !== null) {
    if (ufs.some((u) => u.regiao === regiao)) filtro.regiao = regiao;
    else invalido = true;
  }
  const uf = params.get("uf");
  if (uf !== null) {
    const achada = ufs.find((u) => u.sigla === uf);
    if (achada && (!filtro.regiao || achada.regiao === filtro.regiao)) filtro.uf = uf;
    else invalido = true;
  }
  const pop = params.get("pop");
  if (pop !== null) {
    if (/^[0-6]$/.test(pop)) filtro.faixa = Number(pop);
    else invalido = true;
  }
  return { indicador, filtro, invalido };
}

/** Igual a `mediana` de `lib/censo.ts`. */
export function mediana(valores) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

const arredondar = (v, casas) => {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

/**
 * Igual a `recorteDe`. `ind` precisa de `tipo`, `casas` e `mult` (razão);
 * `entradas`, de `expandirIndice`; `ufs`, de `{ sigla, regiao }`.
 */
export function recorte(ind, arquivo, entradas, ufs, filtro = {}) {
  const siglas = ufs
    .filter((u) => (!filtro.regiao || u.regiao === filtro.regiao)
      && (!filtro.uf || u.sigla === filtro.uf))
    .map((u) => u.sigla);
  const dentro = new Set(siglas);
  const naFaixa = (f) => filtro.faixa === undefined || String(f) === String(filtro.faixa);

  const linhas = [];
  entradas.forEach((e, i) => {
    if (e.estado || !dentro.has(e.uf) || !naFaixa(arquivo.faixas[i])) return;
    linhas.push({ nome: e.nome, uf: e.uf, i, valor: arquivo.valores[i] ?? null });
  });
  linhas.sort((a, b) => {
    if (a.valor === null || b.valor === null) {
      if (a.valor !== b.valor) return a.valor === null ? 1 : -1;
    } else if (a.valor !== b.valor) return b.valor - a.valor;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  const agregar = (doRecorte) => {
    if (ind.tipo === "mediana") {
      const v = linhas.filter((l) => doRecorte.has(l.uf) && l.valor !== null)
        .map((l) => l.valor);
      const m = mediana(v);
      return m === null ? null : arredondar(m, ind.casas);
    }
    let n = null;
    let d = 0;
    for (const c of arquivo.celulas) {
      if (!doRecorte.has(String(c[0])) || !naFaixa(c[1])) continue;
      if (typeof c[2] === "number") n = (n ?? 0) + c[2];
      if (typeof c[3] === "number") d += c[3];
    }
    if (n === null) return null;
    if (ind.tipo === "soma") return arredondar(n, ind.casas);
    return d ? arredondar((ind.mult * n) / d, ind.casas) : null;
  };

  const semDado = linhas.filter((l) => l.valor === null).length;
  return {
    agregado: agregar(dentro),
    municipios: linhas.length,
    semDado,
    linhas,
    porUf: Object.fromEntries(siglas.map((s) => [s, agregar(new Set([s]))])),
  };
}

/** Igual a `formatarExplorar`: `48,2%`, `R$ 52.310`, `5,2`, `1.234`. */
export function formatar(v, ind) {
  if (v === null) return "sem dado";
  const com = (n, c) => n.toLocaleString("pt-BR", {
    minimumFractionDigits: c, maximumFractionDigits: c,
  });
  switch (ind.formato) {
    case "pct": return `${com(v, 1)}%`;
    case "reais": return `R$ ${com(v, ind.casas)}`;
    case "indice": return com(v, Number.isInteger(Math.round(v * 100) / 10) ? 1 : 2);
    default: return com(v, 0);
  }
}
