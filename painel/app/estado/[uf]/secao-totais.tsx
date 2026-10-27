import Termo from "../../componentes/termo";
import { br, escala, periodoDe } from "../../../lib/dados";
import type { Contexto } from "./contexto";

/**
 * A grade de cartões com os totais do estado.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoTotais({ c }: { c: Contexto }) {
  const { snapshot, r, ausentes, medIdeb, semRede, pop, pibReais, quadrimestre, estilos } = c;
  return (
    <section className={estilos.grade} aria-label="Totais do estado">
      <article className={estilos.cartao}>
        <h2 className={estilos.rotulo}>População</h2>
        <p className={`${estilos.valor} tabular`}>{br(pop)}</p>
        <p className={estilos.fonte}>Censo 2022 · IBGE</p>
      </article>

      <article className={estilos.cartao}>
        <h2 className={estilos.rotulo}>PIB somado</h2>
        <p className={`${estilos.valor} tabular`} title={escala(pibReais).exato}>
          {escala(pibReais).curto}
        </p>
        <p className={estilos.fonte}>
          {periodoDe(snapshot, "pib-municipal")}, a preços correntes · IBGE
        </p>
      </article>

      <article className={estilos.cartao}>
        <h2 className={estilos.rotulo}>
          <Termo chave="mediana">Mediana</Termo> do{" "}
          <Termo chave="gasto-com-pessoal">
            gasto com pessoal
          </Termo>
        </h2>
        <p className={`${estilos.valor} tabular`}>
          {r.medianaPessoal === null ? "—" : `${br(r.medianaPessoal, 2)}%`}
        </p>
        <p className={estilos.fonte}>
          {r.baseMedia === 0
            ? "sem base para calcular"
            : r.medianaPessoal === null
            ? `base insuficiente (${br(r.baseMedia)} ${r.baseMedia === 1 ? "município" : "municípios"})`
            : `mediana de ${br(r.baseMedia)} ${r.baseMedia === 1 ? "município" : "municípios"} com valor possível`}{" "}
          · {quadrimestre} · SICONFI
        </p>
      </article>

      {medIdeb && (
        <article className={estilos.cartao}>
          <h2 className={estilos.rotulo}>IDEB mediano</h2>
          <p className={`${estilos.valor} tabular`}>
            {br(medIdeb.mediana, 1)}
          </p>
          <p className={estilos.fonte}>
            <Termo chave="rede-municipal">
              rede municipal
            </Termo>
            , anos iniciais · {medIdeb.edicao} · INEP
            <br />
            mediana de {br(medIdeb.base)} municípios, escala de 0 a 10
            {semRede > 0 && (
              <>
                <br />
                <strong>{br(semRede)}</strong>{" "}
                {semRede === 1 ? "não tem" : "não têm"} rede municipal
              </>
            )}
          </p>
        </article>
      )}

      {r.publicaram === 0 ? (
        <article className={`${estilos.cartao} ${estilos["como-estado"]}`}>
          <h2 className={estilos.rotulo}>Teto legal</h2>
          <p className={`${estilos.valor} tabular`}>—</p>
          <p className={estilos.fonte}>
            {r.comoEstado === r.uf.municipios
              ? "Não se aplica: presta contas como estado, e não como município."
              : "Nenhum relatório municipal entregue no período."}
          </p>
        </article>
      ) : (
      <article className={`${estilos.cartao} ${estilos.destaque}`}>
        <h2 className={estilos.rotulo}>Acima do teto legal</h2>
        <p className={`${estilos.valor} tabular`}>
          {br(r.porFaixa["acima-legal"])}
        </p>
        {/* O denominador é quem ENTREGOU, nunca o total de municípios do
            estado. "7 de 497" convida a ler que 490 estão bem — quando 422
            deles apenas não prestaram contas, e sobre esses não se sabe
            nada. Ver a nota em `ResumoEstado.publicaram`. */}
        <p className={estilos.fonte}>
          de {br(r.publicaram)}{" "}
          {r.publicaram === 1 ? "município que entregou" : "que entregaram"}{" "}
          relatório, no {quadrimestre}
          {ausentes > 0 && (
            <>
              <br />
              <strong>{br(ausentes)}</strong>{" "}
              {ausentes === 1 ? "não entregou" : "não entregaram"}: sobre{" "}
              {ausentes === 1 ? "ele" : "esses"} não se sabe
            </>
          )}
          {r.comoEstado > 0 && (
            <>
              <br />
              {r.comoEstado === 1 ? "Outro ente presta" : `Outros ${br(r.comoEstado)} prestam`}{" "}
              contas como estado
            </>
          )}
          {r.naoInstalados > 0 && (
            <>
              <br />
              {r.naoInstalados === 1
                ? "Outro município ainda não estava instalado"
                : `Outros ${br(r.naoInstalados)} municípios ainda não estavam instalados`}
            </>
          )}
        </p>
      </article>
      )}
    </section>
  );
}
