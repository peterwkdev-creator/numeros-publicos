import { dataBr, MAPA_EMPRESAS, milhoes } from "../../lib/simei";
import type { Contexto } from "./contexto";

/**
 * Os MEI: o SIMEI e o Mapa de Empresas.
 * Criada em 05/11/2026 com as notas que cada página de município repetia
 * (`secao-trabalho.tsx`): lá fica uma linha e o link para cá.
 */
export default function SecaoMei({ ctx }: { ctx: Contexto }) {
  const { simei, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="mei">
      <h2>Os MEI: o SIMEI e o Mapa de Empresas</h2>
      <p>
        A página de cada município conta os <strong>microempreendedores
        individuais (MEI)</strong> optantes pelo <strong>SIMEI</strong>, o
        sistema de valores fixos mensais do Simples Nacional, nas
        Estatísticas do Simples Nacional da Receita Federal: o 31 de dezembro
        de cada ano e a posição consolidada mais recente.
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>Optante não é o mesmo que ativo.</strong> O Mapa de
          Empresas conta só os MEI ativos, e só no total do país:{" "}
          {MAPA_EMPRESAS.ativos} em {MAPA_EMPRESAS.em}, contra{" "}
          {/* Do dado, e não do teclado: o total do país na posição atual,
              que o exportador confere contra as 27 linhas TOTAL. */}
          {milhoes(simei.totais[simei.totais.length - 1]!)} no SIMEI em{" "}
          {dataBr(simei.posicao)}.
        </li>
        <li>
          <strong>Ano sem barra no gráfico</strong> quer dizer que o município
          não aparece na tabela da Receita naquela data: nenhum optante
          registrado. Nunca é um zero inventado.
        </li>
        <li>
          <strong>Por mil habitantes</strong> usa a estimativa de população do
          IBGE que a página já mostra.
        </li>
      </ul>
      <p>
        A série inteira, desde {dataBr(simei.datas[0]!)}, está em{" "}
        <a href="/dados/mei.csv">CSV</a> e{" "}
        <a href="/dados/mei.xlsx">XLSX</a>.
      </p>
    </section>
  );
}
