/**
 * A lógica pura do mapa por UF. **Sem JSX**, para poder ser testada.
 *
 * O `node:test` remove tipos de TypeScript mas **não transforma JSX**: um
 * `.tsx` importado por um teste estoura com `ERR_UNKNOWN_FILE_EXTENSION`. A
 * separação que isso força é a mesma que `lib/dados.ts` já segue, e pela mesma
 * razão — o que decide um número fica onde um teste alcança.
 */

import { PARES_CENSO, type ParCenso } from "./censo";
import { br, milReaisParaReais } from "./dados";
import { PARES_TRABALHO } from "./trabalho";

/** Como se escreve um valor da camada: na legenda, na rampa e na tabela. */
export type FormatoMapa = "pct" | "reais";

export type CamadaMapa = {
  /** Curto e sem espaço: vira `data-<chave>`, id de input e seletor de CSS. */
  chave: string;
  rotulo: string;
  /** Sigla da UF para o valor. Ausente = hachura, nunca zero. */
  valores: Record<string, number | null>;
  /** O que a legenda diz que a cor significa. */
  legenda: string;
  formato: FormatoMapa;
  /**
   * Os extremos da rampa, **por camada**. Com 0–100% fixo para todas, o
   * ensino superior (de 9,9% a 33,2% entre os estados, medido em 11/10/2026)
   * caía inteiro nas duas primeiras faixas e o desemprego (2,5% a 9,0%) na
   * primeira: um mapa de uma cor só, que não diz nada. Ver `dominio`.
   */
  min: number;
  max: number;
};

/**
 * Cinco faixas, e a cor sai de tokens do tema.
 *
 * **Escala sequencial de um matiz só**, e não um arco-íris: a auditoria de
 * daltonismo desta base (04/09/2026) reprovaria vermelho-verde, e uma rampa de
 * azul preserva a ordem para deuteranopia e protanopia — o que importa num
 * mapa é distinguir *mais* de *menos*, não identificar a cor.
 */
export const FAIXAS = 5;

/** Em qual das cinco faixas um valor cai, entre `min` e `max`. `null` fica fora. */
export function faixaDoValor(
  v: number | null,
  min = 0,
  max = 100,
): number | null {
  if (v === null || !Number.isFinite(v) || !(max > min)) return null;
  const t = (Math.max(min, Math.min(max, v)) - min) / (max - min);
  return Math.min(FAIXAS - 1, Math.floor(t * FAIXAS));
}

/**
 * Os extremos arredondados para fora, no `passo`: 8,3% a 32,9% vira 0% a 40%.
 *
 * Arredondados para a rampa ler como régua (ninguém compara "8,3%"), e PARA
 * FORA para nenhum estado cair fora dela. Sem valor nenhum, 0–100: a camada
 * sai inteira em hachura, e os extremos não importam.
 */
export function dominio(
  valores: Record<string, number | null>,
  passo: number,
): { min: number; max: number } {
  const v = Object.values(valores).filter(
    (x): x is number => x !== null && Number.isFinite(x));
  if (!v.length) return { min: 0, max: 100 };
  const min = Math.floor(Math.min(...v) / passo) * passo;
  let max = Math.ceil(Math.max(...v) / passo) * passo;
  if (max === min) max = min + passo;
  return { min, max };
}

/** O valor no formato da camada: `48,2%` ou `R$ 52.310`. */
export function formatarValor(v: number | null, formato: FormatoMapa, casas = 1): string {
  if (v === null) return "—";
  return formato === "pct" ? `${br(v, casas)}%` : `R$ ${br(v, 0)}`;
}

/** O extremo da rampa: sem casa decimal, e real em milhares. */
export function formatarExtremo(v: number, formato: FormatoMapa): string {
  return formato === "pct" ? `${br(v, 0)}%` : `R$ ${br(v / 1000, 0)} mil`;
}

/** O percentual de cada UF para um par numerador/denominador do snapshot. */
export function percentuaisPorUf(
  ufs: { sigla: string; totais: Record<string, number | null> }[],
  numerador: string,
  denominador: string,
): Record<string, number | null> {
  const saida: Record<string, number | null> = {};
  for (const uf of ufs) {
    const n = uf.totais[numerador];
    const d = uf.totais[denominador];
    // As duas pontas, e denominador maior que zero: ausência vira `null` e sai
    // hachurada no mapa, nunca 0% — que seria uma afirmação sobre o estado.
    saida[uf.sigla] =
      typeof n === "number" && typeof d === "number" && d > 0
        ? (n * 100) / d
        : null;
  }
  return saida;
}

/** O texto da legenda, com a mediana entre os estados para dar régua. */
export function legendaCom(
  descricao: string,
  valores: Record<string, number | null>,
  formato: FormatoMapa = "pct",
): string {
  const v = Object.values(valores).filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  if (!v.length) return descricao;
  const meio = Math.floor(v.length / 2);
  const mediana = v.length % 2 ? v[meio]! : (v[meio - 1]! + v[meio]!) / 2;
  return `${descricao} Mediana entre os estados: ${formatarValor(mediana, formato)}.`;
}

/** Monta uma camada percentual a partir de um par do Censo. */
function camadaDoPar(
  ufs: { sigla: string; totais: Record<string, number | null> }[],
  par: ParCenso,
  descricao: string,
): CamadaMapa {
  const valores = percentuaisPorUf(ufs, par.numerador, par.denominador);
  return {
    chave: par.chave,
    rotulo: par.rotulo,
    valores,
    legenda: legendaCom(descricao, valores),
    formato: "pct",
    ...dominio(valores, 10),
  };
}

/**
 * As camadas padrão do mapa, iguais na capa e na página do estado.
 *
 * **Existe para as duas não divergirem.** Antes a capa montava as camadas
 * inline; a página do estado montaria as suas, e no dia em que uma ganhasse um
 * indicador a outra ficaria para trás sem nada quebrar — as duas continuariam
 * desenhando um mapa correto, só que de coisas diferentes, com a mesma
 * aparência de estarem certas.
 *
 * Eram três camadas até 11/10/2026 (esgoto, alfabetização, entrega), com o
 * Censo inteiro já somado por estado no snapshot. Os pares e os critérios são
 * os mesmos da página do município (`PARES_CENSO`, `PARES_TRABALHO`): uma
 * definição só, para o mapa e a tabela não contarem o mesmo nome de dois
 * jeitos. O rendimento médio NÃO entra: a média por estado seria conta nossa
 * (massa ÷ pessoas), e a regra de `lib/trabalho.ts` é publicar a do IBGE.
 *
 * As regras de cor saem de `cssDasCamadas`, a partir desta lista: camada nova
 * não depende de ninguém lembrar do CSS.
 */
export function camadasPadrao(
  ufs: { sigla: string; totais: Record<string, number | null> }[],
  estados: { uf: string; municipios: number; taxa: number; mediana: number | null }[],
): CamadaMapa[] {
  const par = (chave: string) =>
    [...PARES_CENSO, ...PARES_TRABALHO].find((p) => p.chave === chave)!;
  const censo = (chave: string) => {
    const p = par(chave);
    return camadaDoPar(ufs, p,
      `${p.contagem[0]!.toUpperCase()}${p.contagem.slice(1)} que ${p.criterio}, no Censo 2022.`);
  };

  const entrega: Record<string, number | null> = {};
  const pessoal: Record<string, number | null> = {};
  for (const e of estados) {
    entrega[e.uf] = e.municipios > 0 ? e.taxa : null;
    pessoal[e.uf] = e.municipios > 0 ? e.mediana : null;
  }

  // PIB do ano mais recente dividido pela população do Censo 2022: a mesma
  // conta do cartão "PIB por habitante" da página do município, para o estado
  // e o município não dividirem por populações diferentes.
  const pibHab: Record<string, number | null> = {};
  for (const uf of ufs) {
    const pib = milReaisParaReais(uf.totais["pib-municipal"] ?? null);
    const pop = uf.totais["populacao-censo-2022"] ?? null;
    pibHab[uf.sigla] = pib !== null && pop ? pib / pop : null;
  }

  return [
    censo("esgoto"),
    censo("agua"),
    censo("lixo"),
    censo("internet"),
    censo("alfabetizacao"),
    censo("superior"),
    censo("desocupacao"),
    censo("previdencia"),
    {
      chave: "pib-habitante",
      rotulo: "PIB por habitante",
      valores: pibHab,
      legenda: legendaCom(
        "Soma do PIB dos municípios, a preços correntes, dividida pela " +
        "população do Censo 2022. Mede a produção no território, não a renda " +
        "de quem mora nele.", pibHab, "reais"),
      formato: "reais",
      ...dominio(pibHab, 10000),
    },
    {
      chave: "entrega",
      rotulo: "Entrega do relatório fiscal",
      valores: entrega,
      legenda: legendaCom(
        "Municípios que entregaram o Relatório de Gestão Fiscal ao SICONFI, " +
        "quadrimestral ou simplificado. O Distrito Federal presta contas " +
        "como estado e aparece hachurado.", entrega),
      formato: "pct",
      ...dominio(entrega, 10),
    },
    {
      chave: "pessoal",
      rotulo: "Gasto com pessoal",
      valores: pessoal,
      legenda: legendaCom(
        "Mediana do gasto com pessoal, em % da receita corrente líquida " +
        "ajustada, entre os municípios que entregaram o relatório. O Distrito Federal, que presta contas como estado, " +
        "aparece hachurado.", pessoal),
      formato: "pct",
      ...dominio(pessoal, 5),
    },
  ];
}

/**
 * As regras de CSS que trocam a cor pela camada escolhida.
 *
 * **Geradas da lista, e não escritas à mão.** Até 11/10/2026 elas moravam em
 * `mapa-uf.module.css`, chave por chave, com um teste cobrando que as duas
 * listas não divergissem: uma chave sem regra deixava o mapa inteiro na cor
 * padrão, sem erro. Com onze camadas seriam 88 regras copiadas; gerando, a
 * divergência deixa de existir em vez de ser vigiada.
 *
 * `classes` são os nomes que o CSS Module deu (`estilos.bloco` etc.).
 */
export function cssDasCamadas(
  chaves: string[],
  classes: { bloco: string; uf: string; texto: string; extremos: string },
): string {
  const regras: string[] = [];
  for (const k of chaves) {
    // A chave vai crua para dentro de um seletor e de um `<style>`: só letra
    // minúscula e hífen, ou a regra quebra (ou injeta) em silêncio.
    if (!/^[a-z][a-z-]*$/.test(k)) throw new Error(`chave de camada inválida: ${k}`);
    const sel = `.${classes.bloco}:has(input[value="${k}"]:checked)`;
    for (let i = 0; i < FAIXAS; i++) {
      regras.push(`${sel} .${classes.uf}[data-${k}="${i}"]{fill:var(--mapa-${i})}`);
    }
    regras.push(
      `${sel} .${classes.uf}[data-${k}="sem"]` +
      `{fill:url(#mapa-sem-dado);stroke:var(--tinta-fraca);stroke-width:2}`);
    regras.push(`${sel} .${classes.texto}[data-de="${k}"]{display:block}`);
    regras.push(`${sel} .${classes.extremos}[data-de="${k}"]{display:contents}`);
  }
  return regras.join("\n");
}
