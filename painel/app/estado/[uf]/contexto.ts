import { cagedDeVarios } from "../../../lib/caged";
import { medidasDe, taxasCache } from "../../../lib/censo";
import { milReaisParaReais, periodoDe } from "../../../lib/dados";
import { emendasDeVarios, porHabitante, porHabitanteDaUf } from "../../../lib/emendas";
import { slugUf, deEstado } from "../../../lib/estado";
import { nomeQuadrimestre, atualDeFuncoes } from "../../../lib/fiscal";
import { medianaUltimaEdicao } from "../../../lib/ideb";
import { inssDaUf } from "../../../lib/inss";
import { FONTES, VARIAVEIS, catalogoDe, coberturaTemporal, palavrasChave, LICENCA_DADOS } from "../../../lib/jsonld";
import { mediana, panoramaEstados, posicaoNaLista, rankingCache } from "../../../lib/nacional";
import { SITE } from "../../../lib/servidor";
import { atualizadoEm } from "../../../lib/sitemap";
import type { Snapshot } from "../../../lib/dados";
import type { ResumoEstado } from "../../../lib/estado";
import type { SnapshotFiscal } from "../../../lib/fiscal";
import type { SnapshotIdeb } from "../../../lib/ideb";
import type { SnapshotCaged } from "../../../lib/caged";
import type { SnapshotEmendas } from "../../../lib/emendas";
import type { SnapshotInss } from "../../../lib/inss";
import type Estilos from "./estado.module.css";

/** Os dados do build que `carregar` (em `page.tsx`) entrega ao cálculo. */
export type Dados = {
  snapshot: Snapshot;
  fiscal: SnapshotFiscal;
  ideb: SnapshotIdeb;
  idebFinais: SnapshotIdeb;
  caged: SnapshotCaged;
  emendas: SnapshotEmendas;
  inss: SnapshotInss;
};

/**
 * Tudo o que a página deriva dos dados para UM estado, calculado uma vez e entregue às seções.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export function montarContexto(dados: Dados, r: ResumoEstado) {
  const { snapshot, fiscal, ideb, idebFinais, caged, emendas, inss } = dados;
  // Os mesmos argumentos do sitemap geral, que é o que lista os estados.
  const atualizado = atualizadoEm(snapshot, fiscal);
  // Quem presta contas como estado sai da conta de ausentes: ele entregou, na
  // esfera onde de fato presta contas. Somá-lo aqui seria repetir, uma casa
  // adiante, o erro que a faixa `como-estado` existe para corrigir.
  // E quem ainda não estava instalado no exercício, pelo mesmo motivo no eixo
  // do tempo: não havia prefeitura para entregar. Ver `INSTALADO_EM`.
  const ausentes = r.uf.municipios - r.publicaram - r.comoEstado - r.naoInstalados;

  // Os 27 estados, para situar este entre eles — o que só ficou possível com
  // a varredura nacional fechada. Ver a nota de desenho em `lib/nacional.ts`.
  const panorama = panoramaEstados(fiscal);
  const meu = panorama.find((x) => x.uf === r.uf.sigla);
  // Os dois pares de vizinhos da ressalva da entrega, lidos do dado: o texto
  // era digitado ("86% e 15%") e ficou falso quando o RGF Simplificado entrou
  // na conta. Sem contraste de 30 pontos nos dois pares, a frase sai.
  const taxaDe = (uf: string) => panorama.find((x) => x.uf === uf)?.taxa ?? null;
  const sc = taxaDe("SC"), rs = taxaDe("RS"), ba = taxaDe("BA"), ma = taxaDe("MA");
  const contraste = sc !== null && rs !== null && ba !== null && ma !== null &&
    Math.abs(sc - rs) >= 30 && Math.abs(ba - ma) >= 30;
  const posTaxa = meu
    ? posicaoNaLista(meu.taxa, panorama.map((x) => x.taxa))
    : null;
  const medianas = panorama
    .map((x) => x.mediana)
    .filter((v): v is number => v !== null);
  const posMediana = meu?.mediana != null
    ? posicaoNaLista(meu.mediana, medianas)
    : null;
  // O país como referência desenhada nas duas tiras (revisão 2, lote C):
  // a entrega somada dos estados com relatório municipal e a mediana
  // nacional do ranking, a mesma que a página do ranking publica.
  const somaMunicipios = panorama.reduce((t, x) => t + x.municipios, 0);
  const brasilTaxa = somaMunicipios
    ? (panorama.reduce((t, x) => t + x.publicaram, 0) / somaMunicipios) * 100
    : null;
  const brasilMediana = rankingCache(fiscal, snapshot).mediana;

  // Mediana e não média: o IDEB vai de 0 a 10, e um punhado de municípios
  // pequenos com nota extrema desloca a média sem descrever o estado.
  const medIdeb = medianaUltimaEdicao(ideb, r.municipios.map((m) => m.codigo));

  // Quantos municípios do estado NÃO têm rede municipal de ensino.
  //
  // O cartão dizia "mediana de N municípios" e parava ali, deixando o leitor
  // supor que o resto era lacuna da coleta. Não é: o INEP publica o IDEB por
  // REDE, e onde a prefeitura não administra as escolas não há linha municipal
  // a publicar. Verificado em 04/09/2026 reingerindo com `--rede Estadual`:
  // dos 138 sem rede municipal nos anos iniciais, 133 aparecem na estadual.
  //
  // O número dos anos finais é o que surpreende: no Paraná são 388 de 399.
  const semRede = r.municipios.filter(
    (m) => !ideb.municipios[String(m.codigo)]).length;
  const semRedeFinais = r.municipios.filter(
    (m) => !idebFinais.municipios[String(m.codigo)]).length;

  const de = deEstado(r.uf.sigla);

  // O Censo somado no estado, contra a mesma conta no pais. As duas sao
  // taxa ponderada (soma sobre soma), entao comparam diretamente -- ao
  // contrario da pagina do municipio, onde a coluna vizinha e a MEDIANA
  // dos municipios e precisa da ressalva que separa as duas coisas.
  const medidasCenso = medidasDe(r.uf.totais);

  // O Novo Caged somado nos municípios do estado (`cagedDeVarios`). Um teste
  // cobra que os 27 estados mais o "não identificado" dão o número oficial do
  // país; o do estado no sumário do MTE inclui ainda o que tem UF e não tem
  // município, e a ressalva diz isso.
  const cagedUf = cagedDeVarios(caged, r.municipios.map((m) => m.codigo));
  const semMunicipio =
    caged.naoIdentificado[0].reduce((s, x) => s + x, 0) +
    caged.naoIdentificado[1].reduce((s, x) => s + x, 0);

  // As emendas pagas às prefeituras do estado, somadas; por habitante do
  // estado (a estimativa do IBGE, a mais perto do ano do dinheiro) e, por
  // município, a mediana da mesma régua que a página de cada um usa.
  const emendasUf = emendasDeVarios(emendas, r.municipios.map((m) => m.codigo));
  const popEstimada = r.uf.totais["populacao-estimada"] ?? null;
  const anoEstimada = periodoDe(snapshot, "populacao-estimada");
  const emendasPh = porHabitante(emendasUf.cheio.reais, popEstimada);
  const phMunicipios = porHabitanteDaUf(emendas, snapshot, r.uf.sigla);
  const medianaPh = phMunicipios.length >= 5 ? mediana(phMunicipios) : null;

  // O INSS pelas agências do estado, benefício a benefício, ao lado do país.
  const inssUf = inss.fila ? inssDaUf(inss, r.uf.sigla) : [];
  const esperaUf = inssUf.reduce((t, x) => t + (x.fila?.n ?? 0), 0);
  const taxasPais = taxasCache(snapshot.municipios, snapshot.colunas);
  const pop = r.uf.totais["populacao-censo-2022"] ?? null;
  const pibReais = milReaisParaReais(r.uf.totais["pib-municipal"] ?? null);
  const quadrimestre = nomeQuadrimestre(fiscal.exercicio, fiscal.periodo);
  const bimestre = fiscal.funcoes
    ? `${fiscal.funcoes.periodo}º bimestre de ${atualDeFuncoes(fiscal.funcoes)?.exercicio ?? "?"}`
    : "";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `Dados abertos ${r.uf.municipios === 1 ? "do município" : "dos municípios"} ${de}`,
    description:
      `População, PIB, despesa com pessoal e despesa liquidada por função ` +
      `${r.uf.municipios === 1 ? "do município" : `dos ${r.uf.municipios} municípios`} ` +
      `${de}, a partir das APIs públicas do ` +
      `IBGE e do SICONFI/Tesouro Nacional.`,
    url: `${SITE}/estado/${slugUf(r.uf.sigla)}/`,
    license: LICENCA_DADOS,
    isAccessibleForFree: true,
    // As fontes de onde este conjunto deriva. Estava só nas páginas de
    // município e na capa; a de estado dizia de onde o dado vinha em PROSA e
    // não em metadado, e o Dataset Search lê o metadado. Também inclui o INEP,
    // que a página usa para o IDEB mediano.
    isBasedOn: FONTES,
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    // Ver a nota em `municipio/[slug]/page.tsx`: campos recomendados pela
    // documentação do Google para `Dataset`, que decidem se o conjunto aparece
    // descrito no Dataset Search.
    identifier: `${SITE}/estado/${slugUf(r.uf.sigla)}/`,
    keywords: palavrasChave([r.uf.nome, r.uf.sigla, "IDEB", "IBGE", "SICONFI"]),
    temporalCoverage: coberturaTemporal(snapshot, fiscal, ideb),
    variableMeasured: VARIAVEIS,
    includedInDataCatalog: catalogoDe(SITE),
    spatialCoverage: {
      "@type": "Place",
      name: `${r.uf.nome}, Brasil`,
    },
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "text/csv",
        contentUrl: `${SITE}/estado/${slugUf(r.uf.sigla)}/dados.csv`,
        name: `${r.uf.municipios === 1 ? "Município" : "Municípios"} ${de} em CSV`,
      },
    ],
  };

  return {
    anoEstimada, atualizado, ausentes, ba, bimestre, brasilMediana, brasilTaxa, caged, cagedUf, contraste, de, emendas, emendasPh, emendasUf, esperaUf, fiscal, inss, inssUf, jsonLd, ma, medIdeb, medianaPh, medianas, medidasCenso, meu, panorama, phMunicipios, pibReais, pop, posMediana, posTaxa, quadrimestre, r, rs, sc, semMunicipio, semRede, semRedeFinais, snapshot, taxasPais,
  };
}

/** O contexto completo: o calculado aqui mais os estilos que só o `page.tsx` importa. */
export type Contexto = ReturnType<typeof montarContexto> & {
  // Só o `page.tsx` importa o CSS Module e entrega os estilos às seções por aqui:
  // se cada seção o importasse, o bundler reagruparia os chunks de CSS do site.
  estilos: typeof Estilos;
};
