import Link from "next/link";
import ComoLer from "../../componentes/como-ler";
import Compartilhar from "../../componentes/compartilhar";
import { br, dataPorExtenso } from "../../../lib/dados";
import { slugUf } from "../../../lib/estado";
import { trilha } from "../../../lib/jsonld";
import { SITE } from "../../../lib/servidor";
import type { Contexto } from "./contexto";

/**
 * A etiqueta de dados estruturados, a trilha e o cabeçalho da página.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function Cabecalho({ c }: { c: Contexto }) {
  const { r, atualizado, de, jsonLd, estilos } = c;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* A trilha, num bloco separado de proposito: o `Dataset` acima ja
          funciona e a auditoria o confere: acrescentar um `@graph` mexeria na
          forma dele para ganhar nada. O Google aceita varios blocos. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: r.uf.nome, caminho: `/estado/${slugUf(r.uf.sigla)}/` },
            ]),
          }),
        }}
      />

      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{r.uf.nome}</span>
      </nav>

      <header>
        <h1 className={estilos.titulo}>
          {r.uf.nome} <span className={estilos.uf}>{r.uf.sigla}</span>
        </h1>
        <p className={estilos.chamada}>
          {r.uf.municipios === 1 ? "O" : "Os"}{" "}
          <strong>
            {r.uf.municipios === 1
              ? "município"
              : `${br(r.uf.municipios)} municípios`}
          </strong>{" "}
          {de}, com
          população, PIB, gasto com pessoal e despesa por função — cada número
          com a sua fonte ao lado.
        </p>
        {/* Mesma data e mesma função do sitemap; ver a página do município. */}
        <p className={estilos.atualizado}>
          Dados atualizados em{" "}
          <time dateTime={atualizado.toISOString()}>{dataPorExtenso(atualizado)}</time>.
        </p>
        <Compartilhar />
        <ComoLer tipo="estado" />
      </header>
    </>
  );
}
