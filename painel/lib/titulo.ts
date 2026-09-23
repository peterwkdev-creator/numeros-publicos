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
 */
export const UFS_TITULO_FISCAL: ReadonlySet<string> = new Set(["SP"]);

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
): string {
  const veredito = faixa ? VEREDITO[faixa] : undefined;
  if (!UFS_TITULO_FISCAL.has(uf) || !veredito || typeof percentual !== "number") {
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
): string | null {
  const veredito = faixa ? VEREDITO[faixa] : undefined;
  if (!UFS_TITULO_FISCAL.has(uf) || !veredito || typeof percentual !== "number") {
    return null;
  }
  // O limite citado é o do veredito: "acima do limite prudencial de 51,3%",
  // e não "de 54%" — um número errado ao lado do veredito certo ainda é
  // afirmação falsa.
  const limite = faixa === "acima-prudencial" ? limites.prudencial : limites.legal;
  return `A prefeitura de ${nome} (${uf}) comprometeu ${br(percentual, 2)}% da ` +
    `receita com pessoal, ${veredito} de ${br(limite, Number.isInteger(limite) ? 0 : 1)}%`;
}
