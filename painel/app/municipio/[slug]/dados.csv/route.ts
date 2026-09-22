import { expandir } from "../../../../lib/dados";
import { cabecalhosCsv, paraCsv } from "../../../../lib/csv";
import {
  CODIGO_FAIXA, funcoesDe, indexarFiscal, slugDe,
} from "../../../../lib/fiscal";
import { trajetoriaDe } from "../../../../lib/ideb";
import { lerFiscal, lerIdeb, lerSnapshot } from "../../../../lib/servidor";
import { rotuloDownload } from "../../../../lib/censo";

/**
 * O dado de um município em CSV, para quem quiser conferir ou reusar.
 *
 * A orientação oficial de painéis de dados públicos é explícita: os dados de
 * origem têm de estar disponíveis em formato legível por máquina. Um site que
 * se diz de dados abertos e só deixa **olhar** está pela metade — e o número
 * que ninguém consegue baixar é o número que ninguém consegue contestar.
 *
 * Route handler estático: com `output: "export"` isto vira um arquivo no
 * build, um por município, sem servidor nenhum.
 */
export const dynamic = "force-static";

export async function generateStaticParams() {
  const snapshot = await lerSnapshot();
  return expandir(snapshot).map((m) => ({ slug: slugDe(m.nome, m.uf) }));
}

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const [snapshot, fiscal, ideb, idebFinais] = await Promise.all([
    lerSnapshot(), lerFiscal(), lerIdeb("anos_iniciais"), lerIdeb("anos_finais"),
  ]);
  const m = expandir(snapshot).find((x) => slugDe(x.nome, x.uf) === slug);
  if (!m) return new Response("não encontrado", { status: 404 });

  const serie = fiscal.serie[String(m.codigo)] ?? [];
  const f = indexarFiscal(fiscal).get(m.codigo);

  // Formato longo (uma observação por linha), não largo. É o que permite
  // acrescentar indicador ou período sem mudar o cabeçalho -- e o que qualquer
  // ferramenta de análise espera receber.
  const linhas: (string | number | null)[][] = [];
  const comum = [m.codigo, m.nome, m.uf];

  for (const ind of snapshot.indicadores) {
    // `rotuloDownload` e nao `ind.nome`: o nome vem da VARIAVEL do IBGE, e com
    // classificacao quatro indicadores compartilham a mesma. O CSV saia com
    // quatro linhas "Domicilios particulares permanentes ocupados" e valores
    // diferentes -- indistinguiveis num arquivo que viaja sem a pagina.
    linhas.push([...comum, rotuloDownload(ind.codigo, ind.nome),
                 ind.periodo ?? "", m.valores[ind.codigo] ?? null,
      ind.unidade, "IBGE", ind.coletadoEm ?? ""]);
  }
  // A série JÁ contém o período em destaque. Emitir os dois duplicaria a
  // observação no arquivo -- e observação repetida num CSV vira média errada
  // na planilha de quem baixou, em silêncio.
  for (const [ex, pe, , pct] of serie) {
    linhas.push([...comum, "Despesa com pessoal (% da RCL ajustada)",
      `${ex}/${pe}`, pct, "%", "SICONFI", fiscal.coletadoEm ?? ""]);
  }

  // O PAR em reais que produz aquele percentual, e aqui ele custa ZERO coluna:
  // no formato longo são duas linhas com outro rótulo. É exatamente o que este
  // formato compra — o CSV largo precisou de duas colunas novas, e cabeçalho
  // novo quebra a planilha de quem já baixou.
  //
  // Só o período em destaque: o snapshot carrega os absolutos para ele, e a
  // série traz apenas o percentual. Inventar os outros seria publicar número
  // que a coleta não tem.
  if (f?.despesa != null) {
    linhas.push([...comum, "Despesa com pessoal (R$)",
      `${fiscal.exercicio}/${fiscal.periodo}`, f.despesa, "R$", "SICONFI",
      fiscal.coletadoEm ?? ""]);
  }
  if (f?.rclAjustada != null) {
    linhas.push([...comum, "Receita corrente líquida ajustada (R$)",
      `${fiscal.exercicio}/${fiscal.periodo}`, f.rclAjustada, "R$", "SICONFI",
      fiscal.coletadoEm ?? ""]);
  }
  // A SITUAÇÃO do período em destaque, como linha e não como coluna — o
  // cabeçalho fica intacto, que é o que este formato promete. Sem ela, o
  // percentual que a página condena por RCL desmentida saía aqui como número
  // comum. Mesmo código da coluna `pessoal_situacao` dos CSVs largos.
  linhas.push([...comum, "Situação do gasto com pessoal",
    `${fiscal.exercicio}/${fiscal.periodo}`,
    CODIGO_FAIXA[f?.faixa ?? "nao-consultado"], "código", "calculado",
    fiscal.coletadoEm ?? ""]);

  // A despesa por função entra como linhas novas, e não como colunas: é
  // exatamente o que o formato longo compra. Um CSV largo precisaria de 28
  // colunas a mais no cabeçalho, e o cabeçalho é o que quebra a planilha de
  // quem já baixou o arquivo antes.
  // A SÉRIE inteira, um exercício por vez. Em formato longo cada ano são
  // apenas linhas com outro `periodo` — nenhuma coluna muda, e quem já baixou
  // o arquivo antes continua abrindo do mesmo jeito. É exatamente o que o
  // formato longo compra: um CSV largo precisaria de 28 colunas por ano.
  const bloco = fiscal.funcoes;
  for (const e of bloco?.exercicios ?? []) {
    const entrada = e.porMunicipio[String(m.codigo)];
    if (!entrada) continue;
    const [total, valores] = entrada;
    const quando = `${e.exercicio}/${bloco!.periodo}`;
    for (const [i, valor] of valores) {
      linhas.push([...comum,
        `Despesa liquidada — ${bloco!.rotulos[i] ?? `Função ${i}`}`,
        quando, valor, "R$", "SICONFI", e.coletadoEm ?? ""]);
    }
    if (total !== null) {
      linhas.push([...comum, "Despesa liquidada — total declarado",
        quando, total, "R$", "SICONFI", e.coletadoEm ?? ""]);
    }
  }

  // A composição da RECEITA, pelo mesmo caminho da despesa por função: linhas
  // novas, nenhuma coluna nova. Aqui o formato longo paga mais do que ali --
  // são doze rubricas, e o CSV largo levou só três.
  //
  // **O rótulo separa o que soma do que está dentro**, e é a única defesa que
  // este arquivo tem. Nele as doze linhas chegam iguais, e quem somar a coluna
  // `valor` filtrando por "Receita corrente" encontraria ~20% a mais do que o
  // município arrecadou. "— dentro de X" no rótulo é o que avisa, num arquivo
  // que viaja sem a explicação da página.
  const rec = fiscal.receita;
  for (const e of rec?.exercicios ?? []) {
    const entrada = e.porMunicipio[String(m.codigo)];
    if (!entrada) continue;
    const [total, valores, detalhe] = entrada;
    const quando = `${e.exercicio}/${rec!.periodo}`;
    for (const [i, valor] of valores) {
      linhas.push([...comum,
        `Receita corrente — ${rec!.rotulos[i] ?? `Componente ${i}`}`,
        quando, valor, "R$", "SICONFI", e.coletadoEm ?? ""]);
    }
    for (const [i, valor] of detalhe) {
      const pai = rec!.paiDoDetalhe[i];
      const dentro = pai == null ? "" : ` — dentro de ${rec!.rotulos[pai]}`;
      linhas.push([...comum,
        `Receita corrente (detalhe) — ${rec!.rotulosDetalhe[i] ?? `Detalhe ${i}`}${dentro}`,
        quando, valor, "R$", "SICONFI", e.coletadoEm ?? ""]);
    }
    if (total !== null) {
      linhas.push([...comum, "Receita corrente — total declarado",
        quando, total, "R$", "SICONFI", e.coletadoEm ?? ""]);
    }
  }

  // O IDEB entra como linhas, uma por edição e etapa. As duas etapas ficam em
  // indicadores DIFERENTES: têm escalas próprias, e uma coluna só convidaria
  // quem baixou a compará-las.
  for (const [snap, etapa] of [[ideb, "anos iniciais"], [idebFinais, "anos finais"]] as const) {
    const t = trajetoriaDe(snap, m.codigo);
    for (const ponto of t?.pontos ?? []) {
      linhas.push([...comum, `IDEB rede municipal — ${etapa}`,
        String(ponto.edicao), ponto.observado, "índice 0 a 10", "INEP",
        snap.coletadoEm ?? ""]);
      if (ponto.projecao !== null) {
        linhas.push([...comum, `Meta do IDEB — ${etapa}`,
          String(ponto.edicao), ponto.projecao, "índice 0 a 10", "INEP",
          snap.coletadoEm ?? ""]);
      }
    }
  }

  const csv = paraCsv(
    ["codigo_ibge", "municipio", "uf", "indicador", "periodo", "valor",
     "unidade", "fonte", "coletado_em"],
    linhas,
  );
  return new Response(csv, { headers: cabecalhosCsv(`${slug}.csv`) });
}
