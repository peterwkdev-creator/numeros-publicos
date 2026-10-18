import Link from "next/link";
import { br } from "../../../lib/dados";
import { nomePonto } from "../../../lib/fiscal";
import Termo from "../../componentes/termo";
import SerieSvg from "./serie-svg";
import type { Contexto } from "./contexto";
import FonteGrafico from "../../componentes/fonte-grafico";

/**
 * A série do gasto com pessoal: texto, gráfico e tabela.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export default function SecaoAoLongoDoTempo({ c }: { c: Contexto }) {
  const { fiscal, m, f, serie, usaveis, condenado, delta, finalCondenado, vazios, semestral, umPeriodo , estilos } = c;
  if (!(serie.length > 1)) return null;
  return (
    <section className={estilos.texto} id="ao-longo-do-tempo">
      <h2>Gasto com pessoal ao longo do tempo, em % da receita corrente líquida</h2>
      <p>
        {delta === null ? (
          <>
            Não há dois {semestral ? "relatórios" : "quadrimestres"} com valor plausível o bastante para
            falar em tendência — a tabela abaixo mostra o que foi publicado.
          </>
        ) : delta > 0 ? (
          <>
            O comprometimento com pessoal <strong>subiu {br(delta, 2)} ponto
            {Math.abs(delta) >= 2 ? "s" : ""} percentua
            {Math.abs(delta) >= 2 ? "is" : "l"}</strong> entre o primeiro e o
            último {umPeriodo} {finalCondenado ? "com valor plausível" : "publicado"}.
          </>
        ) : delta < 0 ? (
          <>
            O comprometimento com pessoal <strong>caiu {br(Math.abs(delta), 2)}{" "}
            ponto{Math.abs(delta) >= 2 ? "s" : ""} percentua
            {Math.abs(delta) >= 2 ? "is" : "l"}</strong> entre o primeiro e o
            último {umPeriodo} {finalCondenado ? "com valor plausível" : "publicado"}.
          </>
        ) : (
          <>O comprometimento com pessoal ficou <strong>estável</strong>.</>
        )}{" "}
        Cada linha abaixo é um relatório entregue por {m.nome} ao SICONFI.
        {/* Quando há buraco, dizê-lo em prosa. A frase acima já é precisa
            -- "entre o primeiro e o último quadrimestre PUBLICADO" não
            afirma continuidade --, mas Presidente Médici/RO tem 40 meses
            sem entrega no meio, e uma precisão que o leitor não percebe
            não o protege. A contagem vem da MESMA função do gráfico. */}
        {vazios > 0 && (
          <>
            {" "}
            {/* O `:` cola no `</strong>` de propósito: numa linha própria,
                o JSX colapsa a quebra num espaço e sairia "interrupção :".
                Conferir isso pede o HTML CRU -- um extrator que troca tag
                por espaço INVENTA o espaço e acusa um defeito que não
                existe. Foi o que quase aconteceu aqui, em 09/09/2026. */}
            <strong>
              A série tem{" "}
              {vazios === 1
                ? "uma interrupção"
                : `${br(vazios, 0)} interrupções`}</strong>: {vazios === 1 ? "há um trecho" : "há trechos"} em que {m.nome}{" "}
            não entregou relatório, e o gráfico deixa {vazios === 1 ? "o vão" : "os vãos"}{" "}
            à vista em vez de ligar os pontos por cima.
          </>
        )}
      </p>
      <div className={estilos.grafico}>
        <SerieSvg
          pontos={usaveis}
          prudencial={f?.limitePrudencial ?? fiscal.limites.prudencial}
          legal={fiscal.limites.legal}
          municipio={m.nome}
        />
        <FonteGrafico
          fonte={fiscal.fonte}
          periodo={`${nomePonto(usaveis[0]!)} a ${nomePonto(usaveis[usaveis.length - 1]!)}`}
        />
      </div>

      <div className={`${estilos.rolagem} rola-x`}>
        <table className={estilos.serie}>
          <caption className={estilos.legenda}>
            Gasto com pessoal de {m.nome} em cada {umPeriodo} entregue, em %
            da receita corrente líquida.
          </caption>
          <thead>
            <tr>
              <th scope="col">
                {semestral ? "Período" : <Termo chave="quadrimestre">Quadrimestre</Termo>}
              </th>
              <th scope="col" className={estilos.num}>
                Gasto com pessoal{" "}
                (% da <Termo chave="rcl">RCL</Termo>)
              </th>
            </tr>
          </thead>
          <tbody>
            {serie.map((ponto) => {
              const [ex, pe, , pct] = ponto;
              // Ponto implausivel na serie precisa da mesma marca que no
              // cartao. Paripueira/AL declarou -19,35% em 2024/1: sem
              // marca, a linha parece o melhor resultado da tabela. E a
              // regra e a do cartao, inclusive a RCL desmentida.
              const fora = condenado(ponto);
              return (
                <tr key={`${ex}-${pe}`}>
                  <th scope="row">{nomePonto(ponto)}</th>
                  <td
                    className={`${estilos.num} tabular ${fora ? estilos.implausivel : ""}`}
                  >
                    {br(pct, 2)}%
                    {fora && (
                      <span className={estilos.marca}> implausível</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={estilos.ressalva}>
        Quadrimestre sem linha é quadrimestre em que o município{" "}
        <strong>não entregou</strong> o relatório — não zero, e não
        estabilidade.{" "}
        {semestral && (
          <>
            Nos anos em que {m.nome} entregou o{" "}
            <Termo chave="rgf-simplificado">RGF Simplificado</Termo>, semestral,
            não há 1º nem 2º quadrimestre a entregar: o 2º semestre aparece
            no lugar do 3º quadrimestre, e o gráfico liga os anos.{" "}
          </>
        )}
        <Link href="/ajuda/#travessao">Por que aparece “—”?</Link>
      </p>
    </section>
  );
}
