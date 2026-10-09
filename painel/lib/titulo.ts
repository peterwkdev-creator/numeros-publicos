import { br } from "./dados";
import type { Faixa } from "./fiscal";

/**
 * O `<title>` e o começo da descrição da página de município.
 *
 * ## O experimento de 22/09/2026, e por que ele é por UF
 *
 * O export do Search Console (02 a 20/09) mostrou que 87% das impressões
 * identificáveis eram "quantos habitantes tem X", com CTR de 0,05%: o Google
 * responde a população na própria página de resultados, e ninguém clica. E
 * **zero** consulta sobre gasto com pessoal, receita ou limite legal, que é o
 * que só este site tem. O título atual começa por "população", e alinha a
 * página justamente à consulta que não gera visita.
 *
 * A hipótese: começar pelo veredito fiscal faz a página disputar a consulta
 * que o Google NÃO responde. Ela se testa numa UF só, e as outras 26 são o
 * controle, no mesmo período. Depois de duas ou três semanas, o Search
 * Console, filtrado por página `/municipio/*-sp/`, responde se aparecem
 * consultas fiscais e se o CTR muda. Ver `numeros-publicos-descoberta.md`.
 *
 * Tirar o experimento é esvaziar `UFS_TITULO_FISCAL`.
 *
 * ## O resultado, lido em 09/10/2026: desfeito
 *
 * 23/09–07/10 contra 08–22/09: as impressões de consulta de população nas
 * páginas de SP caíram 95% (1.534 → 79), contra 70% no RS e 66% em MG, os
 * controles; consulta fiscal, nenhuma, em SP ou no site inteiro (0 de
 * 1.716). O título perdeu a consulta commodity e não ganhou outra. A lista
 * ficou vazia; as funções seguem, e os testes as exercitam com SP, para um
 * teste futuro (quem busca diz "despesa com pessoal", não "pessoal").
 */
export const UFS_TITULO_FISCAL: ReadonlySet<string> = new Set();

/** O Google corta perto de 60 caracteres. */
export const LIMITE_TITULO = 60;

const VEREDITO: Partial<Record<Faixa, string>> = {
  "acima-legal": "acima do limite legal",
  "acima-prudencial": "acima do limite prudencial",
  abaixo: "dentro do limite",
};

const VEREDITO_CURTO: Partial<Record<Faixa, string>> = {
  "acima-legal": "acima do limite",
  // NUNCA "em alerta": a LRF tem um limite de ALERTA próprio (48,6%), e
  // chamar o prudencial (51,3%) assim afirmaria outra coisa sobre a prefeitura.
  "acima-prudencial": "acima do prudencial",
  abaixo: "dentro do limite",
};

/**
 * O título de sempre: o nome inteiro e o sufixo que couber. Encurta o SUFIXO,
 * nunca o nome — o nome é o que a pessoa digitou na busca.
 */
export function tituloDe(nome: string, uf: string): string {
  const base = `${nome} (${uf})`;
  for (const sufixo of [
    " — população, PIB e gasto com pessoal",
    " — população, PIB e dados fiscais",
    " — dados abertos do município",
    " — dados abertos",
  ]) {
    if ((base + sufixo).length <= LIMITE_TITULO) return base + sufixo;
  }
  return base;
}

/**
 * O título que começa pelo gasto com pessoal, para as UFs do experimento.
 *
 * Só com número publicável: sem relatório, implausível ou "como estado" caem
 * no título de sempre. O implausível, em especial, **nunca** vai para o título
 * — a página o exibe marcado; o resultado de busca não tem espaço para a marca.
 */
export function tituloFiscalDe(
  nome: string,
  uf: string,
  faixa: Faixa | undefined,
  percentual: number | null | undefined,
  ufs: ReadonlySet<string> = UFS_TITULO_FISCAL,
): string {
  const veredito = faixa ? VEREDITO[faixa] : undefined;
  if (!ufs.has(uf) || !veredito || typeof percentual !== "number") {
    return tituloDe(nome, uf);
  }
  // Duas casas, como a página: com uma, 54,04% viraria "54,0%… acima do
  // limite" de 54% — verdade que se lê como contradição.
  const pct = `${br(percentual, 2)}%`;
  // O veredito é o gancho, e é o primeiro a não caber em nome longo. A forma
  // curta vem antes de desistir dele: "acima do limite" cabe onde "acima do
  // limite legal" não cabe.
  const curto = VEREDITO_CURTO[faixa as Faixa];
  for (const t of [
    `${nome} (${uf}): ${pct} da receita com pessoal, ${veredito}`,
    `${nome} (${uf}): ${pct} da receita com pessoal, ${curto}`,
    `${nome} (${uf}): pessoal ${pct} da receita, ${curto}`,
    `${nome} (${uf}): pessoal ${pct}, ${curto}`,
    `${nome} (${uf}): gasto com pessoal ${pct}`,
  ]) {
    if (t.length <= LIMITE_TITULO) return t;
  }
  return tituloDe(nome, uf);
}

/**
 * O começo da descrição nas UFs do experimento: a prefeitura e o veredito
 * primeiro, com o limite escrito, e a população vai para o fim da lista.
 * `null` fora do experimento ou sem número publicável.
 */
export function aberturaFiscalDe(
  nome: string,
  uf: string,
  faixa: Faixa | undefined,
  percentual: number | null | undefined,
  limites: { legal: number; prudencial: number },
  ufs: ReadonlySet<string> = UFS_TITULO_FISCAL,
): string | null {
  const veredito = faixa ? VEREDITO[faixa] : undefined;
  if (!ufs.has(uf) || !veredito || typeof percentual !== "number") {
    return null;
  }
  // O limite citado é o do veredito: "acima do limite prudencial de 51,3%",
  // e não "de 54%" — um número errado ao lado do veredito certo ainda é
  // afirmação falsa.
  const limite = faixa === "acima-prudencial" ? limites.prudencial : limites.legal;
  return `A prefeitura de ${nome} (${uf}) comprometeu ${br(percentual, 2)}% da ` +
    `receita com pessoal, ${veredito} de ${br(limite, casasDe(limite))}%`;
}

/**
 * As casas que o limite TEM, até duas: 54 → "54", 51,3 → "51,3", 59,05 →
 * "59,05". Arredondar para uma casa fixa escreveria "acima do limite
 * prudencial de 59,1%" para quem tem 59,08% e limite próprio de 59,05% — o
 * número ao lado do veredito o desmentiria.
 */
export function casasDe(limite: number): number {
  return [0, 1].find((k) => Number(limite.toFixed(k)) === limite) ?? 2;
}
