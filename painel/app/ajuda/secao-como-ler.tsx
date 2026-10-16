import Link from "next/link";
import { ListaComoLer } from "../componentes/como-ler";
import type { Contexto } from "./contexto";

/**
 * Como ler as páginas: o roteiro de cada tipo de página.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoComoLer({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  // O roteiro de cada tipo de página, o mesmo texto do "Como ler esta
  // página" que fica fechado abaixo do título delas (`lib/como-ler.ts`).
  return (
    <section className={estilos.bloco} id="como-ler">
      <h2>Como ler as páginas</h2>
      <p>
        Logo abaixo do título de cada página há um quadro fechado, “Como ler
        esta página”. O que ele diz está reunido aqui.
      </p>
      <h3 className={estilos.subtitulo}>A página de um município</h3>
      <ListaComoLer tipo="municipio" naAjuda />
      <h3 className={estilos.subtitulo}>A página de um estado</h3>
      <ListaComoLer tipo="estado" naAjuda />
      <h3 className={estilos.subtitulo}>
        <Link href="/brasil/" prefetch={false}>O Brasil ao longo do tempo</Link>
      </h3>
      <ListaComoLer tipo="brasil" naAjuda />
      <h3 className={estilos.subtitulo}>
        <Link href="/ranking/gasto-com-pessoal/" prefetch={false}>
          O ranking do gasto com pessoal
        </Link>
      </h3>
      <ListaComoLer tipo="ranking" naAjuda />
      <h3 className={estilos.subtitulo}>
        <Link href="/ranking/emprego-com-carteira/" prefetch={false}>
          O ranking do emprego com carteira
        </Link>
      </h3>
      <ListaComoLer tipo="rankingEmprego" naAjuda />
    </section>
  );
}
