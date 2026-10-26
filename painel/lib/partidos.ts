/**
 * A cor de cada partido, a mesma em todos os cargos e nas duas páginas das
 * eleições (26/10/2026, pedido do Peter). Aqui só a CHAVE da cor; os tons
 * moram em `app/componentes/partidos.module.css` (um por tema), que um teste
 * confere contra o fundo.
 *
 * PT e PL são o vermelho e o azul de Lula e Flávio no presidente; os outros
 * cinco partidos com cor própria são os que mais elegeram governador em 2026
 * ou que costumam liderar as bancadas; todo o resto é "outros", em cinza, com
 * o nome escrito na legenda (a cor nunca é a única pista). Fora da paleta não
 * quer dizer menor: oito cores é o que se distingue num mapa sem confundir.
 */

export const CORES = ["pt", "pl", "psd", "rep", "pp", "uniao", "mdb", "outros"] as const;
export type CorPartido = (typeof CORES)[number];

/** O nome da cor, para quem lê a legenda sem ver o tom (e para o teste). */
export const NOME_DA_COR: Record<CorPartido, string> = {
  pt: "vermelho", pl: "azul", psd: "laranja", rep: "verde-petróleo",
  pp: "roxo", uniao: "rosa", mdb: "marrom", outros: "cinza",
};

const POR_SIGLA: Record<string, CorPartido> = {
  PT: "pt", PL: "pl", PSD: "psd", REPUBLICANOS: "rep", PP: "pp",
  "UNIÃO": "uniao", UNIAO: "uniao", MDB: "mdb",
};

/** A chave da cor do partido pela sigla do TSE; fora da paleta, "outros". */
export function corDoPartido(sigla: string): CorPartido {
  return POR_SIGLA[sigla.trim().toUpperCase()] ?? "outros";
}
