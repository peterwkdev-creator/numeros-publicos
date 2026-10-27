import type { Metadata } from "next";
import Link from "next/link";

import MapaUf from "../componentes/mapa-uf";
import { br, descricaoDe as comCauda } from "../../lib/dados";
import {
  arquivoDoIndicador, entradasDoIndice, FAIXAS_POPULACAO, fonteDoIndicador, formatarExplorar,
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

/** A nota sob o resumo, por tipo de conta; vai inteira para o script trocar. */
const NOTAS = {
  mediana: "Valor do recorte: a mediana dos municípios com dado.",
  soma: "Valor do recorte: a soma dos municípios.",
  razao: "Valor do recorte: o total do recorte dividido pela base do " +
    "recorte (ex.: domicílios com esgoto ÷ todos os domicílios). Não é a " +
    "média das taxas: cidade grande pesa pela população.",
} as const;

/** Igual a `legendaDoMapa` em `public/explorar-conta.js`. */
const CONTA_DO_MAPA = {
  mediana: "mediana dos municípios",
  soma: "soma dos municípios",
  razao: "conta dos municípios somados",
} as const;

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

function ListaRanking({ id, titulo, linhas, valor }: {
  id: string;
  titulo: string;
  linhas: LinhaRecorte[];
  valor: (v: number | null) => string;
}) {
  return (
    <div>
      <h3 className={estilos.rankingTitulo}>{titulo}</h3>
      <ol className={estilos.ranking} id={id}>
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
  const fontes = { snapshot, fiscal, ideb, idebFinais, caged, emendas };
  const arquivo = arquivoDoIndicador(ind, fontes);
  const r = recorteDe(ind, arquivo, entradasDoIndice(snapshot), snapshot.ufs);
  const valor = (v: number | null) => formatarExplorar(v, ind);

  const comValor = r.linhas.filter((l) => l.valor !== null);
  const maiores = comValor.slice(0, RANKING);
  const menores = comValor.slice(-RANKING).reverse();
  const regioes = [...new Set(snapshot.ufs.map((u) => u.regiao))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const ufs = [...snapshot.ufs].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const temas = [...new Set(INDICADORES_EXPLORAR.map((i) => i.tema))];
  // O padrão é percentual; os outros formatos, o `explorar.js` pinta na mesma
  // camada. A chave é fixa (`valor`) porque o script troca o indicador nela, e
  // a legenda tem o texto de `legendaDoMapa` (`public/explorar-conta.js`).
  const camada: CamadaMapa | null = ind.formato === "pct" || ind.formato === "reais" ? {
    chave: "valor",
    rotulo: ind.rotulo,
    valores: r.porUf,
    legenda: `${ind.rotulo}: ${CONTA_DO_MAPA[ind.tipo]} de cada estado no recorte.`,
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
            aria-label="Indicador e recorte" id="explorar-filtros" data-padrao={ind.chave}>
        {/* Desligado até o `explorar.js` chegar, que tira o `disabled`: sem
            ele, enviar recarregaria esta mesma página, com o mesmo recorte. */}
        <fieldset disabled className={estilos.campos}>
          <legend className="so-leitor">Indicador e recorte</legend>
          <label className={estilos.campo}>
            <span>Indicador</span>
            <select name="i" defaultValue={ind.chave}>
              {temas.map((t) => (
                <optgroup key={t} label={t}>
                  {INDICADORES_EXPLORAR.filter((i) => i.tema === t).map((i) => (
                    <option key={i.chave} value={i.chave} data-tipo={i.tipo}
                      data-formato={i.formato} data-casas={i.casas}
                      data-mult={i.tipo === "razao" ? i.mult : undefined}
                      data-fonte={fonteDoIndicador(i, fontes)}>
                      {i.rotulo}
                    </option>
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
              {ufs.map((u) => (
                <option key={u.sigla} value={u.sigla} data-regiao={u.regiao}>{u.nome}</option>
              ))}
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
        {/* O script esconde este aviso ao ligar os filtros e o reusa para
            os erros (arquivo que não baixou, dado mudado no meio). */}
        <p className={base.ressalva} id="explorar-sem-script" role="status">
          Os filtros precisam de JavaScript: abaixo, o resultado para o Brasil
          inteiro. A tabela completa, com todos os indicadores, está em{" "}
          <a href="/ajuda/#baixar">Baixar dados</a>.
        </p>
        {/* Os filtros em vigor, removíveis um a um (`ux-padroes.md`). */}
        <div className={estilos.aplicados} id="explorar-aplicados" hidden>
          <span className={estilos.aplicadosRotulo}>Filtros aplicados:</span>
          <ul data-classe-chip={estilos.chip} />
          <button type="button" className={estilos.limpar} data-limpar="">Limpar tudo</button>
        </div>
      </form>

      <section aria-labelledby="explorar-resumo">
        <h2 id="explorar-resumo" className={estilos.secao}>Resultado do recorte</h2>
        {/* Os cartões não são região viva: trocados um a um, o NVDA os lia 2 a
            3 vezes por mudança. A voz é a frase do `explorar-anuncio`. */}
        <div className={base.grade}>
          <div className={base.cartao}>
            <span className={base.rotulo} id="explorar-rotulo-agregado">
              {ind.rotulo}, Brasil
            </span>
            <span className={base.valor} id="explorar-agregado">{valor(r.agregado)}</span>
          </div>
          <div className={base.cartao}>
            <span className={base.rotulo}>Municípios no recorte</span>
            <span className={base.valor} id="explorar-municipios">{br(r.municipios)}</span>
          </div>
          <div className={base.cartao}>
            <span className={base.rotulo}>Sem dado</span>
            <span className={base.valor} id="explorar-sem-dado">{br(r.semDado)}</span>
          </div>
        </div>
        <p className="so-leitor" id="explorar-anuncio" role="status" />
        <p className={base.ressalva} id="explorar-nota" data-mediana={NOTAS.mediana}
           data-soma={NOTAS.soma} data-razao={NOTAS.razao}>
          {NOTAS[ind.tipo]}
        </p>
        <p className={base.ressalva} id="explorar-fonte">{fonteDoIndicador(ind, fontes)}</p>
      </section>

      {camada && (
        <section aria-labelledby="explorar-mapa" id="explorar-mapa-secao">
          <h2 id="explorar-mapa" className={estilos.secao}>Por estado</h2>
          <MapaUf camadas={[camada]}
            nomes={Object.fromEntries(snapshot.ufs.map((u) => [u.sigla, u.nome]))} />
        </section>
      )}

      <section aria-labelledby="explorar-extremos">
        <h2 id="explorar-extremos" className={estilos.secao}>Os extremos</h2>
        <div className={estilos.extremos}>
          <ListaRanking id="explorar-maiores" titulo={`Os ${RANKING} maiores`}
            linhas={maiores} valor={valor} />
          <ListaRanking id="explorar-menores" titulo={`Os ${RANKING} menores`}
            linhas={menores} valor={valor} />
        </div>
      </section>

      <section aria-labelledby="explorar-tabela">
        <h2 id="explorar-tabela" className={estilos.secao}>Os municípios</h2>
        <div className={`${base.rolagem} rola-x`}>
          {/* O script troca cada `th` de `data-ordem` por um botão de
              ordenar, com a classe de `data-classe-ordenar`. A legenda tem o
              mesmo texto que ele escreve (`desenharTabela`). O nome vem do
              `aria-labelledby`: o tirado do `caption` ficava velho no NVDA
              depois da troca do texto (24/10/2026). */}
          <table className={base.lista} data-classe-ordenar={estilos.ordenar}
            aria-labelledby="explorar-legenda-tabela">
            <caption id="explorar-legenda-tabela">
              Municípios 1 a {Math.min(LINHAS_TABELA, r.municipios)} de {br(r.municipios)}.{" "}
              {ind.rotulo}. A posição é a do recorte, do maior para o menor.
            </caption>
            <thead>
              <tr>
                <th scope="col" className={base.num} data-ordem="posicao">Posição</th>
                <th scope="col" data-ordem="nome">Município</th>
                <th scope="col" data-ordem="uf">Estado</th>
                <th scope="col" className={base.num} aria-sort="descending" data-ordem="valor">
                  <span id="explorar-col-valor-texto">{ind.rotulo}</span>
                </th>
              </tr>
            </thead>
            <tbody id="explorar-linhas">
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
        {/* A tabela do build é a 1ª página; o script mostra a navegação com o
            total do recorte e baixa o resto só no 1º clique. */}
        <nav className={estilos.paginas} id="explorar-paginas" aria-label="Páginas da tabela" hidden>
          <button type="button" data-ir="-1">Anterior</button>
          {/* Sem `aria-live`: ela muda a cada filtro e só se diz ao paginar. */}
          <span data-pagina="" />
          <button type="button" data-ir="1">Próxima</button>
        </nav>
      </section>
      <script type="module" src="/explorar.js" />
    </main>
  );
}
