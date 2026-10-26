import type { Metadata } from "next";
import Link from "next/link";

import malha from "@/dados/malha-uf.json";
import MapaUf from "../componentes/mapa-uf";
import { br } from "../../lib/dados";
import {
  CAMINHO, TITULO, UF_NOME, dataDoTurno, geradoCurto, lerEleicoes, margem, ufsEmOrdem,
  type Candidato, type Resultado, type Turno,
} from "../../lib/eleicoes";
import { catalogoDe, jsonLdHtml, trilha } from "../../lib/jsonld";
import { dominio, legendaCom, type CamadaMapa } from "../../lib/mapa";
import { cartaoSocial, SITE } from "../../lib/servidor";
import estilos from "./eleicoes.module.css";

/**
 * Eleições 2026: presidente e governador, Brasil, UFs e exterior, nos dois
 * turnos, do JSON oficial de resultado do TSE; os fatos da prorrogação de
 * 25/10 com link; e a consulta de qualquer seção ao vivo no navegador
 * (`public/eleicoes-secao.js`). A espec é
 * `especs/numeros-publicos-eleicoes-2026.md`, no repositório de trabalho.
 *
 * Texto neutro: nenhum adjetivo sobre candidato, partido ou decisão. Os dois
 * do 2º turno de presidente levam vermelho (PT) e azul (PL), a convenção da
 * imprensa aplicada igual aos dois (decisão do Peter, 26/10/2026); as outras
 * barras são cinza, uma cor só para todos (sem verde-amarelo:
 * `numeros-publicos-desenho.md`).
 */

const STF =
  "https://noticias.stf.jus.br/postsnoticias/stf-prorroga-votacao-ate-as-19h-em-locais-onde-urnas-permaneceram-abertas-apos-as-17h/";
const TSE_NOTA =
  "https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/esclarecimento-sobre-prorrogacao-da-votacao";
const TSE_RESULTADOS = "https://resultados.tse.jus.br/";
const BWEB =
  "https://dadosabertos.tse.jus.br/dataset/resultados-2026-boletim-de-urna";

export async function generateMetadata(): Promise<Metadata> {
  const e = await lerEleicoes();
  const r = e.presidente["2"].brasil;
  const [a, b] = r.candidatos;
  // Até 160 caracteres (a auditoria cobra).
  const descricao =
    `Resultado oficial do TSE: ${a!.nome} ${br(a!.pct, 2)}%, ${b!.nome} ` +
    `${br(b!.pct, 2)}% no 2º turno. Presidente e governador por estado, ` +
    "comparecimento e a prorrogação de 25/10.";
  const titulo = `${TITULO}: presidente e governador por estado`;
  const texto = descricao.length <= 160 ? descricao
    : "Resultado oficial do TSE para presidente e governador por estado, comparecimento, abstenção e a prorrogação de 25/10.";
  return {
    title: titulo,
    description: texto,
    alternates: { canonical: `${SITE}${CAMINHO}` },
    ...cartaoSocial(titulo, texto, CAMINHO),
  };
}

function Barras({ r, legenda, lados }: {
  r: Resultado; legenda: string;
  /** Só no 2º turno de presidente: o lado (a cor) de cada um, pelo número. */
  lados?: Record<string, "a" | "b">;
}) {
  const validos = r.candidatos.filter((c) => c.destino.startsWith("V"));
  const maior = Math.max(...validos.map((c) => c.pct), 1);
  return (
    <div className={`${estilos.rolagem} rola-x`}>
      <table className={estilos.barras}>
        <caption className="so-leitor">{legenda}</caption>
        <thead>
          <tr>
            <th scope="col">Candidato</th>
            <th scope="col" className={estilos.num}>Votos</th>
            <th scope="col" className={estilos.num}>% dos válidos</th>
            <th scope="col" className={estilos.colBarra}><span className="so-leitor">Barra</span></th>
          </tr>
        </thead>
        <tbody>
          {validos.map((c) => (
            <tr key={c.n}>
              <th scope="row">
                {c.nome} <span className={estilos.partido}>({c.partido})</span>
                {c.eleito && <span className={estilos.eleito}> eleito</span>}
                {c.situacao === "2º turno" && <span className={estilos.marca}> 2º turno</span>}
              </th>
              <td className={estilos.num}>{br(c.votos)}</td>
              <td className={estilos.num}>{br(c.pct, 2)}%</td>
              <td className={estilos.colBarra} aria-hidden="true">
                <span className={`${estilos.barra} ${lados?.[c.n] === "a" ? estilos.ladoA : lados?.[c.n] === "b" ? estilos.ladoB : ""}`}
                  style={{ width: `${(c.pct / maior) * 100}%` }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A barra de um todo em dois lados (26/10/2026): o placar do 2º turno, uma
 * linha por estado e o comparecimento. A barra só repete o texto que vem ao
 * lado (aria-hidden); o traço marca a metade. Cores em `--lado-a` e
 * `--lado-b` (`eleicoes.module.css`): vermelho e azul para os candidatos,
 * cinza e hachura para comparecimento e abstenção.
 */
function Trilho({ a, b, meio, fino }: { a: number; b: number; meio?: boolean; fino?: boolean }) {
  return (
    <div className={estilos.regua} aria-hidden="true">
      <div className={`${estilos.trilho} ${fino ? estilos.fino : ""}`}>
        <span className={estilos.ladoA} style={{ width: `${a}%` }} />
        {/* Sem o lado B, sem o filete da borda dele. */}
        {b > 0 && <span className={estilos.ladoB} style={{ width: `${b}%` }} />}
      </div>
      {meio && <span className={estilos.meio} />}
    </div>
  );
}

/** A amostra da cor ao lado do nome: a cor nunca é a única pista. */
const Amostra = ({ lado }: { lado: "a" | "b" }) => (
  <span className={`${estilos.amostra} ${lado === "a" ? estilos.ladoA : estilos.ladoB}`} aria-hidden="true" />
);

/** Os dois lados escritos nas pontas, com a barra embaixo. */
function Divisao({ a, b, meio, neutro, titulo }: {
  a: { rotulo: string; pct: number }; b: { rotulo: string; pct: number };
  meio?: boolean; neutro?: boolean; titulo?: string;
}) {
  return (
    <div className={`${estilos.divisao} ${neutro ? estilos.neutro : ""}`}>
      {titulo && <p className={estilos.tituloDivisao}>{titulo}</p>}
      <p className={estilos.pontas}>
        <span><Amostra lado="a" />{a.rotulo} <strong>{br(a.pct, 2)}%</strong></span>
        <span><Amostra lado="b" />{b.rotulo} <strong>{br(b.pct, 2)}%</strong></span>
      </p>
      <Trilho a={a.pct} b={b.pct} meio={meio} />
    </div>
  );
}

/**
 * O 2º turno de presidente em cada UF e no exterior, do maior para o menor
 * percentual de quem teve mais votos no país. Os percentuais são os do TSE
 * em cada lugar; nada se recalcula.
 */
function PlacarUf({ ufs, a, b }: { ufs: Record<string, Resultado>; a: Candidato; b: Candidato }) {
  const linhas = Object.entries(ufs).flatMap(([uf, r]) => {
    const pa = r.candidatos.find((c) => c.n === a.n)?.pct;
    const pb = r.candidatos.find((c) => c.n === b.n)?.pct;
    return pa === undefined || pb === undefined ? [] : [{ uf, pa, pb }];
  }).sort((x, y) => y.pa - x.pa || UF_NOME[x.uf]!.localeCompare(UF_NOME[y.uf]!, "pt-BR"));
  return (
    <div className={`${estilos.rolagem} rola-x`}>
      <table className={estilos.placarUf} data-tabela="placar-uf-2">
        <caption className="so-leitor">
          Presidente, 2º turno ({dataDoTurno("2")}), percentual dos válidos de cada
          candidato por unidade da federação e no exterior, do maior para o menor
          percentual de {a.nome}
        </caption>
        <thead>
          <tr>
            <th scope="col">UF</th>
            <th scope="col" className={estilos.num}><Amostra lado="a" />{a.nome}</th>
            <th scope="col" className={estilos.colDivisao}><span className="so-leitor">Barra</span></th>
            <th scope="col" className={estilos.num}><Amostra lado="b" />{b.nome}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.uf} data-uf={l.uf}>
              <th scope="row">{UF_NOME[l.uf]}</th>
              <td className={estilos.num}>{br(l.pa, 2)}%</td>
              <td className={estilos.colDivisao} aria-hidden="true">
                <Trilho a={l.pa} b={l.pb} meio fino />
              </td>
              <td className={estilos.num}>{br(l.pb, 2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * As camadas do mapa de participação no 2º turno: comparecimento, brancos e
 * nulos, na rampa azul do site. O percentual de cada candidato saiu do mapa
 * de camadas em 26/10/2026: com o azul de um dos dois, a rampa azul para o
 * percentual do outro leria como o lado errado; o placar por estado e o mapa
 * por vencedor já o mostram. O exterior não tem forma no mapa.
 */
function camadasDoMapa(ufs: Record<string, Resultado>): CamadaMapa[] {
  const lugares = Object.entries(ufs).filter(([u]) => u !== "zz");
  const de = (f: (r: Resultado) => number | null) =>
    Object.fromEntries(lugares.map(([u, r]) => [u.toUpperCase(), f(r)]));
  const comp = de((r) => r.pctComparecimento);
  const brancos = de((r) => r.pctBrancos);
  const nulos = de((r) => r.pctNulos);
  return [
    { chave: "comparecimento", rotulo: "Comparecimento", valores: comp,
      legenda: legendaCom("Comparecimento no 2º turno, em percentual do eleitorado.", comp),
      formato: "pct", ...dominio(comp, 5) },
    { chave: "brancos", rotulo: "Brancos", valores: brancos,
      legenda: legendaCom("Votos brancos no 2º turno, em percentual do comparecimento.", brancos),
      formato: "pct", ...dominio(brancos, 1) },
    { chave: "nulos", rotulo: "Nulos", valores: nulos,
      legenda: legendaCom("Votos nulos no 2º turno, em percentual do comparecimento.", nulos),
      formato: "pct", ...dominio(nulos, 1) },
  ];
}

/**
 * O mapa pintado por quem teve mais votos válidos em cada UF no 2º turno
 * (pedido do Peter, 26/10/2026). Cor por classe CSS, nunca `fill` com `var()`
 * no atributo (`numeros-publicos-desenho.md`); a legenda escreve o nome de
 * cada cor e os estados de cada um, porque cor não se lê em voz alta.
 */
function MapaVencedor({ ufs, a, b }: { ufs: Record<string, Resultado>; a: Candidato; b: Candidato }) {
  // UF fora do arquivo, ou sem voto para nenhum dos dois, é "sem dado", nunca
  // empate: empate só com os dois votados e iguais.
  type Lado = "a" | "b" | "empate" | "sem";
  const lado: Record<string, Lado> = {};
  for (const [u, r] of Object.entries(ufs)) {
    if (u === "zz") continue;
    const pa = r.candidatos.find((c) => c.n === a.n)?.votos;
    const pb = r.candidatos.find((c) => c.n === b.n)?.votos;
    lado[u.toUpperCase()] = pa === undefined || pb === undefined || pa + pb === 0 ? "sem"
      : pa > pb ? "a" : pb > pa ? "b" : "empate";
  }
  const caminhos = malha.caminhos as Record<string, string>;
  const ladoDe = (s: string): Lado => lado[s] ?? "sem";
  const de = (l: Lado) => Object.keys(caminhos)
    .filter((s) => ladoDe(s) === l).map((s) => UF_NOME[s.toLowerCase()] ?? s)
    .sort((x, y) => x.localeCompare(y, "pt-BR"));
  const grupos = ([["a", a.nome], ["b", b.nome], ["empate", "Empate"], ["sem", "Sem dado"]] as const)
    .map(([l, nome]) => ({ l, nome, ufs: de(l) })).filter((g) => g.ufs.length > 0);
  const contar = (n: number) => `${n} ${n === 1 ? "estado" : "estados"}`;
  const classe = { a: estilos.ufA, b: estilos.ufB, empate: estilos.ufEmpate, sem: estilos.ufSem };
  return (
    <figure className={estilos.figuraMapa}>
      <svg viewBox={malha.viewBox} className={estilos.mapaVenc} role="img"
        aria-label={"Mapa dos 27 estados pelo candidato com mais votos válidos no 2º turno. " +
          grupos.map((g) => `${g.nome}, ${contar(g.ufs.length)}: ${g.ufs.join(", ")}`).join(". ") + "."}>
        {Object.keys(caminhos).sort().map((s) => (
          <path key={s} d={caminhos[s]} data-uf={s}
            className={`${estilos.ufVenc} ${classe[ladoDe(s)]}`}>
            <title>{UF_NOME[s.toLowerCase()] ?? s}</title>
          </path>
        ))}
      </svg>
      <figcaption className={estilos.legendaMapa} aria-hidden="true">
        {grupos.map((g) => (
          <p key={g.l}>
            {g.l === "a" || g.l === "b" ? <Amostra lado={g.l} />
              : <span className={`${estilos.amostra} ${g.l === "sem" ? estilos.amostraSem : estilos.amostraEmpate}`} />}
            <strong>{g.nome}: {contar(g.ufs.length)}</strong> ({g.ufs.join(", ")})
          </p>
        ))}
      </figcaption>
    </figure>
  );
}

function Participacao({ linhas }: { linhas: { rotulo: string; r: Resultado }[] }) {
  return (
    <div className={`${estilos.rolagem} rola-x`}>
      <table className={estilos.tabela}>
        <caption className="so-leitor">Eleitorado, comparecimento, abstenção, brancos e nulos</caption>
        <thead>
          <tr>
            <th scope="col">Turno</th>
            <th scope="col" className={estilos.num}>Eleitorado</th>
            <th scope="col" className={estilos.num}>Comparecimento</th>
            <th scope="col" className={estilos.num}>Abstenção</th>
            <th scope="col" className={estilos.num}>Brancos</th>
            <th scope="col" className={estilos.num}>Nulos</th>
            <th scope="col" className={estilos.num}>Válidos</th>
            <th scope="col" className={estilos.num}>Seções totalizadas</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ rotulo, r }) => (
            <tr key={rotulo}>
              <th scope="row">{rotulo}</th>
              <td className={estilos.num}>{br(r.eleitorado)}</td>
              <td className={estilos.num}>{br(r.comparecimento)} <span className={estilos.pct}>({br(r.pctComparecimento, 2)}%)</span></td>
              <td className={estilos.num}>{br(r.abstencao)} <span className={estilos.pct}>({br(r.pctAbstencao, 2)}%)</span></td>
              <td className={estilos.num}>{br(r.brancos)} <span className={estilos.pct}>({br(r.pctBrancos, 2)}%)</span></td>
              <td className={estilos.num}>{br(r.nulos)} <span className={estilos.pct}>({br(r.pctNulos, 2)}%)</span></td>
              <td className={estilos.num}>{br(r.validos)}</td>
              <td className={estilos.num}>{br(r.secoesTotalizadas)} de {br(r.secoesTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Presidente por UF num turno: votos e % de cada candidato, comparecimento. */
function PorUf({ turno, ufs, ordem }: {
  turno: Turno; ufs: Record<string, Resultado>; ordem: { n: string; nome: string }[];
}) {
  return (
    <div className={`${estilos.rolagem} rola-x`}>
      <table className={estilos.tabela} data-tabela={`presidente-uf-${turno}`}>
        <caption className="so-leitor">
          Presidente, {turno}º turno ({dataDoTurno(turno)}), por unidade da federação e exterior:
          votos e percentual dos válidos de cada candidato e comparecimento
        </caption>
        <thead>
          <tr>
            <th scope="col">UF</th>
            {ordem.map((c) => <th scope="col" key={c.n} className={estilos.num}>{c.nome}</th>)}
            <th scope="col" className={estilos.num}>Comparecimento</th>
            <th scope="col" className={estilos.num}>Abstenção</th>
          </tr>
        </thead>
        <tbody>
          {ufsEmOrdem(Object.keys(ufs)).map((uf) => {
            const r = ufs[uf]!;
            const por = new Map(r.candidatos.map((c) => [c.n, c]));
            return (
              <tr key={uf} data-uf={uf}>
                <th scope="row">{UF_NOME[uf]}</th>
                {ordem.map((c) => {
                  const x = por.get(c.n);
                  return (
                    <td key={c.n} className={estilos.num}>
                      {x ? <>{br(x.votos)} <span className={estilos.pct}>({br(x.pct, 2)}%)</span></> : "—"}
                    </td>
                  );
                })}
                <td className={estilos.num}>{br(r.pctComparecimento, 2)}%</td>
                <td className={estilos.num}>{br(r.pctAbstencao, 2)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Governador({ uf, r1, r2 }: { uf: string; r1: Resultado; r2?: Resultado }) {
  const eleito = (r2 ?? r1).candidatos.find((c) => c.eleito);
  return (
    <details className={estilos.gov} data-gov={uf}>
      <summary>
        <strong>{UF_NOME[uf]}</strong>:{" "}
        {eleito ? <>{eleito.nome} ({eleito.partido}), eleito no {r2 ? "2º" : "1º"} turno</> : "sem eleito no arquivo"}
      </summary>
      {([["1", r1], ["2", r2]] as const).map(([t, r]) => r && (
        <div key={t}>
          <h3 className={estilos.subtitulo}>{t}º turno, {dataDoTurno(t)}</h3>
          <Barras r={r} legenda={`Governador de ${UF_NOME[uf]}, ${t}º turno`} />
          {r.anulados > 0 && (
            <p className={estilos.ressalva}>
              Votos em candidatos com registro anulado, que não entram nos
              válidos: {br(r.anulados)} ({r.candidatos.filter((c) => !c.destino.startsWith("V"))
                .map((c) => `${c.nome}: ${c.destino.toLowerCase()}`).join("; ")}).
              O percentual de cada candidato é o publicado pelo TSE, que põe
              esses votos no total: por isso a soma fica abaixo de 100%.
            </p>
          )}
          <p className={estilos.ressalva}>
            Comparecimento {br(r.pctComparecimento, 2)}%, brancos {br(r.brancos)},
            nulos {br(r.nulos)}. Arquivo do TSE gerado em {geradoCurto(r.gerado)}.
          </p>
        </div>
      ))}
    </details>
  );
}

export default async function Pagina() {
  const e = await lerEleicoes();
  const p1 = e.presidente["1"];
  const p2 = e.presidente["2"];
  const [a, b] = p2.brasil.candidatos;
  const dif = margem(p2.brasil);
  // A cor segue o partido, não a posição no arquivo: vermelho no PT.
  const trocado = a!.partido !== "PT" && b!.partido === "PT";
  const lados: Record<string, "a" | "b"> = { [a!.n]: "a", [b!.n]: "b" };
  const ordem1 = p1.brasil.candidatos.map((c) => ({ n: c.n, nome: c.nome }));
  const ordem2 = p2.brasil.candidatos.map((c) => ({ n: c.n, nome: c.nome }));
  const ufsGov = ufsEmOrdem(Object.keys(e.governador["1"]));
  const com2Turno = ufsEmOrdem(Object.keys(e.governador["2"]));
  const nomesUf = Object.fromEntries(
    Object.entries(UF_NOME).filter(([u]) => u !== "zz").map(([u, n]) => [u.toUpperCase(), n]));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${TITULO}: resultado de presidente e governador`,
    description:
      "Resultado oficial do TSE das eleições de 2026 para presidente (Brasil, " +
      "estados e exterior, 1º e 2º turnos) e governador (27 unidades da " +
      "federação), com comparecimento, abstenção, brancos e nulos.",
    url: `${SITE}${CAMINHO}`,
    isAccessibleForFree: true,
    isBasedOn: [e.fonte.origem],
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    identifier: `${SITE}${CAMINHO}`,
    temporalCoverage: "2026-10-04/2026-10-25",
    variableMeasured: ["Votos por candidato", "Comparecimento", "Abstenção", "Votos brancos", "Votos nulos"],
    includedInDataCatalog: catalogoDe(SITE),
    spatialCoverage: { "@type": "Place", name: "Brasil" },
  };

  return (
    <main className={estilos.pagina} id="conteudo" data-trocado={trocado ? "" : undefined}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: TITULO, caminho: CAMINHO },
            ]),
          }),
        }}
      />
      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{TITULO}</span>
      </nav>

      <h1 className={estilos.titulo}>{TITULO}</h1>
      <p className={estilos.chamada}>
        Resultado oficial do Tribunal Superior Eleitoral (TSE) para presidente
        e governador: 1º turno em {dataDoTurno("1")} e 2º turno em{" "}
        {dataDoTurno("2")}.
      </p>

      <section aria-labelledby="presidente">
        <h2 id="presidente" className={estilos.secao}>Presidente: 2º turno, {dataDoTurno("2")}</h2>
        <div className={estilos.abertura}>
          <MapaVencedor ufs={p2.ufs} a={a!} b={b!} />
          <div className={estilos.resumo}>
            <Divisao meio titulo="Percentual dos votos válidos no Brasil"
              a={{ rotulo: a!.nome, pct: a!.pct }} b={{ rotulo: b!.nome, pct: b!.pct }} />
            <p className={estilos.diferenca}>
              Diferença: <strong data-margem>{br(dif)} votos</strong>.
            </p>
            <Barras r={p2.brasil} lados={lados}
              legenda="Presidente, 2º turno, Brasil: votos e percentual dos válidos" />
            <p className={estilos.ressalva}>
              {br(p2.brasil.secoesTotalizadas)} de {br(p2.brasil.secoesTotal)} seções
              totalizadas; arquivo do TSE gerado em {geradoCurto(p2.brasil.gerado)}.
              O traço marca a metade. Vermelho e azul só identificam os dois
              candidatos, como na imprensa, sem outro significado.
            </p>
          </div>
        </div>
      </section>

      <nav className={estilos.sumario} aria-labelledby="sumario">
        <h2 id="sumario">Nesta página</h2>
        <ul>
          <li><a href="#por-uf">Presidente por estado</a></li>
          <li><a href="#participacao">Comparecimento, brancos e nulos</a></li>
          <li><a href="#presidente-1">1º turno</a></li>
          <li><a href="#governador">Governador</a></li>
          <li><a href="#prorrogacao">A prorrogação</a></li>
          <li><a href="#consulta">Consulte uma seção</a></li>
          <li><a href="#metodo">De onde vêm os números</a></li>
        </ul>
      </nav>

      <section aria-labelledby="por-uf">
        <h2 id="por-uf" className={estilos.secao}>Presidente por estado e no exterior: 2º turno</h2>
        <p className={estilos.texto}>
          Percentual dos votos válidos de cada um em cada lugar, do maior para o
          menor percentual de {a!.nome}.
        </p>
        <PlacarUf ufs={p2.ufs} a={a!} b={b!} />
        <details className={estilos.tabelaAberta}>
          <summary>Votos em cada estado, com comparecimento e abstenção (tabela)</summary>
          <PorUf turno="2" ufs={p2.ufs} ordem={ordem2} />
        </details>
        <p className={estilos.ressalva}>
          Conferido na coleta: a soma das 27 unidades da federação e do
          exterior é igual ao total do Brasil, candidato a candidato.
        </p>
      </section>

      <section aria-labelledby="participacao">
        <h2 id="participacao" className={estilos.secao}>Comparecimento, abstenção, brancos e nulos</h2>
        {([["2", p2.brasil], ["1", p1.brasil]] as const).map(([t, r]) => (
          <Divisao key={t} neutro titulo={`Brasil, ${t}º turno (${dataDoTurno(t)}): brancos ${br(r.pctBrancos, 2)}% e nulos ${br(r.pctNulos, 2)}% do comparecimento`}
            a={{ rotulo: "Comparecimento", pct: r.pctComparecimento }}
            b={{ rotulo: "Abstenção", pct: r.pctAbstencao }} />
        ))}
        <Participacao linhas={[
          { rotulo: `2º turno (${dataDoTurno("2")})`, r: p2.brasil },
          { rotulo: `1º turno (${dataDoTurno("1")})`, r: p1.brasil },
        ]} />
        <p className={estilos.ressalva}>
          Comparecimento e abstenção: percentuais do TSE sobre o eleitorado das
          seções apuradas. Brancos e nulos: sobre o comparecimento.
        </p>
        <h3 className={estilos.tema}>Em cada estado, no 2º turno</h3>
        <MapaUf camadas={camadasDoMapa(p2.ufs)} nomes={nomesUf} />
        <p className={estilos.ressalva}>
          O azul deste mapa é a escala do site (mais escuro, maior percentual),
          não a cor de um candidato. O exterior não tem forma no mapa: está na
          tabela de votos por estado.
        </p>
      </section>

      <section aria-labelledby="presidente-1">
        <h2 id="presidente-1" className={estilos.secao}>Presidente: 1º turno, {dataDoTurno("1")}</h2>
        <Barras r={p1.brasil} legenda="Presidente, 1º turno, Brasil: votos e percentual dos válidos" />
        <details className={estilos.tabelaAberta}>
          <summary>Votos em cada estado no 1º turno (tabela)</summary>
          <PorUf turno="1" ufs={p1.ufs} ordem={ordem1} />
        </details>
      </section>

      <section aria-labelledby="governador">
        <h2 id="governador" className={estilos.secao}>Governador</h2>
        <p className={estilos.texto}>
          Houve 2º turno em {com2Turno.length} unidades da federação:{" "}
          {com2Turno.map((u) => UF_NOME[u]).join(", ")}. Abra cada estado para
          ver todos os candidatos.
        </p>
        {ufsGov.map((uf) => (
          <Governador key={uf} uf={uf} r1={e.governador["1"][uf]!} r2={e.governador["2"][uf]} />
        ))}
      </section>

      <section aria-labelledby="prorrogacao">
        <h2 id="prorrogacao" className={estilos.secao}>A prorrogação da votação em 25/10</h2>
        <div className={estilos.texto}>
          <ul>
            <li>
              <strong>A regra:</strong> o art. 160 da Resolução TSE nº
              23.751/2026 encerra a votação às 17h, horário de Brasília; quem
              está na fila nessa hora recebe senha e vota.
            </li>
            <li>
              <strong>A decisão:</strong> em 25/10/2026, o ministro Cristiano
              Zanin, do Supremo Tribunal Federal, determinou a votação até as
              19h &ldquo;nos locais onde as urnas não foram fechadas às
              17h&rdquo;, na Reclamação (Rcl) 101673, que invoca o decidido
              pelo STF na ADPF 1013. Fonte: <a href={STF} rel="noopener">notícia
              do STF</a> publicada em 25/10/2026, às 18h28.
            </li>
            <li>
              <strong>O TSE:</strong>{" "}
              <a href={TSE_NOTA} rel="noopener">nota de esclarecimento sobre a
              prorrogação</a>.
            </li>
            <li>
              <strong>A diferença no 2º turno:</strong> {br(dif)} votos entre{" "}
              {a!.nome} ({br(a!.votos)}) e {b!.nome} ({br(b!.votos)}), do arquivo
              oficial do TSE.
            </li>
          </ul>
          <div className={estilos.nota} role="note">
            <p>
              <strong>Quantos votos foram dados depois das 17h ainda não está
              medido aqui.</strong> A conta nacional depende do horário de
              encerramento de cada seção, que o TSE publica no boletim de urna
              do 2º turno (<a href={BWEB} rel="noopener">dados abertos do
              TSE</a>), ainda não divulgado. Quando sair, esta seção mostra os
              votos depois das 17h, com o 1º turno da mesma urna como base. O
              voto é secreto: o registro da urna diz a hora, não o candidato.
            </p>
            <p>
              Enquanto isso, a <a href="#consulta">consulta de seção</a> abaixo
              mostra, para qualquer urna, os votos registrados por hora nos dois
              turnos, lidos do arquivo oficial.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="consulta">
        <h2 id="consulta" className={estilos.secao}>Consulte uma seção</h2>
        <p className={estilos.texto}>
          Escolha a seção e o navegador busca no TSE o registro (log) da urna
          do 2º turno, que traz também o 1º turno da mesma urna: votos por hora
          em {dataDoTurno("1")} e {dataDoTurno("2")}, a hora em que a urna ficou
          pronta e a do encerramento. Nada passa por este site nem se guarda.
        </p>
        <form className={estilos.consulta} data-consulta-secao noValidate>
          <div className={estilos.campo}>
            <label htmlFor="cs-uf">Estado</label>
            <select id="cs-uf" name="uf" defaultValue="">
              <option value="" disabled>Escolha</option>
              {ufsEmOrdem(Object.keys(p2.ufs).filter((u) => u !== "zz")).map((u) => (
                <option key={u} value={u}>{UF_NOME[u]}</option>
              ))}
            </select>
          </div>
          <div className={estilos.campo}>
            <label htmlFor="cs-mun">Município</label>
            <select id="cs-mun" name="mun" disabled><option value="">—</option></select>
          </div>
          <div className={estilos.campo}>
            <label htmlFor="cs-zona">Zona</label>
            <select id="cs-zona" name="zona" disabled><option value="">—</option></select>
          </div>
          <div className={estilos.campo}>
            <label htmlFor="cs-secao">Seção</label>
            <select id="cs-secao" name="secao" disabled><option value="">—</option></select>
          </div>
          <div className={estilos.campo}>
            <button type="submit" disabled>Consultar</button>
          </div>
        </form>
        <p role="status" aria-atomic="true" aria-live="polite" className={estilos.status} id="cs-status">
          <noscript>A consulta precisa de JavaScript ligado.</noscript>
        </p>
        <div id="cs-resultado" className={estilos.resultado} />
        <p className={estilos.ressalva}>
          O log registra a hora do relógio da urna, no fuso do local. A
          consulta mostra as horas em horário de Brasília: como a votação abre
          às 8h de Brasília no país inteiro, a hora em que a urna ficou pronta
          diz quanto o relógio dela difere (pronta às 7h, uma hora a menos);
          quando o log não permite essa conta, vale o fuso do estado, e o
          resultado diz qual dos dois foi usado. Os arquivos vêm de{" "}
          <a href={TSE_RESULTADOS} rel="noopener">resultados.tse.jus.br</a>{" "}
          (arquivos de urna do 2º turno).
        </p>
      </section>

      <section aria-labelledby="metodo">
        <h2 id="metodo" className={estilos.secao}>De onde vêm os números</h2>
        <div className={estilos.texto}>
          <p>
            Do {e.fonte.orgao}, no arquivo de resultado que o próprio tribunal
            publica em <a href={TSE_RESULTADOS} rel="noopener">resultados.tse.jus.br</a>{" "}
            (por exemplo, o <a href={e.fonte.exemplo} rel="noopener">resultado do
            2º turno de presidente no Brasil</a>), um arquivo por cargo, turno e
            lugar. Coleta em {e.fonte.coletadoEm.slice(8, 10)}/{e.fonte.coletadoEm.slice(5, 7)}/
            {e.fonte.coletadoEm.slice(0, 4)}.
          </p>
          <p>
            Antes de entrar no site, cada arquivo é conferido: a soma dos votos
            dos candidatos é igual ao total que o arquivo declara; no país, a
            soma das unidades da federação e do exterior é igual ao Brasil; em
            cada estado, a soma dos {br(e.municipios.total)} municípios é igual
            ao estado. Nenhum número é estimado.
          </p>
          <p>
            Termos de uso: {Object.values(e.fonte.licenca).join(" ")}
          </p>
          {e.municipios.semPar.length > 0 && (
            <p>
              Municípios do site sem resultado no TSE (instalados depois da
              eleição ou sem código correspondente):{" "}
              {e.municipios.semPar.map((m) => m.nome).join(", ")}.
            </p>
          )}
        </div>
      </section>
      <script type="module" src="/eleicoes-secao.js" />
    </main>
  );
}
