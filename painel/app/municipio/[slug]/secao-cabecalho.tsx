import Link from "next/link";
import { dataPorExtenso } from "../../../lib/dados";
import { slugUf } from "../../../lib/estado";
import { trilha, jsonLdHtml } from "../../../lib/jsonld";
import { SITE } from "../../../lib/servidor";
import ComoLer from "../../componentes/como-ler";
import Compartilhar from "../../componentes/compartilhar";
import { jsonLdDe } from "./json-ld";
import type { Contexto } from "./contexto";

/**
 * A etiqueta de dados estruturados, a trilha e o cabeçalho da página.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export default function Cabecalho({ c }: { c: Contexto }) {
  const { m, atualizado, uf, abertura, estilos } = c;
  const jsonLd = jsonLdDe(c);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      {/* A trilha, num bloco separado de proposito: o no acima ja funciona e a
          auditoria o confere; acrescentar um `@graph` mexeria na forma dele
          para ganhar nada. O Google aceita varios blocos por pagina. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: uf?.nome ?? m.uf, caminho: `/estado/${slugUf(m.uf)}/` },
              { nome: m.nome, caminho: `/municipio/${m.slug}/` },
            ]),
          }),
        }}
      />

      <nav className={estilos.trilha} aria-label="Você está em">
        {/* `prefetch={false}` no link da capa. Medido em 03/09/2026: o Next
            pré-buscava o payload dela em TODA página — 269 KB, 32% do peso
            total — porque a capa embute os municípios da tabela interativa.
            Pré-busca é conveniência para quem navega dentro do site; quem chega
            de uma busca abre uma página e sai, e paga o download por nada. */}
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        {/* Era um `<span>`: a trilha prometia um nível que não existia. */}
        {/* `prefetch={false}` aqui também, e a razão cresceu com a expansão:
            a página de São Paulo tem 645 municípios listados e 649 KB de
            documento. Pré-buscá-la de cada uma das 645 páginas de município
            paulistas custava 200 KB por página, medidos, para uma navegação
            que quem chega de uma busca quase nunca faz. */}
        <Link href={`/estado/${slugUf(m.uf)}/`} prefetch={false}>
          {uf?.nome ?? m.uf}
        </Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{m.nome}</span>
      </nav>

      <header>
        <h1 className={estilos.titulo}>
          {m.nome} <span className={estilos.uf}>{m.uf}</span>
        </h1>
        {/* O primeiro texto que o buscador lê. Até 30/10/2026 era o mesmo nas
            5.571 páginas; agora abre pelo que distingue o município no estado
            (`lib/abertura.ts`), e a procedência vem depois. */}
        <p className={estilos.chamada}>
          {abertura ? <>{abertura}{" "}</> : null}
          Código IBGE {m.codigo}. Os números abaixo vêm de fontes oficiais — o
          IBGE, o Tesouro Nacional, o INEP, os ministérios da Saúde e do
          Trabalho e a Controladoria-Geral da União —, com a fonte ao lado de
          cada um.
        </p>
        {/* A data que o sitemap anuncia para esta página, com a mesma função:
            quem volta vê de cara se há coisa nova, e a página e o buscador
            não discordam sobre quando ela mudou. A data de cada fonte segue
            na sua seção e no rodapé. */}
        <p className={estilos.atualizado}>
          Dados atualizados em{" "}
          <time dateTime={atualizado.toISOString()}>{dataPorExtenso(atualizado)}</time>.
        </p>
        <Compartilhar />
        <ComoLer tipo="municipio" />
      </header>
    </>
  );
}
