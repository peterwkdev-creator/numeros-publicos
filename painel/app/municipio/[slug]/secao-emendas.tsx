import { br, dataCurta, escalaComSinal } from "../../../lib/dados";
import { deEstado } from "../../../lib/estado";
import { mesDeCorte, SEM_PREFEITURA } from "../../../lib/emendas";
import ComposicaoBarras from "../../componentes/composicao-barras";
import Termo from "../../componentes/termo";
import type { Contexto } from "./contexto";

/**
 * Emendas parlamentares pagas à prefeitura.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 *
 * Emendas parlamentares pagas à prefeitura (Portal da Transparência,
 * 09/10/2026). SÓ o último ano cheio e o corrente: até 2024 parte do
 * dinheiro ia ao Banco do Brasil sem município, e uma série de 2015 a
 * 2026 mostraria em 2025 um salto que é em boa parte mudança de
 * registro (especs/numeros-publicos-emendas.md, armadilha 2). A série
 * inteira vai no download, com a mesma nota.
 */
export default function SecaoEmendas({ c }: { c: Contexto }) {
  const { emendas, m, emendasM, emendasPh, posEmendas, anoEstimada , estilos } = c;
  if (!(emendasM)) return null;
  return (
    <section className={estilos.texto} id="emendas">
      <h2>Emendas parlamentares pagas a {m.nome}</h2>
      {emendasM.temRecente ? (
        <p>
          {emendasM.cheio.reais === null ? (
            <>
              Em {emendasM.cheio.ano}, nenhum pagamento de emenda
              parlamentar à prefeitura de {m.nome} ou a fundo municipal
              foi registrado.
            </>
          ) : emendasM.cheio.reais < 0 ? (
            <>
              Em {emendasM.cheio.ano}, os estornos de emendas
              parlamentares superaram os pagamentos à prefeitura de{" "}
              {m.nome} e aos fundos municipais: o saldo do ano é{" "}
              <strong title={escalaComSinal(emendasM.cheio.reais).exato}>
                {escalaComSinal(emendasM.cheio.reais).curto}
              </strong>.
            </>
          ) : (
            <>
              Em {emendasM.cheio.ano}, a prefeitura de {m.nome} e os
              fundos municipais receberam{" "}
              <strong title={escalaComSinal(emendasM.cheio.reais).exato}>
                {escalaComSinal(emendasM.cheio.reais).curto}
              </strong>{" "}
              em pagamentos de emendas parlamentares.
            </>
          )}
          {emendasM.parcial && (
            emendasM.parcial.reais === null ? (
              <>
                {" "}Em {emendasM.parcial.ano}, até {mesDeCorte(emendas.ultimoMes)},
                nenhum pagamento foi registrado.
              </>
            ) : (
              <>
                {" "}Em {emendasM.parcial.ano}, até {mesDeCorte(emendas.ultimoMes)},
                o saldo é de{" "}
                <strong title={escalaComSinal(emendasM.parcial.reais).exato}>
                  {escalaComSinal(emendasM.parcial.reais).curto}
                </strong>.
              </>
            )
          )}
        </p>
      ) : SEM_PREFEITURA.has(m.codigo) ? (
        <p>
          {m.nome} não tem prefeitura: {SEM_PREFEITURA.get(m.codigo)}, e
          esta seção conta só o que vai a prefeituras e fundos municipais.
        </p>
      ) : (
        <p>
          Nenhum pagamento de emenda parlamentar à prefeitura de {m.nome} ou
          a fundo municipal foi registrado em {emendasM.cheio.ano}
          {emendasM.parcial && (
            <> nem em {emendasM.parcial.ano}, até {mesDeCorte(emendas.ultimoMes)}</>
          )}.
        </p>
      )}
      {emendasM.cheio.reais !== null && emendasM.cheio.reais > 0 &&
        emendasPh !== null && (
        <p>
          Por habitante, são <strong>{"R$ "}{br(emendasPh, 2)}</strong> em{" "}
          {emendasM.cheio.ano}, pela população estimada de {anoEstimada}
          {posEmendas ? (
            <>
              : fica{" "}
              <strong>
                {emendasPh > posEmendas.mediana ? "acima da"
                  : emendasPh < posEmendas.mediana ? "abaixo da" : "igual à"}
              </strong>{" "}
              <Termo chave="mediana">mediana</Termo> dos{" "}
              {br(posEmendas.de)} municípios {deEstado(m.uf)} com pagamento
              no ano, que é <strong>{"R$ "}{br(posEmendas.mediana, 2)}</strong>.
            </>
          ) : "."}
        </p>
      )}
      {emendasM.cheio.reais !== null && emendasM.cheio.reais > 0 &&
        emendasM.tipos.length > 0 && (
        <>
          <h3 className={estilos.subtitulo}>
            Por tipo de emenda, em {emendasM.cheio.ano}
          </h3>
          <div className={estilos.rolagem}>
            <ComposicaoBarras
              fatias={emendasM.tipos}
              total={emendasM.cheio.reais}
              municipio={m.nome}
              legenda={`Emendas parlamentares pagas em ${emendasM.cheio.ano} por tipo`}
              cabecalho="Tipo de emenda"
              cabecalhoPercentual={`% de ${emendasM.cheio.ano}`}
              nomeDaCauda={["tipo", "tipos"]}
            />
          </div>
          {emendasM.tipos.some((t) => t.valor < 0) && (
            <p className={estilos.ressalva}>
              Valor negativo: no ano, os estornos daquele tipo de emenda
              superaram os pagamentos.
            </p>
          )}
        </>
      )}
      <p className={estilos.ressalva}>
        Conta o que a União <strong>pagou</strong> à prefeitura e aos
        fundos municipais (como o de saúde) por{" "}
        <Termo chave="emenda-parlamentar">emendas parlamentares</Termo> ao
        orçamento federal, pelo mês do pagamento, e não o que foi
        empenhado. Não entram os pagamentos a outros favorecidos no
        município, como o governo do estado, entidades e empresas.{" "}
        <strong>Até 2024, parte do dinheiro de emendas era paga ao Banco do
        Brasil, sem o município de destino</strong>; por isso a série desde
        2015, no download desta página, mostra só o que foi pago
        diretamente à prefeitura e não se compara com {emendasM.cheio.ano}.
        Fonte: {emendas.fonte}, arquivo de {dataCurta(emendas.dataArquivo)}.
      </p>
    </section>
  );
}
