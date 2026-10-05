import { lerSnapshot } from "@/lib/servidor";

/**
 * O índice de busca do site: nome e UF de cada município e de cada estado.
 *
 * ## Por que um arquivo, e não o índice embutido em cada página
 *
 * A busca do cabeçalho existe em **todas** as 5.600 páginas. Embutir o índice
 * no HTML custaria **30 KB comprimidos por página** — medido em 04/09/2026 —
 * e dobraria o peso das páginas menores para uma funcionalidade que a maioria
 * das visitas nunca aciona. Quem chega de uma busca externa abre uma página e
 * sai; a busca interna é para quem fica.
 *
 * Aqui o índice é um arquivo estático, buscado **no primeiro foco do campo**.
 * Custa zero para quem não busca, uma vez só para quem busca, e o CDN o entrega
 * como qualquer outro arquivo — sem servidor, coerente com `output: "export"`.
 *
 * ## Por que este formato
 *
 * **Dois campos por município, em array de arrays** e não objeto: as chaves
 * `nome`/`uf` repetidas 5.571 vezes custariam mais que os dados. É a mesma
 * lição do payload da capa, que caiu 57% ao parar de repetir chave.
 *
 * **Os 27 estados entram como `[nome, sigla, 1]`**, desde 05/10/2026 (item M3
 * da auditoria de usabilidade): quem digitava "ceara" achava Ceará-Mirim/RN e
 * nunca a página do Ceará. O terceiro campo só existe nos estados, e o
 * `busca.js` o lê para mandar a `/estado/<uf>/`. Custa 27 linhas no arquivo.
 *
 * **O slug NÃO vai gravado.** A primeira versão o gravava, com o argumento de
 * que derivá-lo no navegador exigiria reproduzir a regra do build e uma
 * divergência quebraria links em silêncio. Gravá-lo custava o dobro do
 * arquivo — medido: **78 KB comprimidos contra 30 KB**. A cópia de `slugDe`
 * que o `busca.js` tem desde 22/09/2026 é conferida por um teste nos 5.571
 * nomes do snapshot, e é ele que impede a divergência.
 */
export const dynamic = "force-static";

export async function GET() {
  const snapshot = await lerSnapshot();
  // ORDENADO POR POPULAÇÃO, decrescente — e é isto que faz a busca servir.
  //
  // Achado dirigindo o campo em 04/09/2026: com a ordem do snapshot (código do
  // IBGE), digitar "sao" devolvia **oito municípios de Alagoas** e São Paulo
  // não aparecia. Do ponto de vista de quem busca, a ordem por código é
  // aleatória — e a busca corta nos 8 primeiros.
  //
  // Quem digita "sao" quer São Paulo, São Luís, São Gonçalo. Ordenar aqui, uma
  // vez, no build, custa **zero byte** e dispensa carregar a população para o
  // navegador só para ordenar lá. A ordem do arquivo É a ordem de relevância.
  //
  // Os estados entram NA MESMA ordem, pela população deles, e não no fim: no
  // fim, medido em 05/10/2026, doze estados não apareciam nas 8 opções com as
  // quatro primeiras letras, e "parana" digitado inteiro nem mostrava o
  // Paraná. Pela população, São Paulo estado vem antes da cidade, e Roraima
  // depois das cidades maiores que ele, que é o que o tamanho diz. O nome exato ainda passa
  // na frente de tudo, no `procurar` do `busca.js`.
  const iPop = snapshot.colunas.indexOf("populacao-censo-2022");
  const iEst = snapshot.colunas.indexOf("populacao-estimada");
  type Entrada = { nome: string; uf: string; pop: number; estado: boolean };
  const entradas: Entrada[] = [
    ...snapshot.municipios.map(
      (m): Entrada => ({
        nome: String(m[1]),
        uf: String(m[2]),
        pop: (m[iPop] as number | null) ?? (m[iEst] as number | null) ?? -1,
        estado: false,
      }),
    ),
    ...snapshot.ufs.map(
      (u): Entrada => ({
        nome: u.nome,
        uf: u.sigla,
        pop: u.totais["populacao-censo-2022"] ?? -1,
        estado: true,
      }),
    ),
  ];
  const indice = entradas
    .sort((a, b) => {
      // Sem população conhecida vai para o fim: ausência não é município
      // pequeno. Empate desfeito pelo nome, para a ordem ser determinística —
      // senão dois builds do mesmo dado gerariam arquivos diferentes.
      if (a.pop !== b.pop) return b.pop - a.pop;
      return a.nome.localeCompare(b.nome, "pt-BR");
    })
    .map((x) => (x.estado ? [x.nome, x.uf, 1] : [x.nome, x.uf]));

  return new Response(JSON.stringify(indice), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // NÃO declarar `Cache-Control` aqui: com `output: "export"` este handler
      // vira um ARQUIVO no build, e arquivo não carrega cabeçalho. Havia um
      // `max-age=3600` nesta linha, com um comentário afirmando que o índice
      // era imutável dentro do deploy — e a produção, medida em 10/09/2026,
      // sempre respondeu `public, max-age=0, must-revalidate`, que é o padrão
      // do host. Um cabeçalho que não chega a lugar nenhum é pior que nenhum:
      // ele faz quem lê o código parar de procurar onde a decisão mora.
      //
      // O cache destes arquivos se decide em `cloudflare/_headers` (na raiz do
      // repositório), que é a camada que realmente os serve. Hoje só `/_next/static/` tem regra própria — o
      // resto revalida a cada visita, que é o lado seguro para um arquivo de
      // URL estável cujo conteúdo muda a cada build.
    },
  });
}
