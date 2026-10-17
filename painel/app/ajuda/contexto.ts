import { expandir } from "../../lib/dados";
import type { Snapshot } from "../../lib/dados";
import { faixaDaLinha, LIMITE_PLAUSIVEL, nomeQuadrimestre, naoInstaladosEm } from "../../lib/fiscal";
import type { SnapshotFiscal } from "../../lib/fiscal";
import type { SnapshotIdeb } from "../../lib/ideb";
import type { SnapshotInss } from "../../lib/inss";
import { conjuntoDoSite, siteDe } from "../../lib/jsonld";
import { SITE } from "../../lib/servidor";
import type Estilos from "./ajuda.module.css";

/** O título da página, que o `metadata` (em `page.tsx`) e o JSON-LD repetem. */
export const TITULO = "Ajuda — como ler os números deste site";

/** Os dados do build que `page.tsx` lê e entrega ao cálculo. */
export type Dados = {
  snapshot: Snapshot;
  fiscal: SnapshotFiscal;
  ideb: SnapshotIdeb;
  idebFinais: SnapshotIdeb;
  inss: SnapshotInss;
};

/**
 * Tudo o que a página deriva dos dados, calculado uma vez e entregue às seções.
 * As seções recebem este objeto como `ctx` e não como `c`, porque `c` aqui é a cobertura do SICONFI.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export function montarContexto(dados: Dados) {
  const { snapshot, fiscal, ideb, idebFinais, inss } = dados;
  const total = expandir(snapshot).length;
  const c = fiscal.cobertura;
  // Quem ainda não estava instalado foi consultado e não tinha relatório, mas
  // não "deixou de entregar": sai das duas pontas da frase do travessão.
  const naoInstalados = naoInstaladosEm(fiscal.exercicio);
  const obrigados = c.consultados - naoInstalados;
  const naoPublicaram = obrigados - c.publicaram;
  // Quem entregou o RGF Simplificado semestral no lugar do quadrimestral.
  const simplificados = fiscal.municipios.filter((l) => l[9] === true).length;
  const quadrimestre = nomeQuadrimestre(fiscal.exercicio, fiscal.periodo);
  const f = fiscal.funcoes;

  // O efeito real dos implausíveis sobre a média nacional, CALCULADO.
  //
  // A frase aqui dizia que "um valor de 371% entre mil e quatrocentos puxa a
  // média quase um ponto inteiro" — conta feita quando só o Nordeste estava
  // varrido, e falsa depois: um valor entre 3.244 desloca 0,10 ponto. Número
  // cravado em prosa vira mentira na coleta seguinte, e ninguém revisa a
  // página de ajuda. Agora sai da conta.
  //
  // E a classificação é a do SITE (`faixaDaLinha`), não um filtro próprio. O
  // que havia aqui era `v > 0 && v <= 100` — que tratava 0% como implausível,
  // ao contrário do resto do site, e não conhecia o terceiro caso (RCL
  // desmentida pela receita, 22/09/2026). Duas definições do mesmo rótulo na
  // mesma base é a segunda verdade que o ranking já registra como erro.
  const declaradas = fiscal.municipios.filter((m) => typeof m[5] === "number");
  const faixas = declaradas.map((m) => faixaDaLinha(fiscal, m));
  const declarados = declaradas.map((m) => m[5] as number);
  const plausiveis = declarados.filter((_, i) => faixas[i] !== "implausivel");
  const implausiveis = declarados.length - plausiveis.length;
  // Os que só são implausíveis pela RCL: o percentual em si cabe em 0–100%.
  const desmentidos = declarados.filter(
    (v, i) => faixas[i] === "implausivel" && v >= 0 && v <= LIMITE_PLAUSIVEL,
  ).length;
  const medi = (v: number[]) => v.reduce((s, x) => s + x, 0) / (v.length || 1);
  const deslocamento = plausiveis.length
    ? medi(declarados) - medi(plausiveis)
    : 0;

  // `WebPage`, e deliberadamente NÃO `FAQPage`.
  //
  // A página tem duas dezenas de perguntas e responderia ao formato, mas o `FAQPage`
  // exige repetir cada resposta como texto dentro do JSON-LD. Isso cria uma
  // segunda cópia do conteúdo, que se afasta da visível no primeiro ajuste de
  // redação — e dado estruturado que não bate com o que está na tela é
  // exatamente o que o Google trata como sinal ruim. Somando: o próprio Google
  // restringiu o resultado rico de FAQ a sites governamentais e de saúde em
  // 2023, então a duplicação seria paga sem nada em troca.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: TITULO,
    url: `${SITE}/ajuda/`,
    inLanguage: "pt-BR",
    // Referências para nós declarados NA CAPA: levam `name` e `url` porque
    // o Google lê cada página isolada e não resolve `@id` entre páginas.
    isPartOf: siteDe(SITE),
    about: conjuntoDoSite(SITE),
    description:
      "Perguntas frequentes e glossário de A a Z sobre os números " +
      "publicados: RCL ajustada, limites da Lei de Responsabilidade Fiscal, " +
      "despesa liquidada por função, IDEB, Censo, Caged, emendas, saúde, a " +
      "fila do INSS, as séries do país e as convenções de ausência de dado.",
  };

  return {
    c, declarados, deslocamento, desmentidos, f, fiscal, ideb, idebFinais, implausiveis, inss, jsonLd, medi, naoInstalados, naoPublicaram, obrigados, plausiveis, quadrimestre, simplificados, snapshot, total,
  };
}

/** O contexto completo: o calculado aqui mais os estilos que só o `page.tsx` importa. */
export type Contexto = ReturnType<typeof montarContexto> & {
  // Só o `page.tsx` importa o CSS Module e entrega os estilos às seções por aqui:
  // se cada seção o importasse, o bundler reagruparia os chunks de CSS do site.
  estilos: typeof Estilos;
};
