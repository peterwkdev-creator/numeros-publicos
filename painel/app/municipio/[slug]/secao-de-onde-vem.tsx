import { br, escala, escalaComSinal } from "../../../lib/dados";
import ComposicaoBarras from "../../componentes/composicao-barras";
import type { Contexto } from "./contexto";

/**
 * A composição da receita corrente (RREO).
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 *
 * A pergunta que vem ANTES da de cima, e que o site não respondia.
 * Fica DEPOIS na página de propósito: quem chega aqui veio buscar o
 * gasto, e "de onde vem" é a explicação que faz aquele número mudar de
 * sentido -- o município mediano do país custeia 7% do que gasta.
 */
export default function SecaoDeOndeVem({ c }: { c: Contexto }) {
  const { fiscal, m, receita , estilos } = c;
  if (!(receita && receita.total !== null && receita.total > 0)) return null;
  return (
    <section className={estilos.texto} id="de-onde-vem">
      <h2>De onde vem o dinheiro que {m.nome} gasta</h2>
      {/* Declaração incompleta NÃO vira composição. Apiaí/SP estava no ar
          dizendo "79,0% de impostos" com transferência zero -- e nenhum
          município recebe zero, o FPM é constitucional. A soma fechava:
          a régua da fonte compara a declaração consigo mesma. Aqui vale a
          regra do pessoal implausível: mostrar como declarado, dizer por
          que não descreve o município, e não desenhar a fatia. */}
      {receita.plausivel ? (
        <>
        <p>
          No {receita.periodo}º bimestre de {receita.exercicio},{" "}
          {m.nome} arrecadou{" "}
          <strong>{escala(receita.total).curto}</strong> de receita corrente.
          {" "}
          <strong>{br(((receita.transferida ?? 0) / receita.total) * 100, 1)}%</strong>{" "}
          veio de <strong>transferências</strong> — dinheiro que a União,
          o estado e os fundos repassam
          {receita.tributaria !== null && (
            <>
              , e{" "}
              <strong>{br((receita.tributaria / receita.total) * 100, 1)}%</strong>{" "}
              de <strong>impostos, taxas e contribuição de melhoria</strong>
              {" "}cobrados de quem mora e trabalha no município
            </>
          )}
          . É a outra metade da seção acima: ali está para onde o dinheiro
          vai, aqui de onde ele veio.
        </p>
        <div className={`${estilos.rolagem} rola-x`}>
          <ComposicaoBarras
            fatias={receita.fatias}
            total={receita.total}
            municipio={m.nome}
            legenda="Composição da receita corrente"
            cabecalho="Origem"
            cabecalhoPercentual="% da receita"
            nomeDaCauda={["origem", "origens"]}
          />
        </div>
        {receita.fatias.some((x) => x.valor < 0) && (
          <p className={estilos.ressalva}>
            Com valor negativo entre as origens:{" "}
            {receita.fatias.filter((x) => x.valor < 0).map((x) => x.nome).join(", ")}
            . É o que {m.nome} declarou ao SICONFI no período; o painel não
            o corrige.
          </p>
        )}
        {receita.detalhe.length > 0 && (
          <>
            <h3 className={estilos.subtitulo}>Dentro dessas origens</h3>
            {/* Lista, e não linhas da tabela acima: estes valores estão
                CONTIDOS nas componentes de lá. Numa tabela só, quem somasse
                a coluna encontraria mais dinheiro do que o município
                arrecadou -- e o número continuaria bem formado. */}
            <ul className={estilos.lista}>
              {receita.detalhe.map((d) => (
                <li key={d.nome}>
                  <strong title={escala(d.valor).exato}>
                    {escala(d.valor).curto}
                  </strong>{" "}
                  de {d.nome}
                  {d.dentroDe && <>, dentro de {d.dentroDe}</>}
                  {d.percentual !== null && (
                    <> ({br(d.percentual, 1)}% da receita corrente)</>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className={estilos.ressalva}>
          Receita <strong>corrente</strong> realizada até o bimestre — o que
          de fato entrou no caixa, não o que foi orçado. Não inclui receita de
          capital (empréstimos e venda de bens), que é dinheiro de natureza
          diferente e não custeia o dia a dia. As origens listadas somam o
          total que o próprio município declarou; os itens de{" "}
          <em>dentro dessas origens</em> já estão contados nelas e não se
          somam por fora. Fonte: {fiscal.receita?.fonte}.
        </p>
        </>
      ) : (
        <>
          <p>
            No {receita.periodo}º bimestre de {receita.exercicio},{" "}
            {m.nome} declarou{" "}
            <strong>{escala(receita.total).curto}</strong> de receita
            corrente
            {receita.implausivelPor === "transferencia-acima-do-total" ? (
              <>
                {" "}— menos do que os{" "}
                <strong>{escala(receita.transferida).curto}</strong> que
                declarou só em transferências, porque a declaração traz{" "}
                {receita.fatias.filter((x) => x.valor < 0).map((x, i) => (
                  <span key={x.nome}>
                    {i > 0 && " e "}
                    <strong>
                      {x.nome.toLocaleLowerCase("pt-BR")} em{" "}
                      {escalaComSinal(x.valor).curto}
                    </strong>
                  </span>
                ))}
                . Uma origem negativa desse tamanho não descreve de onde vem
                o dinheiro de {m.nome}: descreve um relatório com erro de
                lançamento.
              </>
            ) : (
              <>
                {" "}— <strong>sem nenhuma transferência corrente</strong>.
                Nenhum município brasileiro recebe zero: o Fundo de
                Participação dos Municípios é repasse obrigatório pela
                Constituição (art. 159). Isso não descreve de onde vem o
                dinheiro de {m.nome}: descreve um relatório enviado
                incompleto.
              </>
            )}
          </p>
          <p className={estilos.ressalva}>
            O valor acima é{" "}
            <strong>o que o município enviou ao SICONFI</strong>. Este painel
            não o corrige — corrigir seria inventar um número —, mas também
            não desenha a composição dele como se fosse a receita real. A
            declaração, como foi enviada, está no download desta página.
            Fonte: {fiscal.receita?.fonte}.
          </p>
        </>
      )}
    </section>
  );
}
