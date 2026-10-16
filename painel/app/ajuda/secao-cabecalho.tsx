import Link from "next/link";
import { trilha } from "../../lib/jsonld";
import { SITE } from "../../lib/servidor";
import type { Contexto } from "./contexto";

/**
 * A etiqueta de dados estruturados, a trilha e o cabeçalho da página.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function Cabecalho({ ctx }: { ctx: Contexto }) {
  const { jsonLd, estilos } = ctx;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* A trilha, num bloco separado de proposito: o no acima ja funciona e a
          auditoria o confere; acrescentar um `@graph` mexeria na forma dele
          para ganhar nada. O Google aceita varios blocos por pagina. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: "Ajuda", caminho: "/ajuda/" },
            ]),
          }),
        }}
      />
      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">Ajuda</span>
      </nav>

      <header>
        <h1 className={estilos.titulo}>Ajuda</h1>
        <p className={estilos.chamada}>
          Este site publica números que os próprios municípios e o IBGE
          declararam. Alguns deles têm nomes técnicos que não se explicam
          sozinhos. Abaixo está o que cada um significa — e, quando a resposta
          não estiver aqui, para onde ir.
        </p>
      </header>
    </>
  );
}
