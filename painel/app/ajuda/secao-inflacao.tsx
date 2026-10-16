import type { Contexto } from "./contexto";

/**
 * Os valores estão corrigidos pela inflação?
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoInflacao({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  return (
    <section className={estilos.bloco} id="inflacao">
      <h2>Os valores estão corrigidos pela inflação?</h2>
      <p>
        <strong>Não.</strong> Todos os valores em reais são{" "}
        <strong>nominais</strong>, exatamente como foram declarados. Quando a
        página diz que o gasto de um município cresceu 13% de um ano para o
        outro, parte disso é inflação.
      </p>
      <p>
        Deflacionar exigiria escolher um índice e uma data-base, e essa
        escolha muda o resultado. Preferimos publicar o número declarado e
        dizer claramente o que ele é.
      </p>
    </section>
  );
}
