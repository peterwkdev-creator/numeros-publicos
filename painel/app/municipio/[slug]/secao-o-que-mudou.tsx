import Link from "next/link";
import { br, escala } from "../../../lib/dados";
import { DESLOCAMENTO_MINIMO } from "../../../lib/fiscal";
import Termo from "../../componentes/termo";
import SerieFuncoes from "../../componentes/serie-funcoes";
import type { Contexto } from "./contexto";

/**
 * A mudança de composição entre dois anos e a série das funções.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 *
 * A série NÃO depende mais da comparação. Ela dependia, e o efeito era
 * silencioso: quem tem 2020, 2021 e 2022 mas não tem o par mais recente
 * da coleta perdia os três anos que já estavam em mãos. São gates
 * diferentes — um exige dois anos consecutivos, o outro exige três
 * pontos quaisquer — e amarrá-los fazia o mais exigente mandar nos
 * dois.
 */
export default function SecaoOQueMudou({ c }: { c: Contexto }) {
  const { fiscal, m, serieFuncoes, comparacao, mudancas , estilos } = c;
  if (!(comparacao || serieFuncoes.length >= 3)) return null;
  return (
    <section className={estilos.texto} id="o-que-mudou">
      {comparacao && (
        <>
          <h2>O que mudou de {comparacao.exercicioAnterior} para{" "}
            {comparacao.exercicioAtual}</h2>
          <p>
            Entre o {comparacao.periodo}º bimestre de{" "}
            {comparacao.exercicioAnterior} e o mesmo bimestre de{" "}
            {comparacao.exercicioAtual}, o gasto total de {m.nome}{" "}
            {comparacao.crescimento >= 1 ? "cresceu" : "caiu"}{" "}
            <strong>
              {br(Math.abs(comparacao.crescimento - 1) * 100, 1)}%
            </strong>{" "}
            em valores nominais.{" "}
            {mudancas.length === 0 ? (
              <>
                A <strong>composição</strong> do gasto, porém, ficou
                praticamente igual: nenhuma função mudou de fatia em mais de{" "}
                {br(DESLOCAMENTO_MINIMO, 1)}{" "}
                <Termo chave="pontos-percentuais">ponto percentual</Termo>.
              </>
            ) : (
              <>
                E a <strong>composição</strong> mudou: abaixo, as funções cujo
                peso no orçamento se deslocou mais de{" "}
                {br(DESLOCAMENTO_MINIMO, 1)}{" "}
                <Termo chave="pontos-percentuais">ponto percentual</Termo>.
              </>
            )}
          </p>
        </>
      )}

      {mudancas.length > 0 && (
        <ul className={estilos.mudancas}>
          {mudancas.map((d) => (
            <li key={d.nome} className={d.pontos > 0 ? estilos.subiu : estilos.caiu}>
              <strong>{d.nome}</strong>{" "}
              <span className="tabular">
                {br(d.anterior, 1)}% → {br(d.atual, 1)}%
              </span>{" "}
              <span className={estilos.pontos}>
                {d.pontos > 0 ? "+" : "−"}
                {br(Math.abs(d.pontos), 1)} pp
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* A serie so aparece com tres anos ou mais: com dois, ela seria a
          mesma comparacao ja dita acima, desenhada.

          O titulo sobe para h2 quando nao ha comparacao acima -- senao a
          pagina teria um h3 sem h2, que e um salto de nivel para quem
          navega por titulos no leitor de tela. */}
      {serieFuncoes.length >= 3 && (
        <>
          {comparacao ? (
            <h3 className={estilos.subtitulo}>
              A composição ao longo dos anos
            </h3>
          ) : (
            <h2>A composição ao longo dos anos</h2>
          )}
          <p>
            Cada barra soma <strong>100%</strong> — o que muda é a
            proporção, não o tamanho. É de propósito: reais de{" "}
            {serieFuncoes[0]!.exercicio} e de{" "}
            {serieFuncoes[serieFuncoes.length - 1]!.exercicio} não são a
            mesma coisa, e uma barra proporcional ao total mostraria
            inflação onde se procura prioridade.
          </p>
          <SerieFuncoes pontos={serieFuncoes} />
          <div className={`${estilos.rolagem} rola-x`}>
            {/* Os valores do gráfico, que até 11/10/2026 dizia "estão na
                tabela abaixo" sobre uma tabela que só tinha o total: o
                percentual de cada função, por ano, não estava escrito em
                lugar nenhum. Uma linha por função, na ordem das barras. */}
            <table className={estilos.serie}>
              <caption className={estilos.legenda}>
                Despesa de {m.nome} por função, em % do total declarado até
                o {fiscal.funcoes?.periodo}º <Termo chave="bimestre">bimestre</Termo>{" "}
                de cada ano; o total, em reais nominais. Fonte: Tesouro
                Nacional, SICONFI (<Termo chave="rreo">RREO</Termo>).
              </caption>
              <thead>
                <tr>
                  <th scope="col">Função</th>
                  {serieFuncoes.map((p) => (
                    <th scope="col" className={estilos.num} key={p.exercicio}>
                      {p.exercicio}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {serieFuncoes[0]!.fatias.map((f, i) => (
                  <tr key={f.nome}>
                    <th scope="row">{f.nome.charAt(0).toUpperCase() + f.nome.slice(1)}</th>
                    {serieFuncoes.map((p) => {
                      const pct = p.fatias[i]?.percentual ?? null;
                      return (
                        <td className={`${estilos.num} tabular`} key={p.exercicio}>
                          {pct === null ? "—" : `${br(pct, 1)}%`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th scope="row">Total declarado</th>
                  {serieFuncoes.map((p) => (
                    <td
                      className={`${estilos.num} tabular`}
                      key={p.exercicio}
                      title={p.total === null ? undefined : escala(p.total).exato}
                    >
                      {p.total === null ? "—" : escala(p.total).curto}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className={estilos.ressalva}>
        {comparacao && (
          <>
            A comparação é entre o <strong>mesmo bimestre</strong> de dois
            anos, e não entre bimestres do mesmo ano — o RREO é acumulado,
            então o 6º bimestre já contém o 4º e comparar os dois mediria
            quase nada.{" "}
          </>
        )}
        Os valores são <strong><Termo chave="nominal">nominais</Termo></strong>: parte do crescimento é
        inflação, e este painel não deflaciona nada.{" "}
        {serieFuncoes.length >= 3 && (
          <>
            É também por isso que a série acima é em porcentagem:{" "}
            <strong>proporção não infla</strong>.{" "}
          </>
        )}
        <Link href="/ajuda/#comparacao">Por quê?</Link>
      </p>
    </section>
  );
}
