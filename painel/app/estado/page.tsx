import type { Metadata } from "next";
import Link from "next/link";

import { br, descricaoDe as comCauda } from "../../lib/dados";
import type { UF } from "../../lib/dados";
import { slugUf } from "../../lib/estado";
import { trilha, jsonLdHtml } from "../../lib/jsonld";
import { cartaoSocial, lerSnapshot, SITE } from "../../lib/servidor";
import estilos from "../inss/[grupo]/inss.module.css";

/**
 * O índice dos estados: as 27 unidades da federação, por região.
 *
 * Criado em 17/10/2026. Até ali `/estado/` dava 404: quem apaga o fim do
 * endereço de um estado caía numa página de erro. A ordem das regiões e dos
 * estados é a do snapshot do IBGE (pelo código), e não alfabética, a mesma do
 * resto do site.
 */

const CAMINHO = "/estado/";
const TITULO = "Os estados e o Distrito Federal";

export async function generateMetadata(): Promise<Metadata> {
  const snapshot = await lerSnapshot();
  const descricao = comCauda(
    `As ${br(snapshot.ufs.length)} unidades da federação, por região, com o ` +
    "número de municípios de cada uma.",
    "Cada estado tem a sua página, com os municípios dele.");
  return {
    title: TITULO,
    description: descricao,
    alternates: { canonical: `${SITE}${CAMINHO}` },
    ...cartaoSocial(TITULO, descricao, CAMINHO),
  };
}

export default async function IndiceEstados() {
  const snapshot = await lerSnapshot();
  const regioes = new Map<string, UF[]>();
  for (const u of snapshot.ufs) {
    regioes.set(u.regiao, [...(regioes.get(u.regiao) ?? []), u]);
  }

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: "Estados", caminho: CAMINHO },
            ]),
          }),
        }}
      />
      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">Estados</span>
      </nav>

      <h1 className={estilos.titulo}>{TITULO}</h1>

      <section className={estilos.resposta} aria-label="A resposta curta">
        <p>
          As <strong>{br(snapshot.ufs.length)}</strong> unidades da federação,
          com <strong>{br(snapshot.municipios.length)}</strong> municípios ao
          todo. A página de cada estado soma os municípios dele e leva à página
          de cada um.
        </p>
      </section>

      {[...regioes].map(([regiao, ufs]) => (
        <section className={estilos.texto} key={regiao}>
          <h2>{regiao}</h2>
          <div className={`${estilos.rolagem} rola-x`}>
            <table className={estilos.lista}>
              <caption className="so-leitor">
                Estados da região {regiao} e o número de municípios de cada um.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Estado</th>
                  <th scope="col" className={estilos.num}>Municípios</th>
                </tr>
              </thead>
              <tbody>
                {ufs.map((u) => (
                  <tr key={u.sigla}>
                    <th scope="row">
                      <Link href={`/estado/${slugUf(u.sigla)}/`} prefetch={false}>
                        {u.nome}
                      </Link>
                    </th>
                    <td className={`${estilos.num} tabular`}>{br(u.municipios)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
