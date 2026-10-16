import Link from "next/link";
import type { Contexto } from "./contexto";

/**
 * Como ler o ranking do gasto com pessoal.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoRanking({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  return (
    <section className={estilos.bloco} id="ranking">
      <h2>Como ler o ranking do gasto com pessoal</h2>
      <p>
        <Link href="/ranking/gasto-com-pessoal/" prefetch={false}>
          O ranking
        </Link>{" "}
        lista os municípios cujo gasto com pessoal declarado passou do{" "}
        <a href="#pessoal">teto legal</a> do Executivo municipal, do maior
        para o menor.
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>Sem o relatório, o município não está na lista</strong> —
          e ficar fora não quer dizer estar dentro do limite.
        </li>
        <li>
          <strong>As declarações implausíveis</strong> ficam numa lista à
          parte, abaixo: nem escondidas, nem misturadas à conta (veja{" "}
          <a href="#implausivel">valor implausível</a>).
        </li>
        <li>
          O filtro acima da tabela mostra só os municípios de um estado, e o
          nome de cada um leva à página dele.
        </li>
      </ul>
    </section>
  );
}
