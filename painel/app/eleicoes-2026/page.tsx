import type { Metadata } from "next";
import Link from "next/link";

import malha from "@/dados/malha-uf.json";
import paleta from "../componentes/partidos.module.css";
import { br } from "../../lib/dados";
import {
  CAMINHO, CAMINHO_DADOS, TITULO, UF_NOME, dataDoTurno, geradoCurto, lerEleicoes, margem,
} from "../../lib/eleicoes";
import { cadeirasPorPartido, lerCargos, senadoresPorPartido, vagasTotais } from "../../lib/eleicoes-cargos";
import {
  governadoresPorPartido, montarMacro, type CargoMacro,
} from "../../lib/eleicoes-macro";
import {
  MEDIDO, OFICIAL, SENADO_INEDITA, STF_DECISAO, TSE_VOTOS_DEPOIS, TSE_VOTOS_DEPOIS_DATA,
} from "../../lib/eleicoes-prorrogacao";
import { catalogoDe, jsonLdHtml, trilha } from "../../lib/jsonld";
import { cartaoSocial, SITE } from "../../lib/servidor";
import estilos from "./eleicoes.module.css";
import m from "./macro.module.css";
import { AmostraPartido, Barras, ContagemPartidos, Divisao } from "./partes";

/**
 * Eleições 2026, a visão macro (26/10/2026, pedido do Peter): um mapa só,
 * cuja cor muda com o cargo escolhido, a legenda e o resumo do Brasil do
 * mesmo cargo, e o cartão do estado ao clicar (ao lado do mapa, sem rolar a
 * página). Tudo o que é tabela e consulta está em `/eleicoes-2026/dados/`.
 *
 * Sem JavaScript a página é o 2º turno de presidente: mapa, legenda e
 * resumo, com a dica nativa (`<title>`) em cada estado. O
 * `public/eleicoes-macro.js` mostra o seletor de cargo e o de estado, troca
 * a cor pelo `data-c-<cargo>` de cada estado e busca a dica e o cartão em
 * `/dados/eleicoes-2026-mapa.json` (por que lá, e não aqui: o `route.ts`
 * dele). Também leva os links antigos da página única (`?secao=`, `#gov-ba`,
 * `#consulta`...) para a página de dados.
 *
 * Texto neutro: nenhum adjetivo sobre candidato, partido ou decisão. Cor por
 * partido, a mesma em todo cargo (`app/componentes/partidos.module.css`).
 */

export async function generateMetadata(): Promise<Metadata> {
  const e = await lerEleicoes();
  const [a, b] = e.presidente["2"].brasil.candidatos;
  // Até 160 caracteres (a auditoria cobra).
  const descricao =
    `Resultado oficial do TSE: ${a!.nome} ${br(a!.pct, 2)}%, ${b!.nome} ` +
    `${br(b!.pct, 2)}% no 2º turno. Mapa por estado de presidente, governador, senador e deputados.`;
  const titulo = `${TITULO}: o mapa do resultado por cargo e estado`;
  const texto = descricao.length <= 160 ? descricao
    : "Resultado oficial do TSE no mapa: presidente, governador, senador e deputados em cada estado, com o resumo do Brasil.";
  return {
    title: titulo,
    description: texto,
    alternates: { canonical: `${SITE}${CAMINHO}` },
    ...cartaoSocial(titulo, texto, CAMINHO),
  };
}

const contar = (n: number) => `${n} ${n === 1 ? "estado" : "estados"}`;

/** A legenda de um cargo: o nome de cada cor e os estados dela. */
function Legenda({ c, ativo }: { c: CargoMacro; ativo: boolean }) {
  return (
    <div id={`leg-${c.chave}`} data-legenda={c.chave} className={m.legenda} hidden={!ativo} aria-hidden="true">
      <p className={m.tituloLegenda}>{c.titulo}</p>
      {c.legenda.map((g) => (
        <p key={g.cor}>
          {g.cor === "sem" ? <span className={`${estilos.amostra} ${estilos.amostraSem}`} />
            : <AmostraPartido cor={g.cor} />}
          <strong>{g.rotulo}: {contar(g.ufs.length)}</strong> ({g.ufs.join(", ")})
        </p>
      ))}
    </div>
  );
}

export default async function Pagina() {
  const [e, c] = await Promise.all([lerEleicoes(), lerCargos()]);
  const cargos = montarMacro(e, c);
  const p1 = e.presidente["1"].brasil;
  const p2 = e.presidente["2"].brasil;
  const [a, b] = p2.candidatos;
  const dif = margem(p2);
  // A cor segue o partido, não a posição no arquivo: vermelho no PT.
  const trocado = a!.partido !== "PT" && b!.partido === "PT";
  const lados: Record<string, "a" | "b"> = { [a!.n]: "a", [b!.n]: "b" };
  const caminhos = malha.caminhos as Record<string, string>;
  const inicial = cargos[0]!;
  const gov = governadoresPorPartido(e);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${TITULO}: o resultado por cargo e estado`,
    description:
      "Resultado oficial do TSE das eleições de 2026 no mapa dos estados: presidente " +
      "(1º e 2º turnos), governador" + (c ? ", senador, deputado federal e deputado estadual e distrital" : "") +
      ", com o resumo do Brasil de cada cargo.",
    url: `${SITE}${CAMINHO}`,
    isAccessibleForFree: true,
    isBasedOn: c ? [e.fonte.origem, c.fonte.origem] : [e.fonte.origem],
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    identifier: `${SITE}${CAMINHO}`,
    temporalCoverage: "2026-10-04/2026-10-25",
    variableMeasured: ["Votos por candidato", "Comparecimento", ...(c ? ["Eleitos por partido", "Cadeiras por partido"] : [])],
    includedInDataCatalog: catalogoDe(SITE),
    spatialCoverage: { "@type": "Place", name: "Brasil" },
  };

  return (
    <main className={`${estilos.pagina} ${paleta.paleta}`} id="conteudo" data-trocado={trocado ? "" : undefined}>
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
        O resultado oficial do Tribunal Superior Eleitoral (TSE) em cada
        estado, cargo a cargo: 1º turno em {dataDoTurno("1")} e 2º turno em{" "}
        {dataDoTurno("2")}.
      </p>

      {/* Os botões de cargo: rádios nativos (setas, Tab e leitor de tela de
          graça), com cara de botão. Sem JS não fariam nada: nascem ocultos. */}
      <fieldset className={m.cargos} data-cargos hidden>
        <legend className={m.rotuloCargos}>Cargo</legend>
        {cargos.map((x) => (
          <span key={x.chave} className={m.cargo}>
            <input type="radio" name="cargo" id={`cargo-${x.chave}`} value={x.chave}
              defaultChecked={x.chave === inicial.chave} />
            <label htmlFor={`cargo-${x.chave}`}>{x.botao}</label>
          </span>
        ))}
      </fieldset>

      <div className={m.palco}>
        <figure className={m.figura}>
          <div className={m.caixaMapa} data-caixa-mapa>
            {/* `role="img"`: os estados não são links (filhos de img são
                apresentacionais); o seletor de estado ao lado é o caminho do
                teclado para o mesmo cartão. O nome vem da legenda do cargo. */}
            <svg viewBox={malha.viewBox} className={m.mapa} role="img" data-mapa-cargo
              aria-labelledby={`leg-${inicial.chave}`}>
              {Object.keys(caminhos).sort().map((s) => {
                const u = s.toLowerCase();
                const cores = Object.fromEntries(cargos.map((x) => [`data-c-${x.chave}`, x.ufs[u]?.c ?? "sem"]));
                return (
                  <path key={s} d={caminhos[s]} data-uf={u} {...cores}
                    data-cor={inicial.ufs[u]?.c ?? "sem"} className={m.uf}>
                    <title>{(inicial.ufs[u]?.d ?? [UF_NOME[u] ?? s, "Sem dado"]).join("\n")}</title>
                  </path>
                );
              })}
            </svg>
            <div className={m.dica} data-dica hidden aria-hidden="true" />
          </div>
        </figure>

        <div className={m.lado}>
          <p className={m.escolha} data-escolha hidden>
            <label htmlFor="escolha-uf">Escolha o estado</label>
            <select id="escolha-uf" defaultValue="">
              <option value="">—</option>
              {Object.entries(UF_NOME).filter(([u]) => u !== "zz")
                .sort((x, y) => x[1].localeCompare(y[1], "pt-BR"))
                .map(([u, nome]) => <option key={u} value={u}>{nome}</option>)}
            </select>
          </p>
          {/* O cartão do estado: o script o preenche; `aria-live` anuncia a troca. */}
          <div className={m.cartao} data-cartao aria-live="polite" aria-atomic="true" />
        </div>

        <div className={m.legendas}>
          {cargos.map((x) => <Legenda key={x.chave} c={x} ativo={x.chave === inicial.chave} />)}
          <p className={m.instrucao} data-instrucao hidden>
            Passe o cursor num estado para ver o resultado; clique (ou toque)
            para abrir o cartão do estado ao lado do mapa (no celular, logo
            abaixo dele).
          </p>
        </div>

        <section aria-labelledby="no-brasil" className={m.resumo}>
          <h2 id="no-brasil" className={m.tituloResumo}>No Brasil</h2>
          <div data-resumo="p2">
            <Divisao meio titulo="Presidente, 2º turno: percentual dos votos válidos"
              a={{ rotulo: a!.nome, pct: a!.pct }} b={{ rotulo: b!.nome, pct: b!.pct }} />
            <p className={estilos.ressalva}>
              Diferença de {br(dif)} votos ({br(a!.votos)} e {br(b!.votos)}).
              Comparecimento de {br(p2.pctComparecimento, 2)}% do eleitorado
              ({br(p2.comparecimento)} de {br(p2.eleitorado)}). Arquivo do TSE
              gerado em {geradoCurto(p2.gerado)}.
            </p>
          </div>
          <div data-resumo="p1" hidden>
            <Barras r={p1} lados={lados} legenda="Presidente, 1º turno, Brasil: votos e percentual dos válidos" />
            <p className={estilos.ressalva}>
              Comparecimento de {br(p1.pctComparecimento, 2)}% do eleitorado
              ({br(p1.comparecimento)} de {br(p1.eleitorado)}).
            </p>
          </div>
          <div data-resumo="gov" hidden>
            <p className={m.subResumo}>Governadores eleitos por partido</p>
            <ContagemPartidos linhas={gov.lista} coluna="Eleitos"
              legenda="Governador: eleitos por partido nas 27 unidades da federação" />
            <p className={estilos.ressalva}>
              {gov.turno1} eleitos no 1º turno e {gov.turno2} no 2º.
            </p>
          </div>
          {c && (
            <>
              <div data-resumo="sen" hidden>
                <p className={m.subResumo}>Senadores eleitos por partido</p>
                <ContagemPartidos linhas={senadoresPorPartido(c.senador)} coluna="Eleitos"
                  total={vagasTotais(c.senador)} legenda="Senador: eleitos por partido, somados os 27 estados" />
              </div>
              <div data-resumo="depf" hidden>
                <p className={m.subResumo}>Cadeiras na Câmara dos Deputados por partido</p>
                <ContagemPartidos linhas={cadeirasPorPartido(c.depFederal)} coluna="Cadeiras"
                  total={vagasTotais(c.depFederal)} legenda="Deputado federal: cadeiras por partido, somados os 27 estados" />
              </div>
              <div data-resumo="depe" hidden>
                <p className={m.subResumo}>Cadeiras nas assembleias e na Câmara Legislativa do DF, por partido</p>
                <ContagemPartidos linhas={cadeirasPorPartido(c.depEstadual)} coluna="Cadeiras"
                  total={vagasTotais(c.depEstadual)} legenda="Deputado estadual e distrital: cadeiras por partido, somados os 27 estados" />
              </div>
            </>
          )}
        </section>
      </div>

      {/* A prorrogação em destaque (pedido do Peter, 26/10; desenho de
          29/10): o número oficial do TSE, a decisão e a base do 1º turno.
          O detalhe e a medição própria ficam na página de dados. */}
      <section aria-labelledby="prorrogacao-destaque" className={m.prorrogacao}>
        <h2 id="prorrogacao-destaque" className={m.tituloProrrogacao}>Votação estendida até as 19h em 25/10</h2>
        <p className={m.inedita}>
          Medida inédita no TSE, segundo a{" "}
          <a href={SENADO_INEDITA} rel="noopener">TV Senado</a>.
        </p>
        <p className={m.numeroProrrogacao}>
          <strong>{br(OFICIAL.votosDepois17h)}</strong> votos depois das 17h no
          2º turno, em todo o país: {br((OFICIAL.votosDepois17h / dif) * 100, 2)}%
          da diferença entre os dois candidatos ({br(dif)} votos).
        </p>
        <ul className={m.fatosProrrogacao}>
          <li>
            <strong>A decisão:</strong> o ministro Cristiano Zanin, do Supremo
            Tribunal Federal, estendeu a votação até as 19h nas seções ainda
            abertas às 17h (<a href={STF_DECISAO} rel="noopener">notícia do STF</a>).
          </li>
          <li>
            <strong>As seções:</strong> {br(OFICIAL.secoesAbertasDepois17h10)} seguiram
            abertas depois das 17h10, com {br(OFICIAL.votosNessasSecoes)} votos
            desde as 17h. Nos quatro estados com mais delas, os votos foram:{" "}
            {OFICIAL.porUf.map((x, i) => (
              <span key={x.uf}>
                {i === 0 ? "" : i === OFICIAL.porUf.length - 1 ? " e " : ", "}
                {UF_NOME[x.uf]} ({br(x.votos)})
              </span>
            ))}.
          </li>
          <li>
            <strong>A base:</strong> no 1º turno, sem prorrogação, as mesmas
            urnas registraram cerca de {br(MEDIDO.turno1B / 1e6, 1)} milhões de
            votos depois das 17h (estimativa deste site, lida dos registros das
            urnas). Só indicativo: eram 7 cargos, e o voto demorava mais.
          </li>
        </ul>
        <p className={`${estilos.ressalva} ${m.ressalvaProrrogacao}`}>
          Fonte dos números do 2º turno:{" "}
          <a href={TSE_VOTOS_DEPOIS} rel="noopener">nota do TSE</a> de{" "}
          {TSE_VOTOS_DEPOIS_DATA}.{" "}
          <Link href={`${CAMINHO_DADOS}#prorrogacao`} prefetch={false}>A prorrogação em detalhe</Link>,
          com a conferência feita por este site.
        </p>
      </section>

      <p className={m.verTodos}>
        <Link href={CAMINHO_DADOS} prefetch={false}>Ver todos os dados</Link>
        <span className={m.verTodosTexto}>
          : placar por estado, comparecimento, 1º turno, governadores
          {c ? ", senadores, deputados" : ""}, a votação estendida até as 19h em 25/10, a
          consulta de seção e as fontes.
        </span>
      </p>
      <p className={estilos.ressalva}>
        Cor por partido, a mesma em todo cargo; vermelho e azul identificam o
        PT e o PL, como na imprensa, sem outro significado; partidos fora da
        paleta ficam em cinza, com o nome na legenda; estado tracejado é
        estado sem dado no arquivo.
      </p>
      <script type="module" src="/eleicoes-macro.js" />
    </main>
  );
}
