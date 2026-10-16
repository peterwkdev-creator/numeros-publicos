import Link from "next/link";
import type { Contexto } from "./contexto";

/**
 * Emprego com carteira: o Novo Caged.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoCaged({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  return (
    <section className={estilos.bloco} id="caged">
      <h2>Emprego com carteira: o Novo Caged</h2>
      <p>
        O <strong>Novo Caged</strong>, do Ministério do Trabalho e Emprego,
        registra cada contratação e cada desligamento com carteira assinada,
        mês a mês, no município da empresa. A página mostra os últimos 12
        meses.
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>Saldo</strong> é admissões menos desligamentos. Positivo,
          abriram-se mais vagas com carteira do que se fecharam; negativo, o
          contrário.
        </li>
        <li>
          <strong>Só emprego celetista</strong>, sob a CLT. Servidor
          estatutário, quem trabalha por conta própria e quem trabalha sem
          carteira não entram.
        </li>
        <li>
          <strong>Um mês sozinho engana.</strong> Safra, comércio de fim de
          ano e obra pública mudam o saldo de um mês para o outro; os 12
          meses juntos dizem mais.
        </li>
      </ul>
      <p>
        <Link href="/ranking/emprego-com-carteira/" prefetch={false}>
          O ranking do emprego com carteira
        </Link>{" "}
        põe os municípios lado a lado: os maiores e os menores saldos dos 12
        meses, e o saldo por mil habitantes nas cidades de 100 mil
        habitantes ou mais.
      </p>
    </section>
  );
}
