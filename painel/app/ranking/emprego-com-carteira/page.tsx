import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { br, dataCurta, periodoDe } from "../../../lib/dados";
import {
  comSinal, competenciaCurta, type LinhaRankingCaged, nomeCompetencia,
  POPULACAO_MINIMA_POR_MIL, rankingCaged,
} from "../../../lib/caged";
import { deEstado } from "../../../lib/estado";
import { slugDe } from "../../../lib/fiscal";
import {
  catalogoDe, FONTES_DA_BASE, palavrasChave, trilha, LICENCA_DADOS,
} from "../../../lib/jsonld";
import { cartaoSocial, lerCaged, lerSnapshot, SITE } from "../../../lib/servidor";
import estilos from "../gasto-com-pessoal/ranking.module.css";
import ComoLer from "../../componentes/como-ler";
import Termo from "../../componentes/termo";

const CAMINHO = "/ranking/emprego-com-carteira/";
/** Quantos de cada ponta: o bastante para achar a própria cidade grande, sem virar a lista inteira. */
const PONTA = 50;

/**
 * O saldo do emprego com carteira nos 12 meses, município a município.
 *
 * Responde a uma consulta comum ("cidades que mais geraram empregos") com o
 * dado que já está nas 5.571 páginas e que o `caged-exportar` só grava depois
 * de bater com o sumário do Ministério do Trabalho. É fato puro: quem abriu e
 * quem fechou vagas, sem cor de bom ou ruim, e com a conta por habitante ao
 * lado, porque em número de vagas a cidade grande sempre aparece.
 */
export async function generateMetadata(): Promise<Metadata> {
  const caged = await lerCaged();
  const titulo = "Municípios que mais geraram empregos com carteira";
  const descricao =
    `Saldo de empregos com carteira de ${competenciaCurta(caged.competencias[0]!)} ` +
    `a ${competenciaCurta(caged.competencia)} em cada município: quem mais abriu ` +
    `e quem mais fechou vagas, pelo Novo Caged.`;
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `${SITE}${CAMINHO}` },
    ...cartaoSocial(titulo, descricao, CAMINHO),
  };
}

/** `+1,2`, `−0,4`, `0,0`: uma casa, o menos tipográfico, sem "−0,0". */
function porMilComSinal(v: number): string {
  const abs = br(Math.abs(v), 1);
  if (abs === "0,0") return abs;
  return v > 0 ? `+${abs}` : `−${abs}`;
}

function Nome({ m }: { m: LinhaRankingCaged }) {
  return (
    <Link href={`/municipio/${slugDe(m.nome, m.uf)}/`} prefetch={false}>
      {m.nome}
    </Link>
  );
}

function TabelaSaldo({
  linhas, posicao, legenda,
}: {
  linhas: LinhaRankingCaged[];
  posicao: Map<number, number>;
  legenda: ReactNode;
}) {
  return (
    <div className={estilos.rolagem}>
      <table className={estilos.lista}>
        <caption>{legenda}</caption>
        <thead>
          <tr>
            <th scope="col" className={estilos.posicao}>#</th>
            <th scope="col">Município</th>
            <th scope="col">UF</th>
            <th scope="col" className={estilos.num}>Saldo</th>
            <th scope="col" className={estilos.num}>Admissões</th>
            <th scope="col" className={estilos.num}>Desligamentos</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((m) => (
            <tr key={m.codigo}>
              <td className={`${estilos.posicao} tabular`}>{br(posicao.get(m.codigo)!)}</td>
              <th scope="row"><Nome m={m} /></th>
              <td>{m.uf}</td>
              <td className={`${estilos.num} tabular`}>{comSinal(m.saldo)}</td>
              <td className={`${estilos.num} tabular`}>{br(m.admissoes)}</td>
              <td className={`${estilos.num} tabular`}>{br(m.desligamentos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Pagina() {
  const [caged, snapshot] = await Promise.all([lerCaged(), lerSnapshot()]);
  const r = rankingCaged(caged, snapshot);
  const doze = caged.conferencia.doze;
  const de = nomeCompetencia(caged.competencias[0]!);
  const ate = nomeCompetencia(caged.competencia);
  const anoPopulacao = periodoDe(snapshot, "populacao-estimada");
  const posicao = new Map(r.ordem.map((m, i) => [m.codigo, i + 1]));
  const maiores = r.ordem.slice(0, PONTA);
  // Do mais negativo para cima. Com menos de 2 × PONTA municípios as duas
  // listas se cruzariam; a fatia começa depois da primeira para não repetir.
  const menores = r.ordem.slice(Math.max(PONTA, r.ordem.length - PONTA)).reverse();
  const porMilPos = new Map(r.porMil.map((m, i) => [m.codigo, i + 1]));
  // O filtro só oferece UF que tem cidade na lista por mil (`gasto-com-pessoal`).
  const porUf = new Map<string, number>();
  for (const m of r.porMil) porUf.set(m.uf, (porUf.get(m.uf) ?? 0) + 1);
  const ufs = [...porUf]
    .map(([uf, n]) => ({ uf, n, nome: deEstado(uf).replace(/^d[aeo]s? /, "") }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const fonte = (
    <>
      Fonte: Novo Caged, Ministério do Trabalho e Emprego, coleta de{" "}
      {caged.coletadoEm ? dataCurta(caged.coletadoEm) : "data não registrada"}.
    </>
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Municípios que mais geraram empregos com carteira",
    description:
      `Saldo de empregos com carteira (admissões menos desligamentos) de ` +
      `${de} a ${ate} em ${r.ordem.length} municípios brasileiros, pelo Novo ` +
      `Caged, com os ajustes declarados até ${ate}.`,
    url: `${SITE}${CAMINHO}`,
    license: LICENCA_DADOS,
    isAccessibleForFree: true,
    isBasedOn: FONTES_DA_BASE.filter((f) => /Caged|IBGE/.test(f.name)),
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    identifier: `${SITE}${CAMINHO}`,
    keywords: palavrasChave(["Novo Caged", "emprego com carteira", "saldo de empregos"]),
    temporalCoverage:
      `${caged.competencias[0]!.slice(0, 4)}-${caged.competencias[0]!.slice(4)}/` +
      `${caged.competencia.slice(0, 4)}-${caged.competencia.slice(4)}`,
    variableMeasured: ["Saldo de empregos com carteira (admissões menos desligamentos)"],
    includedInDataCatalog: catalogoDe(SITE),
    spatialCoverage: { "@type": "Place", name: "Brasil" },
    distribution: [{
      "@type": "DataDownload",
      encodingFormat: "text/csv",
      contentUrl: `${SITE}/dados/municipios.csv`,
      name: "Todos os municípios em CSV",
    }],
    mainEntity: {
      "@type": "ItemList",
      name: `Maiores saldos de emprego com carteira, de ${de} a ${ate}`,
      numberOfItems: r.ordem.length,
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      itemListElement: maiores.slice(0, 10).map((m, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `${m.nome} (${m.uf})`,
        url: `${SITE}/municipio/${slugDe(m.nome, m.uf)}/`,
        item: {
          "@type": "QuantitativeValue",
          name: "Saldo de empregos com carteira em 12 meses",
          value: m.saldo,
        },
      })),
    },
  };

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: "Emprego com carteira", caminho: CAMINHO },
            ]),
          }),
        }}
      />
      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">Emprego com carteira</span>
      </nav>

      <h1 className={estilos.titulo}>
        Municípios que mais geraram empregos com carteira
      </h1>
      <p className={estilos.chamada}>
        Quantas vagas com carteira assinada cada município abriu ou fechou de{" "}
        {de} a {ate}: as admissões menos os desligamentos, o{" "}
        <Termo chave="saldo">saldo</Termo>, pelo{" "}
        <Termo chave="caged">Novo Caged</Termo> do Ministério do Trabalho.
      </p>
      <ComoLer tipo="rankingEmprego" />

      <div className={estilos.grade}>
        <div className={estilos.cartao}>
          <span className={estilos.rotulo}>Saldo do país em 12 meses</span>
          <span className={`${estilos.valor} tabular`}>{comSinal(doze.saldo)}</span>
        </div>
        <div className={estilos.cartao}>
          <span className={estilos.rotulo}>Municípios com saldo positivo</span>
          <span className={`${estilos.valor} tabular`}>{br(r.positivos)}</span>
        </div>
        <div className={estilos.cartao}>
          <span className={estilos.rotulo}>Com saldo negativo</span>
          <span className={`${estilos.valor} tabular`}>{br(r.negativos)}</span>
        </div>
        <div className={estilos.cartao}>
          <span className={estilos.rotulo}>Com saldo zero</span>
          <span className={`${estilos.valor} tabular`}>{br(r.zerados)}</span>
        </div>
      </div>

      <section className={estilos.texto}>
        <p>
          No país, os 12 meses somam <strong>{br(doze.admissoes)}</strong>{" "}
          admissões e <strong>{br(doze.desligamentos)}</strong> desligamentos:
          saldo de <strong>{comSinal(doze.saldo)}</strong> vagas, o número que o
          Ministério do Trabalho publica e que esta base reproduz exatamente. Dos{" "}
          <strong>{br(r.ordem.length)}</strong> municípios,{" "}
          <strong>{br(r.positivos)}</strong> terminaram a janela com mais
          admissões que desligamentos, <strong>{br(r.negativos)}</strong> com
          menos, e <strong>{br(r.zerados)}</strong> empataram.
        </p>
      </section>

      <section className={estilos.texto}>
        <h2>Os {PONTA} maiores saldos</h2>
      </section>
      <TabelaSaldo
        linhas={maiores}
        posicao={posicao}
        legenda={<>
          Os {PONTA} municípios com o maior saldo de empregos com carteira de{" "}
          {de} a {ate}. O # é a posição entre os {br(r.ordem.length)}. {fonte}
        </>}
      />

      <section className={estilos.texto}>
        <h2>Os {PONTA} menores saldos</h2>
      </section>
      <TabelaSaldo
        linhas={menores}
        posicao={posicao}
        legenda={<>
          Os {PONTA} municípios com o menor saldo de empregos com carteira de{" "}
          {de} a {ate}, do menor para cima. O # é a posição entre os{" "}
          {br(r.ordem.length)}. {fonte}
        </>}
      />

      <section className={estilos.texto}>
        <h2>Por mil habitantes, nas cidades de {br(POPULACAO_MINIMA_POR_MIL)} habitantes ou mais</h2>
        <p>
          Em número de vagas, cidades de tamanhos diferentes não se comparam.
          Aqui o saldo é dividido pela população estimada pelo IBGE
          {anoPopulacao ? ` para ${anoPopulacao}` : ""}, nas{" "}
          <strong>{br(r.porMil.length)}</strong> cidades com{" "}
          {br(POPULACAO_MINIMA_POR_MIL)} habitantes ou mais: abaixo disso, a
          abertura ou o fechamento de uma só empresa mexe demais na conta.
        </p>
      </section>

      {ufs.length > 1 && (<>
        <div className={estilos.filtro} data-filtro-uf hidden>
          <label htmlFor="filtro-uf">Estado</label>
          <select id="filtro-uf" defaultValue="">
            <option value="">Todos os estados</option>
            {ufs.map((x) => (
              <option key={x.uf} value={x.uf} data-de={deEstado(x.uf)}>
                {x.nome} ({br(x.n)})
              </option>
            ))}
          </select>
          <button type="button" data-limpar hidden>Mostrar todos os estados</button>
          <p role="status" aria-atomic="true" className={estilos.contagem}>
            {br(r.porMil.length)} municípios
          </p>
        </div>
        <script type="module" src="/filtro-uf.js" />
      </>)}

      <div className={estilos.rolagem}>
        <table className={estilos.lista} data-filtro-alvo>
          <caption>
            Saldo de empregos com carteira de {de} a {ate} por mil habitantes,
            do maior para o menor, nas cidades com {br(POPULACAO_MINIMA_POR_MIL)}{" "}
            habitantes ou mais. {fonte} População: estimativa do IBGE
            {anoPopulacao ? ` para ${anoPopulacao}` : ""}.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={estilos.posicao}>#</th>
              <th scope="col">Município</th>
              <th scope="col">UF</th>
              <th scope="col" className={estilos.num}>Saldo por mil habitantes</th>
              <th scope="col" className={estilos.num}>Saldo</th>
              <th scope="col" className={estilos.num}>
                População{anoPopulacao ? ` (${anoPopulacao})` : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {r.porMil.map((m) => (
              <tr key={m.codigo}>
                <td className={`${estilos.posicao} tabular`}>{br(porMilPos.get(m.codigo)!)}</td>
                <th scope="row"><Nome m={m} /></th>
                <td>{m.uf}</td>
                <td className={`${estilos.num} tabular`}>{porMilComSinal(m.porMil!)}</td>
                <td className={`${estilos.num} tabular`}>{comSinal(m.saldo)}</td>
                <td className={`${estilos.num} tabular`}>{br(m.populacao!)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className={estilos.texto}>
        <h2>Como esta conta é feita</h2>
        <p className={estilos.ressalva}>
          O saldo é a soma dos 12 meses de {de} a {ate}, cada mês com as
          declarações entregues fora do prazo e as exclusões feitas até {ate},
          como o número oficial &ldquo;com ajustes&rdquo;; o mês mais recente
          ainda pode mudar. <strong>O município é o do estabelecimento, não o
          de quem foi contratado</strong>: quem mora numa cidade e trabalha na
          vizinha conta na vizinha. Só emprego{" "}
          <Termo chave="celetista">celetista</Termo>: servidor{" "}
          <Termo chave="estatutario">estatutário</Termo> e quem trabalha por
          conta própria não entram. As movimentações que o Caged não liga a
          nenhum município entram só no total do país.{" "}
          <a href={caged.conferencia.sumario}>Sumário executivo do MTE</a>.
        </p>
        <p className={estilos.ressalva}>
          Cada município tem a sua página, com o saldo mês a mês, o Censo e o
          resto dos números.{" "}
          <Link href="/dados/municipios.csv" prefetch={false}>
            Baixar tudo em CSV
          </Link>{" "}
          ·{" "}
          <Link href="/ajuda/#caged" prefetch={false}>
            Como ler o Novo Caged
          </Link>
        </p>
      </section>
    </main>
  );
}
