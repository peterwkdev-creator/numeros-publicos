/**
 * A prorrogação da votação em 25/10/2026 em números (decisão do Peter,
 * 29/10/2026): o destaque é o número oficial do TSE; a medição própria,
 * lida dos boletins (bweb) e dos registros (log) das urnas do 2º turno, fica
 * na página de dados como conferência independente.
 *
 * Constantes, não leitura ao vivo: o TSE publicou os números numa nota, sem
 * arquivo de dados, e a medição própria pede cerca de 31 mil pedidos (não cabe
 * numa visita). Método e endereços: seção "Eleições 2026: prorrogação" do
 * registro do projeto.
 */

/** Nota do TSE com os votos depois das 17h (27/10/2026, 15h21; atualizada às 18h18). */
export const TSE_VOTOS_DEPOIS =
  "https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/eleicoes-2026-mais-de-34-mil-votos-foram-registrados-apos-as-17h-no-2o-turno";
export const TSE_VOTOS_DEPOIS_DATA = "27/10/2026";

/** Notícia do STF sobre a decisão (25/10/2026, 18h28). */
export const STF_DECISAO =
  "https://noticias.stf.jus.br/postsnoticias/stf-prorroga-votacao-ate-as-19h-em-locais-onde-urnas-permaneceram-abertas-apos-as-17h/";

/** TV Senado, 26/10/2026: "medida inédita no TSE" (nem o STF nem o TSE dizem). */
export const SENADO_INEDITA =
  "https://www12.senado.leg.br/tv/programas/noticias-1/2026/10/presidente-do-tse-diz-que-eleicao-ocorreu-com-seguranca-apesar-de-prorrogacao-inedita";

/** Os números da nota do TSE. */
export const OFICIAL = {
  votosDepois17h: 34_393,
  votos17a18: 32_399,
  votos18a19: 1_981,
  votosDepois19h: 13,
  secoesEncerradasDepois17h: 497_333,
  secoesAbertasDepois17h10: 24_268,
  votosNessasSecoes: 8_673,
  secoesEncerradasDepois19h: 6_766,
  votosNelas: 4_773,
  /** Os quatro estados com mais seções abertas depois das 17h10 (sigla minúscula, a chave do UF_NOME). */
  porUf: [
    { uf: "sp", secoes: 6_093, votos: 2_496 },
    { uf: "rj", secoes: 5_713, votos: 2_349 },
    { uf: "ba", secoes: 3_787, votos: 1_656 },
    { uf: "pe", secoes: 1_872, votos: 577 },
  ],
} as const;

/**
 * A medição própria (29/10/2026). (a) votos depois das 17h nas urnas
 * encerradas depois das 17h45; (b) todos os votos depois das 17h, censo das
 * seções encerradas depois das 17h15 e amostra das demais (IC de 95%). O 1º
 * turno é a mesma urna, lida do mesmo registro: base só indicativa, porque
 * tinha 7 cargos e o voto era mais lento.
 */
export const MEDIDO = {
  urnasDepois17h45: 7_357,
  votosA: 5_048,
  votosB: 35_369,
  icB: [32_070, 38_668],
  turno1A: 69_527,
  turno1B: 3_890_000,
  icTurno1B: [3_670_000, 4_100_000],
} as const;
