import { br, escala } from "../../../lib/dados";
import { ROTULO_FAIXA } from "../../../lib/fiscal";
import Termo from "../../componentes/termo";
import type { Contexto } from "./contexto";

/**
 * Os quatro cartões de indicadores do alto da página: população, PIB, PIB por habitante e gasto com pessoal.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export default function SecaoCartoes({ c }: { c: Contexto }) {
  const { pop, estimada, pibReais, perCapita, f, periodoRgf, anoEstimada, anoPib , estilos } = c;
  return (
    <section className={estilos.grade} aria-label="Indicadores">
      <article className={estilos.cartao}>
        <h2 className={estilos.rotulo}>População</h2>
        {/* Sem Censo (hoje só Boa Esperança do Norte/MT), o número principal
            é a estimativa, com o ano dela, e a frase diz o que falta: um
            travessão sozinho não diz se o dado não existe ou se a página
            quebrou. A frase descreve o dado, não a causa: a causa não está
            na fonte. Mudou aqui, muda o `conferir-numeros.py`. */}
        <p className={`${estilos.valor} tabular`}>
          {pop !== null ? br(pop, 0) : estimada !== null ? br(estimada, 0) : "—"}
        </p>
        {pop !== null ? (
          <>
            <p className={estilos.fonte}>Censo 2022 · IBGE</p>
            {estimada !== null && (
              <p className={estilos.fonte}>
                Estimativa do IBGE para {anoEstimada}: {br(estimada, 0)}
              </p>
            )}
          </>
        ) : (
          <p className={estilos.fonte}>
            {estimada !== null && (
              <>
                Estimativa do IBGE para {anoEstimada}
                <br />
              </>
            )}
            O IBGE não publicou a população do Censo 2022 para este município.
          </p>
        )}
      </article>

      <article className={estilos.cartao}>
        <h2 className={estilos.rotulo}>PIB municipal</h2>
        <p className={`${estilos.valor} tabular`} title={escala(pibReais).exato}>
          {escala(pibReais).curto}
        </p>
        <p className={estilos.fonte}>
          {pibReais !== null ? (
            <>
              {anoPib}, a preços correntes · IBGE
              <br />
              {escala(pibReais).exato}
            </>
          ) : (
            <>O IBGE não publicou o PIB de {anoPib} para este município.</>
          )}
        </p>
      </article>

      <article className={estilos.cartao}>
        <h2 className={estilos.rotulo}>PIB por habitante</h2>
        <p className={`${estilos.valor} tabular`}>
          {perCapita === null ? "—" : `R$ ${br(perCapita, 0)}`}
        </p>
        <p className={estilos.fonte}>
          {pibReais === null
            ? `Depende do PIB de ${anoPib}, que o IBGE não publicou para este município.`
            : pop === null
              ? "Depende da população do Censo 2022, que o IBGE não publicou para este município."
              : `PIB de ${anoPib} dividido pela população do Censo 2022`}
        </p>
      </article>

      <article className={`${estilos.cartao} ${estilos[f?.faixa ?? "nao-consultado"]}`}>
        <h2 className={estilos.rotulo}>Gasto com pessoal</h2>
        <p className={`${estilos.valor} tabular`}>
          {f?.percentual === null || f?.percentual === undefined
            ? "—"
            : `${br(f.percentual, 2)}%`}
        </p>
        <p className={estilos.selo}>
          {f?.faixa === "implausivel" ? (
            <Termo chave="implausivel">
              {ROTULO_FAIXA.implausivel}
            </Termo>
          ) : f?.faixa === "sem-dado" ? (
            <Termo chave="sem-relatorio">
              {ROTULO_FAIXA["sem-dado"]}
            </Termo>
          ) : f?.faixa === "como-estado" ? (
            <Termo chave="como-estado">
              {ROTULO_FAIXA["como-estado"]}
            </Termo>
          ) : f?.faixa === "nao-instalado" ? (
            <Termo chave="nao-instalado">
              {ROTULO_FAIXA["nao-instalado"]}
            </Termo>
          ) : (
            ROTULO_FAIXA[f?.faixa ?? "nao-consultado"]
          )}
        </p>
        {/* O PAR que produz o percentual, pela mesma regra que o Censo já
            aplica: *"o número absoluto é o que permite a alguém conferir, e a
            proporção sozinha esconde o tamanho"* (`lib/censo.ts`).

            A tabela do Censo diz "77.761 de 90.440". Esta, até 21/09/2026,
            dizia só "60,64%" — e os dois valores que produzem esse número já
            estavam no snapshot, exibidos em lugar nenhum. 60,64% não
            distingue uma prefeitura de R$ 1,2 bilhão de uma de R$ 12
            milhões, e é o absoluto que permite conferir contra o relatório
            que o próprio município entregou ao SICONFI.

            Os dois podem faltar independentemente do percentual: são **91 os
            municípios com despesa e sem RCL** — a fonte não publica a linha
            (ver `lib/fiscal.ts`). Sem o par, a frase simplesmente não sai. */}
        {f?.despesa != null && f?.rclAjustada != null && (
          <p
            className={`${estilos.fonte} tabular`}
            title={`${escala(f.despesa).exato} de ${escala(f.rclAjustada).exato}`}
          >
            {escala(f.despesa).curto} de {escala(f.rclAjustada).curto}
          </p>
        )}
        <p className={estilos.fonte}>
          da{" "}
          <Termo chave="rcl">
            receita corrente líquida ajustada
          </Termo>{" "}
          · {periodoRgf}
          {f?.simplificado ? " · RGF Simplificado" : ""} · SICONFI
        </p>
      </article>
    </section>
  );
}
