/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export estático: `next build` gera HTML/CSS/JS em `out/`, sem servidor
  // nenhum. É a decisão do ESPEC.md — nada de rota de servidor, nada de função
  // serverless. Configuração conforme a documentação oficial:
  // https://nextjs.org/docs/app/guides/static-exports
  output: "export",

  // Emite `/rota/index.html` em vez de `/rota.html`. Evita depender de regra de
  // rewrite no host, que é justamente o tipo de configuração invisível que
  // quebra quando se troca de hospedagem.
  trailingSlash: true,

  // O otimizador padrão de imagem exige servidor; sem ele, `next/image` falha
  // no export. Este painel não usa imagem — a declaração fica explícita para
  // que, se alguém adicionar uma, o motivo do erro esteja escrito aqui.
  images: { unoptimized: true },

  reactStrictMode: true,

  // CSS por página, não por site. O padrão do Turbopack ("loose") junta
  // módulos de páginas diferentes num chunk só, e o município baixava as 196
  // regras do estado sem usar nenhuma. O "graph" com custo baixo por
  // requisição troca isso por mais arquivos pequenos. Medido em 15/10/2026,
  // CSS por página: município 44.730 → 27.583 B (3 → 8 arquivos), ajuda
  // 26.701 → 9.918; com custo 10.000, o município ficava em 39.367 (7
  // arquivos). Estilo calculado de cada elemento igual ao de antes em 7
  // páginas, 2 larguras, claro, escuro e impressão. Cuidado: a ordem dos
  // arquivos é a cascata (ver o item 19, 15/10).
  experimental: { cssChunking: { type: "graph", requestCost: 2000 } },
};

export default nextConfig;
