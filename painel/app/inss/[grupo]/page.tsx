import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { br, descricaoDe as comCauda } from "../../../lib/dados";
import {
  dataBr, dias, grupoPorChave, gruposComPagina, mesPorExtenso, pct, tendencia,
  type GrupoInss, type SnapshotInss,
} from "../../../lib/inss";
import { catalogoDe, trilha } from "../../../lib/jsonld";
import { cartaoSocial, lerInss, SITE } from "../../../lib/servidor";
import estilos from "./inss.module.css";

/**
 * "Quanto o INSS está demorando", por grupo de benefício.
 *
 * A pergunta vem do usuário, que foi ao Meu INSS e não achou em lugar nenhum
 * quanto um pedido costuma demorar (§8 da especificação). Por isso a página
 * responde PRIMEIRO, em linguagem simples, e só depois explica.
 *
 * Três regras da especificação (§8, §10 e §11) que o texto não pode quebrar:
 * 1. A fila mede há quanto tempo esperam os pedidos AINDA sem decisão — não
 *    "quanto demora". O tempo até a decisão só existe para os negados.
 * 2. O prazo de 30 a 90 dias é de um acordo no STF (2021) com vigência de dois
 *    anos: referência datada, nunca "o INSS está descumprindo a lei".
 * 3. Nos grupos com perícia, esse prazo só começa depois dela; a espera da
 *    fila não se compara com ele, e a página diz isso em vez de comparar.
 */

type Params = { params: Promise<{ grupo: string }> };

export async function generateStaticParams() {
  const s = await lerInss();
  return gruposComPagina(s).map((g) => ({ grupo: g.chave }));
}

export const dynamicParams = false;

function inicialMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** O título da página, na tela. */
function tituloDe(g: GrupoInss): string {
  return `${inicialMaiuscula(g.nomePopular)}: quanto tempo o INSS está levando`;
}

/**
 * O `<title>`, que o Google corta perto de 60 caracteres: "quanto demora" é a
 * forma que se busca, e "no INSS" entra só quando cabe — a auditoria reprovou
 * o título longo em "aposentadoria por tempo de contribuição" (73).
 */
function tituloDeBusca(g: GrupoInss): string {
  const base = `${inicialMaiuscula(g.nomePopular)}: quanto demora`;
  return `${base} no INSS`.length <= 60 ? `${base} no INSS` : base;
}

function descricaoDe(g: GrupoInss, s: SnapshotInss): string {
  const f = g.fila!;
  // A cauda cede primeiro quando não cabe (`descricaoDe` em lib/dados.ts).
  return comCauda(
    `Em ${dataBr(s.fila!.referencia)}, metade dos ${br(f.n)} pedidos de ` +
    `${g.nomePopular} em espera aguardava havia mais de ${dias(f.mediana)}.`,
    "Dados abertos do INSS, mês a mês.");
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { grupo } = await params;
  const s = await lerInss();
  const g = grupoPorChave(s, grupo);
  if (!g?.fila || !s.fila) return {};
  const caminho = `/inss/${g.chave}/`;
  const titulo = tituloDeBusca(g);
  const descricao = descricaoDe(g, s);
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: `${SITE}${caminho}` },
    ...cartaoSocial(titulo, descricao, caminho),
  };
}

export default async function Pagina({ params }: Params) {
  const { grupo } = await params;
  const s = await lerInss();
  const g = grupoPorChave(s, grupo);
  if (!g?.fila?.publicavel || !s.fila) notFound();
  const f = g.fila;
  const ref = dataBr(s.fila.referencia);
  const neg = g.negados?.publicavel && s.negados ? g.negados : null;
  const caminho = `/inss/${g.chave}/`;
  const nome = g.nomePopular;
  const servicosVisiveis = f.porServico.filter((x) => x.publicavel);
  const foraDaTabela = f.porServico.filter((x) => !x.publicavel)
    .reduce((soma, x) => soma + x.n, 0);
  const clientelas = neg
    ? (["urbano", "rural"] as const).map((c) => [c, neg.porClientela[c]] as const)
    : [];
  const mostraClientela = clientelas.length === 2 && clientelas.every(([, r]) => r?.publicavel);
  const frase = tendencia(g, s);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: tituloDe(g),
    description: descricaoDe(g, s) +
      " Idade da fila de pedidos pendentes e dias do pedido à negativa, " +
      "calculados a partir dos arquivos de dados abertos do INSS.",
    url: `${SITE}${caminho}`,
    isAccessibleForFree: true,
    isBasedOn: s.fonte.url,
    inLanguage: "pt-BR",
    creator: { "@type": "Person", name: "Peter Wilhelm Kretzschmar" },
    temporalCoverage: s.fila.mes + (s.negados ? `/${s.negados.mes}` : ""),
    variableMeasured: [
      "Dias de espera dos pedidos pendentes",
      ...(neg ? ["Dias do pedido ao indeferimento"] : []),
    ],
    includedInDataCatalog: catalogoDe(SITE),
    spatialCoverage: { "@type": "Place", name: "Brasil" },
  };

  return (
    <main className={estilos.pagina} id="conteudo">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            ...trilha(SITE, [
              { nome: "Números Públicos", caminho: "/" },
              { nome: inicialMaiuscula(nome), caminho },
            ]),
          }),
        }}
      />
      <nav className={estilos.trilha} aria-label="Você está em">
        <Link href="/" prefetch={false}>Números Públicos</Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{inicialMaiuscula(nome)}</span>
      </nav>

      <h1 className={estilos.titulo}>{tituloDe(g)}</h1>
      {g.nome.toLowerCase() !== nome.toLowerCase() && (
        <p className={estilos.oficial}>Nome oficial no INSS: {g.nome}.</p>
      )}

      {/* A resposta vem antes de tudo: é a pergunta que o Meu INSS deixa sem
          resposta, e quem chega aqui quer o número, não a explicação. */}
      <section className={estilos.resposta} aria-label="A resposta curta">
        <p>
          Em <strong>{ref}</strong>, havia <strong>{br(f.n)}</strong> pedidos
          de {nome} esperando resposta do INSS.{" "}
          <strong>Metade deles esperava havia mais de {dias(f.mediana)}</strong>,
          e {pct(f.acima90)} esperavam havia mais de 90 dias.
        </p>
        {neg && s.negados && (
          <p>
            Dos pedidos <strong>negados</strong> em {mesPorExtenso(s.negados.mes)},
            metade recebeu o &ldquo;não&rdquo; em até{" "}
            <strong>{dias(neg.mediana)}</strong> depois do pedido.
          </p>
        )}
      </section>

      <div className={estilos.grade}>
        <div className={estilos.cartao}>
          <span className={estilos.rotulo}>Pedidos em espera em {ref}</span>
          <span className={`${estilos.valor} tabular`}>{br(f.n)}</span>
        </div>
        <div className={estilos.cartao}>
          <span className={estilos.rotulo}>Metade espera há mais de</span>
          <span className={`${estilos.valor} tabular`}>{dias(f.mediana)}</span>
        </div>
        <div className={estilos.cartao}>
          <span className={estilos.rotulo}>Esperando há mais de 90 dias</span>
          <span className={`${estilos.valor} tabular`}>{pct(f.acima90)}</span>
        </div>
        {neg && s.negados && (
          <div className={estilos.cartao}>
            <span className={estilos.rotulo}>
              Negados em {mesPorExtenso(s.negados.mes)}: metade em até
            </span>
            <span className={`${estilos.valor} tabular`}>{dias(neg.mediana)}</span>
          </div>
        )}
      </div>

      {frase && <p className={estilos.ressalva}>{frase}</p>}

      <section className={estilos.texto}>
        <h2>E o prazo?</h2>
        {g.prazoAcordo === null ? (
          <p>
            O {nome} não tem prazo próprio no acordo sobre prazos que o INSS
            assinou no Supremo Tribunal Federal em 2021.
          </p>
        ) : g.prazoContaDoPedido ? (
          <p>
            Em 2021, num acordo homologado pelo Supremo Tribunal Federal, o INSS
            se comprometeu a decidir pedidos de {nome} em até{" "}
            <strong>{g.prazoAcordo} dias</strong>, contados do pedido.{" "}
            {f.acimaDoPrazo !== null && (
              <>
                <strong>
                  {pct(f.acimaDoPrazo)} dos pedidos em espera já passaram desse
                  tempo.
                </strong>{" "}
              </>
            )}
            Quando o INSS pede documentos ao segurado, a contagem fica suspensa,
            e os dados abertos não dizem quais pedidos estão nessa situação.
          </p>
        ) : (
          <p>
            Em 2021, num acordo homologado pelo Supremo Tribunal Federal, o INSS
            se comprometeu a decidir pedidos de {nome} em até{" "}
            <strong>{g.prazoAcordo} dias</strong> — mas contados só{" "}
            <strong>depois da perícia</strong> (e da avaliação social, quando
            exigida), que tem até 45 dias depois de agendada. Os dados abertos
            não dizem quando a perícia foi feita, então a espera acima, que
            inclui o tempo até ela, <strong>não se compara diretamente</strong>{" "}
            com esse prazo.
          </p>
        )}
        {g.prazoAcordo !== null && (
          <p className={estilos.ressalva}>
            O acordo (Recurso Extraordinário 1.171.152, Tema 1066) tinha
            vigência de dois anos, e não encontramos renovação. O que está em
            lei é o prazo do primeiro pagamento: até 45 dias depois de o
            segurado entregar toda a documentação (Lei 8.213/1991, art. 41-A,
            §5º).
          </p>
        )}
      </section>

      {servicosVisiveis.length > 1 && (
        <section className={estilos.texto}>
          <h2>Por tipo de pedido</h2>
          <div className={estilos.rolagem}>
            <table className={estilos.lista}>
              <caption>
                Pedidos de {nome} em espera em {ref}, por serviço do INSS.
                {foraDaTabela > 0 &&
                  ` Mais ${br(foraDaTabela)} pedidos em serviços com menos de ` +
                  `${br(s.minimoPedidos)} pedidos, somados acima e não listados.`}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Serviço</th>
                  <th scope="col" className={estilos.num}>Em espera</th>
                  <th scope="col" className={estilos.num}>Metade espera há mais de</th>
                  <th scope="col" className={estilos.num}>Há mais de 45 dias</th>
                </tr>
              </thead>
              <tbody>
                {servicosVisiveis.map((x) => (
                  <tr key={x.codigo}>
                    <th scope="row">{x.nome}</th>
                    <td className={`${estilos.num} tabular`}>{br(x.n)}</td>
                    <td className={`${estilos.num} tabular`}>{dias(x.mediana)}</td>
                    <td className={`${estilos.num} tabular`}>{pct(x.acima45)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mostraClientela && s.negados && (
        <section className={estilos.texto}>
          <h2>Negados: cidade e campo</h2>
          <div className={estilos.rolagem}>
            <table className={estilos.lista}>
              <caption>
                Pedidos de {nome} negados em {mesPorExtenso(s.negados.mes)}, pela
                clientela que o INSS registra.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Clientela</th>
                  <th scope="col" className={estilos.num}>Negados</th>
                  <th scope="col" className={estilos.num}>Metade em até</th>
                </tr>
              </thead>
              <tbody>
                {clientelas.map(([c, r]) => r && (
                  <tr key={c}>
                    <th scope="row">{c === "urbano" ? "Urbana" : "Rural"}</th>
                    <td className={`${estilos.num} tabular`}>{br(r.n)}</td>
                    <td className={`${estilos.num} tabular`}>{dias(r.mediana)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className={estilos.texto}>
        <h2>O que estes números não dizem</h2>
        <ul className={estilos.ressalvas}>
          <li>
            <strong>Quanto se espera até o &ldquo;sim&rdquo;.</strong> Os dados
            abertos de benefícios concedidos não trazem a data do pedido; o
            único tempo até a decisão que dá para medir é o dos negados.
          </li>
          <li>
            <strong>Quanto o seu pedido vai demorar.</strong> A espera acima é
            de todos os pedidos juntos. Para acompanhar o seu, o caminho é o
            Meu INSS, em &ldquo;Consultar pedidos&rdquo;.
          </li>
          <li>
            <strong>Pedidos com poucos casos.</strong> Recortes com menos de{" "}
            {br(s.minimoPedidos)} pedidos não aparecem: abaixo disso, a mediana
            oscila ao acaso de um mês para o outro.
          </li>
        </ul>
      </section>

      <section className={estilos.texto}>
        <p className={estilos.ressalva}>
          Fonte:{" "}
          <a href={s.fonte.url}>{s.fonte.nome}</a> — requerimentos pendentes
          de {mesPorExtenso(s.fila.mes)} (licença Creative Commons Atribuição)
          {/* Só cita os indeferidos quando a página os mostra: fonte listada
              e não usada é afirmação sobre um número que não está aqui. */}
          {neg && s.negados && (
            <> e benefícios indeferidos de {mesPorExtenso(s.negados.mes)} (o
            portal não declara licença para este conjunto)</>
          )}. A espera de cada pedido é contada da criação da tarefa até{" "}
          {ref}.{" "}
          <Link href="/ajuda/#inss" prefetch={false}>Como ler estes números</Link>
        </p>
      </section>
    </main>
  );
}
