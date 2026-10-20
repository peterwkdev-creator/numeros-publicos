import type { Metadata } from "next";
import Link from "next/link";

import MapaUf from "../componentes/mapa-uf";
import { br, descricaoDe as comCauda } from "../../lib/dados";
import {
  arquivoDoIndicador, entradasDoIndice, FAIXAS_POPULACAO, formatarExplorar,
  INDICADOR_PADRAO, INDICADORES_EXPLORAR, recorteDe, type LinhaRecorte,
} from "../../lib/explorar";
import { slugDe } from "../../lib/fiscal";
import { trilha, jsonLdHtml } from "../../lib/jsonld";
import { dominio, type CamadaMapa } from "../../lib/mapa";
import {
  cartaoSocial, lerCaged, lerEmendas, lerFiscal, lerIdeb, lerSnapshot, SITE,
} from "../../lib/servidor";
import base from "../inss/[grupo]/inss.module.css";
import estilos from "./explorar.module.css";

/**
 * "Comparar municípios": um indicador, um recorte, quatro vistas.
 *
 * Fase 2 da espec (`especs/numeros-publicos-explorar.md`, §7): o HTML do
 * build traz o recorte padrão inteiro, legível sem JavaScript. Os controles já
 * estão aqui, desligados (`disabled`), porque sem o `explorar.js` (Fase 3)
 * eles não fazem nada: o formulário enviado recarregaria esta mesma página
 * estática, com o mesmo recorte, e a pessoa acharia que o filtro falhou.
 *
 * Todo número da página sai de `recorteDe`, sobre o mesmo arquivo que o
 * navegador vai baixar (`/dados/explorar/<indicador>/dados.json`).
 */

const CAMINHO = "/explorar/";
const TITULO = "Comparar municípios";
const LINHAS_TABELA = 50;
const RANKING = 10;

export async function generateMetadata(): Promise<Metadata> {
  const descricao = comCauda(
    "Compare os 5.571 municípios por saneamento, renda, emprego, educação e " +
    "contas públicas, por estado, região e tamanho da população.",
    "Dado oficial do IBGE, do INEP, do Tesouro e do MTE.");
  return {
    title: TITULO,
    description: descricao,
    alternates: { canonical: `${SITE}${CAMINHO}` },
    ...cartaoSocial(TITULO, descricao, CAMINHO),
  };
}

function ListaRanking({ titulo, linhas, valor }: {
  titulo: string;
  linhas: LinhaRecorte[];
  valor: (v: number | null) => string;
}) {
  return (
    <div>
      <h3 className={estilos.rankingTitulo}>{titulo}</h3>
      <ol className={estilos.ranking}>
        {linhas.map((l) => (
          <li key={l.codigo}>
            <Link href={`/municipio/${slugDe(l.nome, l.uf)}/`} prefetch={false}>
              {l.nome} ({l.uf})
            </Link>{" "}
            <span className={estilos.rankingValor}>{valor(l.valor)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function Explorar() {
  const [snapshot, fiscal, ideb, idebFinais, caged, emendas] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"), lerIdeb("anos_finais"),
    lerCaged(), lerEmendas(),
  ]);
  const ind = INDICADORES_EXPLORAR.find((i) => i.chave === INDICADOR_PADRAO)!;
  const arquivo = arquivoDoIndicador(ind, { snapshot, fiscal, ideb, idebFinais, caged, emendas });
  const r = recorteDe(ind, arquivo, entradasDoIndice(snapshot), snapshot.ufs);
  const valor = (v: number | null) => formatarExplorar(v, ind);

  const comValor = r.linhas.filter((l) => l.valor !== null);
  const maiores = comValor.slice(0, RANKING);
  const menores = comValor.slice(-RANKING).reverse();
  const regioes = [...new Set(snapshot.ufs.map((u) => u.regiao))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const ufs = [...snapshot.ufs].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const temas = [...new Set(INDICADORES_EXPLORAR.map((i) => i.tema))];
  // O padrão é percentual; o mapa da Fase 3 cobre os outros formatos.
  const camada: CamadaMapa | null = ind.formato === "pct" || ind.formato === "reais" ? {
    chave: ind.chave,
    rotulo: ind.rotulo,
    valores: r.porUf,
    legenda: `${ind.rotulo}: soma dos municípios de cada estado no recorte.`,
    formato: ind.formato,
    ...dominio(r.porUf, ind.formato === "pct" ? 5 : 1000),
  } : null;

  return (
    <main className={base.pagina} id="conteudo">
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
      <nav className={base.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{TITULO}</span>
      </nav>

      <h1 className={base.titulo}>{TITULO}</h1>

      <section className={base.resposta} aria-label="O que esta página faz">
        <p>
          Escolha um indicador e um recorte (região, estado, tamanho da
          população) para ver o resultado do grupo, o mapa por estado, os
          extremos e a lista dos municípios.
        </p>
      </section>

      <form className={estilos.filtros} action={CAMINHO} method="get"
            aria-label="Indicador e recorte">
        {/* Desligado até o explorar.js chegar (Fase 3), que tira o `disabled`. */}
        <fieldset disabled className={estilos.campos}>
          <legend className="so-leitor">Indicador e recorte</legend>
          <label className={estilos.campo}>
            <span>Indicador</span>
            <select name="i" defaultValue={ind.chave}>
              {temas.map((t) => (
                <optgroup key={t} label={t}>
                  {INDICADORES_EXPLORAR.filter((i) => i.tema === t).map((i) => (
                    <option key={i.chave} value={i.chave}>{i.rotulo}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className={estilos.campo}>
            <span>Região</span>
            <select name="regiao" defaultValue="">
              <option value="">Todas</option>
              {regioes.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className={estilos.campo}>
            <span>Estado</span>
            <select name="uf" defaultValue="">
              <option value="">Todos</option>
              {ufs.map((u) => <option key={u.sigla} value={u.sigla}>{u.nome}</option>)}
            </select>
          </label>
          <label className={estilos.campo}>
            <span>População</span>
            <select name="pop" defaultValue="">
              <option value="">Todas as faixas</option>
              {FAIXAS_POPULACAO.map((f) => (
                <option key={f.chave} value={f.chave}>{f.rotulo} habitantes</option>
              ))}
            </select>
          </label>
        </fieldset>
        <p className={base.ressalva} id="explorar-sem-script">
          Os filtros ainda não funcionam nesta versão da página: abaixo, o
          resultado para o Brasil inteiro. A tabela completa, com todos os
          indicadores, está em <a href="/ajuda/#baixar">Baixar dados</a>.
        </p>
      </form>

      <section aria-labelledby="explorar-resumo">
        <h2 id="explorar-resumo" className={estilos.secao}>Resultado do recorte</h2>
        <div className={base.grade} role="status" aria-atomic="true">
          <div className={base.cartao}>
            <span className={base.rotulo}>{ind.rotulo}, Brasil</span>
            <span className={base.valor}>{valor(r.agregado)}</span>
          </div>
          <div className={base.cartao}>
            <span className={base.rotulo}>Municípios no recorte</span>
            <span className={base.valor}>{br(r.municipios)}</span>
          </div>
          <div className={base.cartao}>
            <span className={base.rotulo}>Sem dado</span>
            <span className={base.valor}>{br(r.semDado)}</span>
          </div>
        </div>
        <p className={base.ressalva}>
          {ind.tipo === "mediana"
            ? "Valor do recorte: a mediana dos municípios com dado."
            : ind.tipo === "soma"
              ? "Valor do recorte: a soma dos municípios."
              : "Valor do recorte: a soma do que se conta sobre a soma do total, " +
                "dos municípios do recorte. Não é a média das taxas: a cidade " +
                "grande pesa o que pesa a população dela."}
        </p>
      </section>

      {camada && (
        <section aria-labelledby="explorar-mapa">
          <h2 id="explorar-mapa" className={estilos.secao}>Por estado</h2>
          <MapaUf camadas={[camada]}
            nomes={Object.fromEntries(snapshot.ufs.map((u) => [u.sigla, u.nome]))} />
        </section>
      )}

      <section aria-labelledby="explorar-extremos">
        <h2 id="explorar-extremos" className={estilos.secao}>Os extremos</h2>
        <div className={estilos.extremos}>
          <ListaRanking titulo={`Os ${RANKING} maiores`} linhas={maiores} valor={valor} />
          <ListaRanking titulo={`Os ${RANKING} menores`} linhas={menores} valor={valor} />
        </div>
      </section>

      <section aria-labelledby="explorar-tabela">
        <h2 id="explorar-tabela" className={estilos.secao}>Os municípios</h2>
        <div className={`${base.rolagem} rola-x`}>
          <table className={base.lista}>
            <caption>
              Os {LINHAS_TABELA} primeiros de {br(r.municipios)} municípios,
              do maior para o menor. {ind.rotulo}.
            </caption>
            <thead>
              <tr>
                <th scope="col" className={base.num}>Posição</th>
                <th scope="col">Município</th>
                <th scope="col">Estado</th>
                <th scope="col" className={base.num} aria-sort="descending">
                  {ind.rotulo}
                </th>
              </tr>
            </thead>
            <tbody>
              {r.linhas.slice(0, LINHAS_TABELA).map((l, i) => (
                <tr key={l.codigo}>
                  <td className={base.num}>{i + 1}º</td>
                  <th scope="row">
                    <Link href={`/municipio/${slugDe(l.nome, l.uf)}/`} prefetch={false}>
                      {l.nome}
                    </Link>
                  </th>
                  <td>{l.uf}</td>
                  <td className={base.num}>{valor(l.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
