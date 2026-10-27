import type { Metadata } from "next";
import Link from "next/link";

import { br, descricaoDe as comCauda } from "../../lib/dados";
import { dataBr, dias, gruposComPagina, mesPorExtenso, pct } from "../../lib/inss";
import { trilha, jsonLdHtml } from "../../lib/jsonld";
import { cartaoSocial, lerInss, SITE } from "../../lib/servidor";
import estilos from "./[grupo]/inss.module.css";

/**
 * O índice das páginas do INSS: os grupos de benefício numa tabela só.
 *
 * Criado em 11/10/2026. Até ali as páginas de benefício eram quase órfãs: só a
 * `/ajuda/` apontava para elas, uma não apontava para a outra, e o Google
 * rebaixa página que só aparece no sitemap. A tabela também responde sozinha a
 * pergunta que o leitor traz de uma página para a outra — "e os outros
 * benefícios, demoram mais?" — sem ele abrir dez páginas.
 *
 * Ordenada pela espera, da maior para a menor, e sem adjetivo: o número e a
 * data dizem o que há para dizer.
 */

const CAMINHO = "/inss/";
const TITULO = "Quanto o INSS está demorando, por benefício";

export async function generateMetadata(): Promise<Metadata> {
  const s = await lerInss();
  if (!s.fila) return {};
  const descricao = comCauda(
    `Pedidos em espera no INSS em ${dataBr(s.fila.referencia)}, por tipo de ` +
    "benefício: quantos são e há quanto tempo esperam.",
    "Dados abertos do INSS, mês a mês.");
  return {
    title: TITULO,
    description: descricao,
    alternates: { canonical: `${SITE}${CAMINHO}` },
    ...cartaoSocial(TITULO, descricao, CAMINHO),
  };
}

export default async function IndiceInss() {
  const s = await lerInss();
  const grupos = gruposComPagina(s)
    .sort((a, b) => (b.fila?.mediana ?? 0) - (a.fila?.mediana ?? 0));
  if (!s.fila || !grupos.length) return null;
  const ref = dataBr(s.fila.referencia);

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: "INSS", caminho: CAMINHO },
            ]),
          }),
        }}
      />
      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">INSS</span>
      </nav>

      <h1 className={estilos.titulo}>{TITULO}</h1>

      <section className={estilos.resposta} aria-label="A resposta curta">
        <p>
          Em <strong>{ref}</strong>, estes eram os pedidos esperando resposta
          do INSS, por tipo de benefício. A coluna do meio,{" "}
          <strong>metade espera há mais de</strong>, é o meio da fila: metade dos pedidos esperava havia
          mais do que isso. Clique no benefício para ver o detalhe.
        </p>
      </section>

      <section className={estilos.texto}>
        <div className={`${estilos.rolagem} rola-x`}>
          <table className={estilos.lista}>
            <caption>
              Pedidos em espera no INSS em {ref}, do benefício em que metade espera
              há mais tempo para o de menos.
            </caption>
            <thead>
              <tr>
                <th scope="col">Benefício</th>
                <th scope="col" className={estilos.num}>Pedidos em espera</th>
                <th scope="col" className={estilos.num}>Metade espera há mais de</th>
                <th scope="col" className={estilos.num}>Há mais de 90 dias (% dos pedidos)</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.chave}>
                  <th scope="row">
                    <Link href={`/inss/${g.chave}/`} prefetch={false}>
                      {g.nomePopular.charAt(0).toUpperCase() + g.nomePopular.slice(1)}
                    </Link>
                  </th>
                  <td className={`${estilos.num} tabular`}>{br(g.fila!.n)}</td>
                  <td className={`${estilos.num} tabular`}>{dias(g.fila!.mediana)}</td>
                  <td className={`${estilos.num} tabular`}>{pct(g.fila!.acima90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={estilos.texto}>
        <p className={estilos.ressalva}>
          A espera é a dos pedidos <strong>ainda sem decisão</strong>, contada
          da criação do pedido até {ref}; não é o tempo que um pedido leva até
          ser decidido. Benefícios com poucos pedidos não aparecem. Fonte:{" "}
          <a href={s.fonte.url}>{s.fonte.nome}</a> — requerimentos pendentes de{" "}
          {mesPorExtenso(s.fila.mes)}.{" "}
          <Link href="/ajuda/#inss" prefetch={false}>Como ler estes números</Link>
        </p>
      </section>
    </main>
  );
}
