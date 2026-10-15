import Link from "next/link";
import { br } from "../../../lib/dados";
import { deEstado } from "../../../lib/estado";
import DistribuicaoSvg from "../../componentes/distribuicao-svg";
import type { Contexto } from "./contexto";

/**
 * O gasto com pessoal contra os municípios do mesmo estado.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export default function SecaoIssoEMuito({ c }: { c: Contexto }) {
  const { fiscal, m, f, posicao, nacional , estilos } = c;
  if (!(posicao && f?.percentual !== null && f?.percentual !== undefined)) return null;
  return (
    <section className={estilos.texto} id="isso-e-muito">
      <h2>Isso é muito?</h2>
      <p>
        O teto legal responde <em>se está dentro da lei</em>. Não responde
        se {m.nome} é um caso isolado ou se boa parte do estado está no
        mesmo lugar — e as duas situações pedem leituras opostas do mesmo
        número.
      </p>
      <p>
        Entre os <strong>{br(posicao.base)}</strong> municípios{" "}
        {deEstado(m.uf)} que entregaram o relatório com valor
        plausível, {m.nome} está{" "}
        <strong>
          acima de {br(posicao.percentil, 0)}%
        </strong>{" "}
        deles. A mediana do estado é{" "}
        <strong>{br(posicao.mediana, 2)}%</strong>.
      </p>

      <div className={estilos.grafico}>
        <DistribuicaoSvg
          posicao={posicao}
          percentual={f.percentual}
          prudencial={f.limitePrudencial ?? fiscal.limites.prudencial}
          legal={fiscal.limites.legal}
          municipio={m.nome}
          conjunto={deEstado(m.uf)}
        />
        {/* Como ler, pela FORMA de cada marca e não pela cor: até
            11/10/2026 o gráfico não dizia o que eram as colunas nem a
            linha cheia, e quem não lê a descrição para leitor de tela
            ficava sem a chave. */}
        <p className={estilos.legenda}>
          Cada coluna é um grupo de municípios {deEstado(m.uf)} com gasto
          parecido: quanto mais alta, mais municípios ali. A linha cheia
          com o ponto é {m.nome}; as tracejadas, o limite prudencial e o
          teto legal.
        </p>
      </div>

      {/* O contexto NACIONAL, e só para quem passou do teto.
          Mesma contenção da frase "não é um caso isolado" na página de
          quem não entregou: ela entra onde é sobre aquele fato específico,
          e não em toda página. A seção acima situa no estado; um município
          acima do limite é o único caso em que o país acrescenta algo — e
          é também o único em que o leitor tem razão de querer a lista.

          O link de volta faltava: medido em 07/09/2026, a página de
          ranking era alcançável só da capa, e nenhum dos 335 municípios
          que estão nela sabia disso. */}
      {f?.faixa === "acima-legal" && nacional.acimaDoTeto.length > 1 && (
        <p>
          No país, {m.nome} é um dos{" "}
          <strong>{br(nacional.acimaDoTeto.length)}</strong> municípios que
          declararam gasto com pessoal acima do teto, entre os{" "}
          <strong>{br(nacional.publicaram)}</strong> que entregaram o
          relatório.{" "}
          <Link href="/ranking/gasto-com-pessoal/" prefetch={false}>
            Ver a lista nacional
          </Link>
          .
        </p>
      )}

      <p className={estilos.ressalva}>
        Entram na comparação apenas os que <strong>entregaram</strong> o
        relatório e cujo percentual está entre 0 e 100%. Quem não entregou
        não tem número — tratá-lo como zero o poria no fim da fila por não
        ter prestado contas, que é o inverso da verdade. E um percentual
        acima de 100% é erro de preenchimento: contado, empurraria todos os
        outros um degrau.
      </p>
    </section>
  );
}
