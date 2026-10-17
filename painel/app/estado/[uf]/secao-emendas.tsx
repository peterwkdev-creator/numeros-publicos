import Termo from "../../componentes/termo";
import { br, concorda, dataCurta, escalaComSinal, fracaoDe, maiuscula } from "../../../lib/dados";
import { mesDeCorte } from "../../../lib/emendas";
import type { Contexto } from "./contexto";

/**
 * As emendas parlamentares pagas às prefeituras do estado.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoEmendas({ c }: { c: Contexto }) {
  const { emendas, r, de, emendasUf, anoEstimada, emendasPh, phMunicipios, medianaPh, estilos } = c;
  if (!(emendasUf.comPagamento > 0 && emendasUf.cheio.reais !== null)) return null;
  return (
    <section className={estilos.texto} id="emendas">
      <h2>Emendas parlamentares pagas aos municípios {de}</h2>
      <p>
        Em {emendasUf.cheio.ano}, as prefeituras e os fundos municipais {de}{" "}
        receberam{" "}
        <strong title={escalaComSinal(emendasUf.cheio.reais).exato}>
          {escalaComSinal(emendasUf.cheio.reais).curto}
        </strong>{" "}
        em pagamentos de{" "}
        <Termo chave="emenda-parlamentar">emendas parlamentares</Termo>
        {emendasPh !== null && (
          <>
            : <strong>{"R$ "}{br(emendasPh, 2)}</strong> por habitante do
            estado, pela população estimada de {anoEstimada}
          </>
        )}
        . <strong>{maiuscula(fracaoDe(emendasUf.comPagamento, r.uf.municipios))}</strong>{" "}
        {concorda(emendasUf.comPagamento, r.uf.municipios, "teve", "tiveram")}{" "}
        algum pagamento no ano.
        {emendasUf.parcial && (
          emendasUf.parcial.reais === null ? (
            <>
              {" "}Em {emendasUf.parcial.ano}, até {mesDeCorte(emendas.ultimoMes)},
              nenhum pagamento foi registrado.
            </>
          ) : (
            <>
              {" "}Em {emendasUf.parcial.ano}, até {mesDeCorte(emendas.ultimoMes)},
              o saldo é de{" "}
              <strong title={escalaComSinal(emendasUf.parcial.reais).exato}>
                {escalaComSinal(emendasUf.parcial.reais).curto}
              </strong>.
            </>
          )
        )}
      </p>
      {medianaPh !== null && (
        <p>
          Município a município, a{" "}
          <Termo chave="mediana">mediana</Termo> é de{" "}
          <strong>{"R$ "}{br(medianaPh, 2)}</strong> por habitante em{" "}
          {emendasUf.cheio.ano}: metade dos {br(phMunicipios.length)} que
          tiveram pagamento recebeu menos que isso, metade mais. A página de
          cada município mostra o valor dele contra esta mediana, e a divisão
          por tipo de emenda.
        </p>
      )}
      <p className={estilos.ressalva}>
        Conta o que a União <strong>pagou</strong> às prefeituras e aos
        fundos municipais (como o de saúde), pelo mês do pagamento, e não o
        que foi empenhado. Não entram os pagamentos ao próprio governo do
        estado, a entidades e a empresas.{" "}
        <strong>Até 2024, parte do dinheiro de emendas era paga ao Banco do
        Brasil, sem o município de destino</strong>; por isso os anos
        anteriores não se comparam com {emendasUf.cheio.ano}. Fonte:{" "}
        {emendas.fonte}, arquivo de {dataCurta(emendas.dataArquivo)}.
      </p>
    </section>
  );
}
