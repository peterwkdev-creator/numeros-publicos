import type { Metadata } from "next";
import Link from "next/link";

import { br, descricaoDe as comCauda } from "../../lib/dados";
import { competenciaCurta } from "../../lib/caged";
import { nomeQuadrimestre } from "../../lib/fiscal";
import { trilha, jsonLdHtml } from "../../lib/jsonld";
import { rankingCache } from "../../lib/nacional";
import { cartaoSocial, lerCaged, lerFiscal, lerSnapshot, SITE } from "../../lib/servidor";
import estilos from "../inss/[grupo]/inss.module.css";

/**
 * O índice dos rankings nacionais.
 *
 * Criado em 17/10/2026. Até ali `/ranking/` dava 404 (quem apaga o fim do
 * endereço de um ranking cai aqui), e o "Rankings" da barra do topo apontava
 * para uma âncora da capa. Cada item diz o que a lista mede, de que período e
 * de que fonte; o número de cada um fica na página dele.
 */

const CAMINHO = "/ranking/";
const TITULO = "Rankings dos municípios";

export async function generateMetadata(): Promise<Metadata> {
  const descricao = comCauda(
    "Listas nacionais dos municípios: gasto com pessoal acima do teto da " +
    "LRF e saldo de empregos com carteira.",
    "Com a fonte e a data de coleta de cada uma.");
  return {
    title: TITULO,
    description: descricao,
    alternates: { canonical: `${SITE}${CAMINHO}` },
    ...cartaoSocial(TITULO, descricao, CAMINHO),
  };
}

export default async function IndiceRankings() {
  const [fiscal, snapshot, caged] = await Promise.all([lerFiscal(), lerSnapshot(), lerCaged()]);
  const pessoal = rankingCache(fiscal, snapshot);
  const quadrimestre = nomeQuadrimestre(fiscal.exercicio, fiscal.periodo);
  const deCaged = competenciaCurta(caged.competencias[0]!);
  const ateCaged = competenciaCurta(caged.competencia);

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: "Rankings", caminho: CAMINHO },
            ]),
          }),
        }}
      />
      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">Rankings</span>
      </nav>

      <h1 className={estilos.titulo}>{TITULO}</h1>

      <section className={estilos.resposta} aria-label="A resposta curta">
        <p>
          Listas com todos os municípios do país, para comparar uns com os
          outros. Cada uma diz a fonte, o período e quem fica de fora.
        </p>
      </section>

      <section className={estilos.texto}>
        <h2>
          <Link href="/ranking/gasto-com-pessoal/" prefetch={false}>
            Municípios acima do teto de gasto com pessoal
          </Link>
        </h2>
        <p>
          <strong>{br(pessoal.acimaDoTeto.length)}</strong> municípios
          declararam gasto com pessoal acima do teto de{" "}
          {br(fiscal.limites.legal, 0)}% da receita corrente líquida no{" "}
          {quadrimestre}, entre os {br(pessoal.publicaram)} que entregaram o
          relatório; dos outros {br(pessoal.naoEntregaram)}, não se sabe.
          Fonte: Tesouro Nacional (SICONFI).
        </p>
      </section>

      <section className={estilos.texto}>
        <h2>
          <Link href="/ranking/emprego-com-carteira/" prefetch={false}>
            Onde mais cresceu o emprego com carteira
          </Link>
        </h2>
        <p>
          O saldo de empregos com carteira de {deCaged} a {ateCaged} em cada
          município: quem mais abriu e quem mais fechou empregos com carteira, no total e por
          mil habitantes. Fonte: Novo Caged (Ministério do Trabalho e Emprego).
        </p>
      </section>
    </main>
  );
}
