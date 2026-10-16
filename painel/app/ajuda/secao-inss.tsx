import Link from "next/link";
import { gruposComPagina } from "../../lib/inss";
import type { Contexto } from "./contexto";

/**
 * Quanto tempo o INSS está levando.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoInss({ ctx }: { ctx: Contexto }) {
  const { inss, estilos } = ctx;
  // A porta de entrada das páginas do INSS: sem ela, as dez páginas
  // ficariam órfãs, sem nenhum link interno, e o rastreador só as acharia
  // pelo sitemap. E é aqui que se explica a diferença entre as duas
  // medidas, que cada página repete em uma frase.
  return (
    <section className={estilos.bloco} id="inss">
      <h2>Quanto tempo o INSS está levando</h2>
      <p>
        O INSS publica, todo mês, os pedidos que ainda esperam resposta e os
        que foram negados. Com eles dá para medir{" "}
        <strong>duas coisas diferentes</strong>, e as páginas nunca as
        misturam:
      </p>
      <ul>
        <li>
          <strong>Há quanto tempo esperam os pedidos ainda sem resposta</strong>{" "}
          numa data. Não é &ldquo;quanto demora&rdquo;: quem foi atendido
          rápido já saiu da fila, e quem fica é quem está esperando mais.
        </li>
        <li>
          <strong>Quanto tempo levou para chegar o &ldquo;não&rdquo;</strong>,
          para quem teve o pedido negado no mês. É o único tempo até a decisão
          que os dados abertos permitem medir: os de benefícios concedidos não
          trazem a data do pedido.
        </li>
      </ul>
      <p>Por tipo de benefício:</p>
      <ul>
        {gruposComPagina(inss).map((g) => (
          <li key={g.chave}>
            <Link href={`/inss/${g.chave}/`} prefetch={false}>
              {g.nomePopular.charAt(0).toUpperCase() + g.nomePopular.slice(1)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
