import {
  br, PAGINA_DA_CAPA as PAGINA, primeiraPaginaDaCapa, rotuloCurto, unidadeDaColuna,
  type Indicador, type LinhaMunicipio,
} from "@/lib/dados";
import { LETRA_FAIXA, ROTULO_FAIXA, slugDe, type Faixa } from "@/lib/fiscal";
import s from "./page.module.css";
import m from "./municipios.module.css";

/**
 * A tabela de municípios da capa: as primeiras 50 linhas em HTML, e o resto
 * sob demanda.
 *
 * ## Sem React desde 15/10/2026 (item 10 da revisão de 11/10)
 *
 * Até ali este era o único componente de cliente do site, e por causa dele a
 * capa levava o runtime do React e as 5.571 linhas dentro do HTML: 626 KB de
 * HTML e mais 185 KB comprimidos de JS, para toda visita, inclusive a de quem
 * só lia o resumo do país lá em cima. Agora o build escreve a primeira tela
 * da tabela, e `public/capa.js` só busca `/dados/capa.json` quando alguém
 * mexe nos controles. Filtrar continua local e síncrono depois disso.
 *
 * ## O que ele promete, e o que não
 *
 * - Os controles, os filtros aplicados e o "Mostrar mais" nascem `hidden`:
 *   sem script, a página mostra as 50 primeiras pela ordem padrão e diz onde
 *   está a lista inteira. Nada promete filtrar.
 * - A ordem padrão (`primeiraPaginaDaCapa`, em `lib/dados.ts`) é a mesma do
 *   `public/capa-lista.js`, e um teste compara as duas no snapshot real.
 * - As linhas que o script desenha saem dos `<template>` daqui, com as mesmas
 *   classes: a marcação de uma linha tem um dono só.
 */

/**
 * Os filtros de situação fiscal oferecidos, e por que só estes.
 *
 * As sete faixas existem no dado, mas oferecer as sete produziria um controle
 * que ninguém lê. Estas quatro são as perguntas que as pessoas de fato fazem —
 * e a última, "não entregou", é a que o site mais quer que se possa fazer:
 * são os municípios sobre os quais não se sabe nada, e sem um filtro eles
 * ficam diluídos entre os outros. (Eram 2.326 até 11/10/2026, quando o site
 * não lia o RGF Simplificado; 26 depois.) O valor de cada opção é a letra de
 * `LETRA_FAIXA`, a mesma que viaja no JSON.
 */
const FILTROS_FAIXA: Faixa[] = ["acima-legal", "acima-prudencial", "abaixo", "sem-dado"];

/**
 * Faixas de população. Os cortes são os do próprio IBGE para porte municipal,
 * e não números redondos escolhidos aqui — a régua tem de ser de alguém.
 */
const PORTES: { valor: string; rotulo: string; min: number; max?: number }[] = [
  { valor: "p", rotulo: "Até 20 mil habitantes", min: 0, max: 20000 },
  { valor: "m", rotulo: "20 mil a 100 mil", min: 20000, max: 100000 },
  { valor: "g", rotulo: "100 mil a 500 mil", min: 100000, max: 500000 },
  { valor: "gg", rotulo: "Mais de 500 mil", min: 500000 },
];

export function Municipios({
  linhas,
  indicadores,
}: {
  linhas: LinhaMunicipio[];
  indicadores: Indicador[];
}) {
  const ufs = [...new Set(linhas.map((l) => l[2]))].sort();
  const iPop = Math.max(0, indicadores.findIndex((i) => i.codigo === "populacao-censo-2022"));
  const visiveis = primeiraPaginaDaCapa(linhas, indicadores);
  const primeira = indicadores[0];

  return (
    <section className={s.secao} aria-labelledby="municipios" data-municipios=""
      data-total={linhas.length} data-ipop={iPop} data-ausente={s.ausente}>
      <h2 className={s.secaoTitulo} id="municipios">
        Municípios
      </h2>

      <noscript>
        <p className={s.secaoNota}>
          Sem JavaScript, a lista mostra os {PAGINA} primeiros
          {primeira ? ` pelo ${rotuloCurto(primeira.codigo, primeira.nome)}` : ""}.
          A lista inteira está em{" "}
          <a href="/dados/municipios.csv">municipios.csv</a>, e cada município
          tem a sua página.
        </p>
      </noscript>

      <div data-controles="" hidden>
        <p className={s.secaoNota}>
          Busque por nome, ou filtre por estado, situação fiscal e porte. Os
          filtros se somam, e a lista atualiza sozinha. Clique no cabeçalho de uma
          coluna para ordenar — municípios sem valor na fonte ficam sempre no fim.
        </p>

        <div className={m.controles}>
          <div className={m.campo}>
            <label htmlFor="busca">Buscar município</label>
            <input id="busca" type="search" placeholder="ex.: Acari" autoComplete="off" />
          </div>
          <div className={m.campo}>
            <label htmlFor="uf">Estado</label>
            <select id="uf">
              <option value="">Todos</option>
              {ufs.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className={m.campo}>
            <label htmlFor="faixa">Situação fiscal</label>
            <select id="faixa">
              <option value="">Todas as situações</option>
              {FILTROS_FAIXA.map((f) => (
                <option key={f} value={LETRA_FAIXA[f]}>{ROTULO_FAIXA[f]}</option>
              ))}
            </select>
          </div>
          <div className={m.campo}>
            <label htmlFor="porte">Porte</label>
            <select id="porte">
              <option value="">Qualquer porte</option>
              {PORTES.map((x) => (
                <option key={x.valor} value={x.valor} data-min={x.min} data-max={x.max}>
                  {x.rotulo}
                </option>
              ))}
            </select>
          </div>

          {/* A contagem traz o TOTAL junto: "38 municípios" sozinho não diz se o
              filtro cortou muito ou pouco, e é essa proporção que informa.
              `aria-atomic` explícito — `role="status"` não é atômico por padrão
              em todo ambiente (técnica ARIA22 do WCAG). */}
          <p className={m.contagem} role="status" aria-live="polite" aria-atomic="true"
            data-contagem="">
            <strong>{br(linhas.length)}</strong> municípios
          </p>
        </div>

        {/* Os filtros aplicados, visíveis e removíveis um a um — o padrão de
            filtro de busca do GOV.UK. Sem isto, quem rolou a página não vê mais
            os controles e não entende por que a lista está curta; e desfazer
            exige achar o `select` certo de novo. */}
        <div className={m.aplicados} data-aplicados="" hidden>
          <span className={m.aplicadosRotulo}>Filtros aplicados:</span>
          <ul data-lista-aplicados="" />
          <button type="button" className={m.limparTudo} data-limpar-tudo="" hidden>
            Limpar tudo
          </button>
        </div>
        <template data-modelo="filtro">
          <li>
            <button type="button" className={m.remover}>
              <span data-rotulo="" />
              <span aria-hidden="true"> ×</span>
              <span className="so-leitor"> — remover este filtro</span>
            </button>
          </li>
        </template>
      </div>

      <div className={s.rolagem}>
        <table className={s.tabela}>
          {/* O cabeçalho diz o quê, não de quando: o ano de cada coluna e a
              fonte ficam aqui, como na tabela de estados logo acima. */}
          <caption>
            Municípios do Brasil:{" "}
            {indicadores
              .map((i) => `${rotuloCurto(i.codigo, i.nome)} de ${i.periodo}`)
              .join(", ")
              .replace(/, ([^,]*)$/, " e $1")}
            . Fonte: IBGE.
          </caption>
          <thead>
            <tr>
              <th scope="col" aria-sort="none">
                <button type="button" className={m.ordenar} data-ordenar="nome">
                  Município <span aria-hidden="true" data-seta="" />
                </button>
              </th>
              <th scope="col">UF</th>
              {indicadores.map((i, n) => (
                <th key={i.codigo} scope="col" className={s.numero}
                  aria-sort={n === 0 ? "descending" : "none"}>
                  <button type="button" className={`${m.ordenar} ${m.ordenarNumero}`}
                    data-ordenar={n} data-codigo={i.codigo}>
                    {/* O mesmo rótulo e a mesma unidade da tabela por
                        estado: até 11/10/2026 esta coluna mostrava o nome
                        cru do IBGE, e o PIB de São Paulo, em R$ mil, lia
                        como R$ 1 bilhão. */}
                    {rotuloCurto(i.codigo, i.nome)}
                    {unidadeDaColuna(i.codigo) && (
                      <span className={s.ausente}> ({unidadeDaColuna(i.codigo)})</span>
                    )}{" "}
                    <span aria-hidden="true" data-seta="">{n === 0 ? "↓" : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody data-corpo="">
            {visiveis.map((x) => (
              <tr key={x.codigo}>
                <th scope="row">
                  <a href={`/municipio/${slugDe(x.nome, x.uf)}/`}>{x.nome}</a>
                </th>
                <td>{x.uf}</td>
                {indicadores.map((i) => (
                  <td key={i.codigo}
                    className={[s.numero, "tabular", x.valores[i.codigo] == null && s.ausente]
                      .filter(Boolean).join(" ")}>
                    {br(x.valores[i.codigo])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <template data-modelo="linha">
          <tr>
            <th scope="row"><a href="/" /></th>
            <td />
            {indicadores.map((i) => (
              <td key={i.codigo} className={`${s.numero} tabular`} />
            ))}
          </tr>
        </template>
        <template data-modelo="vazio">
          <tr>
            {/* Os rótulos vão como estão, sem `toLowerCase()`: ele
                transformava "Estado: CE" em "estado: ce", e sigla em
                minúscula deixa de ser sigla. */}
            <td colSpan={2 + indicadores.length} className={m.vazio} />
          </tr>
        </template>
      </div>

      <button type="button" className={m.maisBotao} data-mais="" hidden />
    </section>
  );
}
