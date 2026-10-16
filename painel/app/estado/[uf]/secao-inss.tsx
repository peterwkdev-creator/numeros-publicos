import Link from "next/link";
import { br } from "../../../lib/dados";
import { emContracao } from "../../../lib/estado";
import { dataBr, dias, mesPorExtenso, pct } from "../../../lib/inss";
import type { Contexto } from "./contexto";

/**
 * Os pedidos ao INSS nas agências do estado, benefício a benefício.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoInss({ c }: { c: Contexto }) {
  const { inss, de, inssUf, esperaUf, estilos } = c;
  if (!(inssUf.length > 0 && inss.fila)) return null;
  return (
    <section className={estilos.texto} id="inss">
      <h2>Pedidos ao INSS {emContracao(de)}</h2>
      <p>
        Do Portal de Dados Abertos do INSS. Em{" "}
        <strong>{dataBr(inss.fila.referencia)}</strong>, as agências {de}{" "}
        tinham <strong>{br(esperaUf)}</strong> pedidos esperando decisão nos
        benefícios abaixo. A <strong>espera típica</strong> é o meio da
        fila: metade dos pedidos esperava havia mais do que isso. Ao lado,
        a mesma conta no país, e quanto tempo levaram as negativas.
      </p>
      <div className={`${estilos.rolagem} rola-x`}>
        <table className={estilos.lista}>
          <caption>
            Pedidos ao INSS {emContracao(de)}, por benefício: a fila em{" "}
            {dataBr(inss.fila.referencia)}
            {inss.negados && <> e as negativas de {mesPorExtenso(inss.negados.mes)}</>}
          </caption>
          <thead>
            <tr>
              <th scope="col">Benefício</th>
              <th scope="col" className={estilos.num}>Pedidos em espera</th>
              <th scope="col" className={estilos.num}>Metade espera há mais de</th>
              <th scope="col" className={estilos.num}>No país</th>
              <th scope="col" className={estilos.num}>Há mais de 90 dias (% dos pedidos)</th>
              <th scope="col" className={estilos.num}>Metade negada em até</th>
            </tr>
          </thead>
          <tbody>
            {inssUf.map(({ grupo, fila, negados }) => (
              <tr key={grupo.chave}>
                <th scope="row">
                  <Link href={`/inss/${grupo.chave}/`} prefetch={false}>
                    {grupo.nomePopular.charAt(0).toUpperCase() +
                      grupo.nomePopular.slice(1)}
                  </Link>
                </th>
                <td>{fila ? br(fila.n) : "—"}</td>
                <td>
                  {fila ? dias(fila.mediana) : "—"}
                </td>
                <td>{dias(grupo.fila!.mediana)}</td>
                <td>{fila ? pct(fila.acima90) : "—"}</td>
                <td>
                  {negados ? dias(negados.mediana) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={estilos.ressalva}>
        A espera é a dos pedidos <strong>ainda sem decisão</strong>, contada
        da criação do pedido até {dataBr(inss.fila.referencia)}; não é o
        tempo até a decisão. A negativa conta do pedido ao &ldquo;não&rdquo;.
        O estado é o da agência onde o pedido foi criado, na fila, e o da
        que negou, nas negativas
        {inss.negados && (
          <>
            : as {br(inss.negados.foraDasUfs.n)} negativas de{" "}
            {mesPorExtenso(inss.negados.mes)} decididas pela agência de
            automação do INSS, que atende o país inteiro (
            {pct(inss.negados.foraDasUfs.n / inss.negados.foraDasUfs.total)}{" "}
            do total), entram no país e em nenhum estado
          </>
        )}
        . Travessão: menos de {br(inss.minimoPedidos)} pedidos no estado,
        poucos para publicar. Fonte:{" "}
        <a href={inss.fonte.url}>{inss.fonte.nome}</a>.{" "}
        <Link href="/ajuda/#inss" prefetch={false}>Como ler estes números</Link>
      </p>
    </section>
  );
}
