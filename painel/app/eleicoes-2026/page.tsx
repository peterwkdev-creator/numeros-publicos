import type { Metadata } from "next";
import Link from "next/link";

import { br } from "../../lib/dados";
import {
  CAMINHO, TITULO, UF_NOME, dataDoTurno, geradoCurto, lerEleicoes, margem, ufsEmOrdem,
  type Resultado, type Turno,
} from "../../lib/eleicoes";
import { catalogoDe, jsonLdHtml, trilha } from "../../lib/jsonld";
import { cartaoSocial, SITE } from "../../lib/servidor";
import estilos from "./eleicoes.module.css";

/**
 * Eleições 2026: presidente e governador, Brasil, UFs e exterior, nos dois
 * turnos, do JSON oficial de resultado do TSE; os fatos da prorrogação de
 * 25/10 com link; e a consulta de qualquer seção ao vivo no navegador
 * (`public/eleicoes-secao.js`). A espec é
 * `especs/numeros-publicos-eleicoes-2026.md`, no repositório de trabalho.
 *
 * Texto neutro: nenhum adjetivo sobre candidato, partido ou decisão. A cor
 * das barras é uma só para todos (sem cor de partido, sem verde-amarelo:
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

function Barras({ r, legenda }: { r: Resultado; legenda: string }) {
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
                <span className={estilos.barra} style={{ width: `${(c.pct / maior) * 100}%` }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const ordem1 = p1.brasil.candidatos.map((c) => ({ n: c.n, nome: c.nome }));
  const ordem2 = p2.brasil.candidatos.map((c) => ({ n: c.n, nome: c.nome }));
  const ufsGov = ufsEmOrdem(Object.keys(e.governador["1"]));
  const com2Turno = ufsEmOrdem(Object.keys(e.governador["2"]));

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
    <main className={estilos.pagina} id="conteudo">
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
        O resultado oficial de presidente e governador, como o Tribunal Superior
        Eleitoral (TSE) o publica: 1º turno em {dataDoTurno("1")} e 2º turno em{" "}
        {dataDoTurno("2")}. Arquivo do 2º turno de presidente gerado pelo TSE em{" "}
        {geradoCurto(p2.brasil.gerado)}.
      </p>

      <section aria-labelledby="presidente">
        <h2 id="presidente" className={estilos.secao}>Presidente: 2º turno, {dataDoTurno("2")}</h2>
        <Barras r={p2.brasil} legenda="Presidente, 2º turno, Brasil: votos e percentual dos válidos" />
        <p className={estilos.texto}>
          Diferença entre os dois: <strong data-margem>{br(dif)} votos</strong>{" "}
          ({br(a!.votos)} − {br(b!.votos)}). Seções totalizadas:{" "}
          {br(p2.brasil.secoesTotalizadas)} de {br(p2.brasil.secoesTotal)}.
        </p>

        <h2 id="presidente-1" className={estilos.secao}>Presidente: 1º turno, {dataDoTurno("1")}</h2>
        <Barras r={p1.brasil} legenda="Presidente, 1º turno, Brasil: votos e percentual dos válidos" />
      </section>

      <section aria-labelledby="participacao">
        <h2 id="participacao" className={estilos.secao}>Comparecimento e abstenção no Brasil</h2>
        <Participacao linhas={[
          { rotulo: `2º turno (${dataDoTurno("2")})`, r: p2.brasil },
          { rotulo: `1º turno (${dataDoTurno("1")})`, r: p1.brasil },
        ]} />
        <p className={estilos.ressalva}>
          O percentual de comparecimento e o de abstenção são do TSE, sobre o
          eleitorado das seções apuradas. Brancos e nulos, sobre o comparecimento.
        </p>
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

      <section aria-labelledby="por-uf">
        <h2 id="por-uf" className={estilos.secao}>Presidente por estado e no exterior</h2>
        <h3 className={estilos.tema}>2º turno, {dataDoTurno("2")}</h3>
        <PorUf turno="2" ufs={p2.ufs} ordem={ordem2} />
        <h3 className={estilos.tema}>1º turno, {dataDoTurno("1")}</h3>
        <PorUf turno="1" ufs={p1.ufs} ordem={ordem1} />
        <p className={estilos.ressalva}>
          Percentual sobre os votos válidos de cada lugar. Conferido na coleta:
          a soma das 27 unidades da federação e do exterior é igual ao total do
          Brasil, candidato a candidato.
        </p>
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
