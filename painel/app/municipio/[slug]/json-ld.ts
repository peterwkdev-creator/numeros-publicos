import { br } from "../../../lib/dados";
import { FONTES_DA_BASE, VARIAVEIS_DA_BASE, catalogoDe, coberturaTemporal, identificadorIbge, LICENCA_DADOS, palavrasChave } from "../../../lib/jsonld";
import { SITE } from "../../../lib/servidor";
import type { Contexto } from "./contexto";

/**
 * O JSON-LD da página: um `Dataset` do município.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export function jsonLdDe(c: Contexto) {
  const { snapshot, fiscal, ideb, m, uf } = c;
  // JSON-LD: é o que faz o Google entender que a página descreve um lugar e um
  // conjunto de dados, em vez de tratá-la como texto solto.
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `Dados abertos de ${m.nome} (${m.uf})`,
    description:
      `População, PIB, despesa com pessoal e despesa liquidada por função ` +
      `orçamentária do município de ${m.nome}, ${m.uf}, a partir das APIs ` +
      `públicas do IBGE e do SICONFI/Tesouro Nacional.`,
    url: `${SITE}/municipio/${m.slug}/`,
    license: LICENCA_DADOS,
    isAccessibleForFree: true,
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    // Os cinco campos que a auditoria de 03/09/2026 achou ausentes contra a
    // documentação do Google para `Dataset`. Nenhum é obrigatório -- e é por
    // isso que passavam: a página valida sem eles. O que eles decidem é se o
    // conjunto aparece DESCRITO no Google Dataset Search ou some no meio das
    // páginas de texto.
    identifier: identificadorIbge(m.codigo),
    keywords: palavrasChave([m.nome, uf?.nome ?? m.uf, "IDEB", "IBGE", "SICONFI"]),
    temporalCoverage: coberturaTemporal(snapshot, fiscal, ideb),
    variableMeasured: VARIAVEIS_DA_BASE,
    includedInDataCatalog: catalogoDe(SITE),
    spatialCoverage: {
      "@type": "Place",
      name: `${m.nome}, ${m.uf}, Brasil`,
      identifier: String(m.codigo),
    },
    // `distribution` e o campo que separa "pagina que fala de dados" de
    // "dataset". Sem um arquivo baixavel apontado aqui, o schema.org/Dataset e
    // uma alegacao sem lastro -- e o Google trata como tal.
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "text/csv",
        contentUrl: `${SITE}/municipio/${m.slug}/dados.csv`,
        name: `Dados de ${m.nome} (${m.uf}) em CSV`,
      },
      {
        "@type": "DataDownload",
        encodingFormat:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        contentUrl: `${SITE}/dados/municipios.xlsx`,
        name: "Base completa em planilha, com dicionário e procedência",
      },
      {
        "@type": "DataDownload",
        encodingFormat: "text/csv",
        contentUrl: `${SITE}/dados/municipios.csv`,
        name: `Base completa: ${br(snapshot.municipios.length)} municípios`,
      },
    ],
    isBasedOn: FONTES_DA_BASE,
  };
}
