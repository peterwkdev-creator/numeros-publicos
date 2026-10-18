import Termo from "../../componentes/termo";
import TiraEstados from "../../componentes/tira-estados";
import { br } from "../../../lib/dados";
import type { Contexto } from "./contexto";

/**
 * O estado ao lado dos outros: entrega do relatório fiscal e mediana do gasto com pessoal.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoComparacao({ c }: { c: Contexto }) {
  const { r, panorama, meu, brasilTaxa, brasilMediana, sc, rs, ba, ma, contraste, posTaxa, medianas, posMediana, de, quadrimestre, estilos } = c;
  // A pergunta que a página do município faz e a do estado não fazia.
  // Só ficou possível com os 5.570 municípios consultados — antes disso
  // não havia contra o que comparar. Ver `lib/nacional.ts`.
  if (!(meu && posTaxa)) return null;
  return (
    <section className={estilos.texto} id="comparacao">
      {/* O número sai do panorama, nunca cravado: o Distrito Federal fica
          de fora (não entrega como município, ver `PRESTA_COMO_ESTADO`),
          então são 26 e não 27. Escrever "27" aqui seria a mesma mentira
          silenciosa que a mediana regional cravada já custou. */}
      <h2>
        {r.uf.nome} ao lado dos outros estados
      </h2>

      <h3 className={estilos.subtitulo}>Quantos prestam contas</h3>
      <p>
        <strong>{br(meu.publicaram)}</strong> dos{" "}
        <strong>{br(meu.municipios)}</strong> municípios {de}
        {/* `meu.municipios` não conta quem ainda não estava instalado:
            sem estas palavras, MT diria "dos 141" e tem 142. */}
        {r.naoInstalados > 0 && " já instalados"} entregaram o
        Relatório de Gestão Fiscal do {quadrimestre}, ou o{" "}
        <Termo chave="rgf-simplificado">simplificado</Termo> do 2º
        semestre, que cobre os mesmos 12 meses —{" "}
        <strong>{br(meu.taxa, 0)}%</strong>. Entre as{" "}
        {br(panorama.length)} com relatório municipal,{" "}
        {posTaxa.abaixo === 0 ? (
          <>nenhum entrega menos</>
        ) : (
          <>
            <strong>
              {br(posTaxa.abaixo)}{" "}
              {posTaxa.abaixo === 1 ? "entrega" : "entregam"} menos
            </strong>
          </>
        )}
        .
      </p>
      <div className={estilos.grafico}>
        {/* O título ficava só no <title> do SVG, que a tela não mostra:
            quem via a tira não sabia o que era cada ponto. */}
        <p className={estilos.fonte}>
          Municípios que entregaram o relatório fiscal do {quadrimestre},
          em % do total de cada estado. Cada ponto é uma unidade da
          federação; o losango é {r.uf.nome}
          {brasilTaxa !== null && "; o traço, o Brasil"}. Fonte: Tesouro
          Nacional, SICONFI.
        </p>
        <TiraEstados
          panorama={panorama}
          destaque={r.uf.sigla}
          valorDe={(x) => x.taxa}
          formatar={(v) => `${br(v, 0)}%`}
          referencia={brasilTaxa !== null ? { valor: brasilTaxa, rotulo: "Brasil" } : null}
          rotuloEixo="Percentual de municípios que entregaram o relatório fiscal, por estado"
          descricao={
            `As ${panorama.length} unidades da federação pelo percentual ` +
            `de municípios que entregaram o ` +
            `relatório fiscal. ${r.uf.nome} está em ${br(meu.taxa, 0)}%, ` +
            `acima de ${br(posTaxa.abaixo)} dos outros. O menor é ` +
            `${br(Math.min(...panorama.map((x) => x.taxa)), 0)}% e o maior ` +
            `${br(Math.max(...panorama.map((x) => x.taxa)), 0)}%.` +
            (brasilTaxa !== null ? ` No país, ${br(brasilTaxa, 0)}%.` : "")
          }
        />
      </div>
      <p className={estilos.ressalva}>
        A entrega varia de{" "}
        <strong>
          {br(Math.min(...panorama.map((x) => x.taxa)), 0)}% a{" "}
          {br(Math.max(...panorama.map((x) => x.taxa)), 0)}%
        </strong>{" "}
        entre as unidades da federação
        {contraste ? (
          <>
            , e <strong>não é uma divisão regional</strong>: Santa Catarina
            entrega {br(sc!, 0)}% e o Rio Grande do Sul {br(rs!, 0)}%,
            vizinhos; a Bahia {br(ba!, 0)}% e o Maranhão {br(ma!, 0)}%,
            ambos no Nordeste.
          </>
        ) : "."}{" "}
        Entregar é obrigação da Lei de
        Responsabilidade Fiscal, mas não entregar tem causas que este painel
        não conhece — aqui está o número, não o motivo.
      </p>

      {meu.mediana !== null && posMediana && (
        <>
          <h3 className={estilos.subtitulo}>Quanto se gasta com pessoal</h3>
          <p>
            A <Termo chave="mediana">mediana</Termo> {de} é <strong>{br(meu.mediana, 2)}%</strong> da
            receita corrente líquida ajustada, calculada sobre{" "}
            <strong>{br(meu.base)}</strong>{" "}
            {meu.base === 1 ? "município" : "municípios"}. Entre os{" "}
            {br(medianas.length)} com base suficiente,{" "}
            {posMediana.abaixo === 0 ? (
              <>nenhum tem mediana menor</>
            ) : (
              <strong>
                {br(posMediana.abaixo)}{" "}
                {posMediana.abaixo === 1 ? "tem" : "têm"} mediana menor
              </strong>
            )}
            .
          </p>
          <div className={estilos.grafico}>
            <p className={estilos.fonte}>
              Mediana do gasto com pessoal dos municípios de cada estado
              no {quadrimestre}, em % da receita corrente líquida, só onde
              a base é suficiente. O losango é {r.uf.nome}
              {brasilMediana !== null && "; o traço, a mediana de todos os municípios do país"}.
              Fonte: Tesouro Nacional, SICONFI.
            </p>
            <TiraEstados
              panorama={panorama}
              destaque={r.uf.sigla}
              valorDe={(x) => x.mediana}
              formatar={(v) => `${br(v, 2)}%`}
              referencia={brasilMediana !== null ? { valor: brasilMediana, rotulo: "Brasil" } : null}
              rotuloEixo="Mediana do gasto com pessoal, por estado"
              descricao={
                `As unidades da federação pela mediana do gasto com ` +
                `pessoal. ` +
                `${r.uf.nome} está em ${br(meu.mediana, 2)}%, acima de ` +
                `${br(posMediana.abaixo)} das ${br(posMediana.de)} ` +
                `com base suficiente.` +
                (brasilMediana !== null
                  ? ` A mediana de todos os municípios do país é ${br(brasilMediana, 2)}%.`
                  : "")
              }
            />
          </div>
          <p className={estilos.ressalva}>
            {meu.taxa < 50 ? (
              <>
                <strong>Leia esta mediana com reserva.</strong> Ela descreve
                os {br(meu.base)} municípios que entregaram — {br(meu.taxa, 0)}%
                do estado. Sobre os outros não se sabe nada, e nada garante
                que se pareçam com estes.
              </>
            ) : (
              <>
                A mediana descreve os {br(meu.base)} municípios que
                entregaram, não os {br(meu.municipios)}{" "}
                {r.naoInstalados > 0 ? "já instalados" : "do estado"}. Sobre os
                que não entregaram não se sabe nada.
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}
