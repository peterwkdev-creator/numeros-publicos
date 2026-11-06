import { GLOSSARIO } from "@/lib/glossario";

/**
 * As explicações curtas do glossário, para o `public/glossario.js` pôr na
 * caixa do `<Termo>` quando a pessoa chega ao termo (06/11/2026).
 *
 * ## Por que fora do HTML
 *
 * Medido em 05/11/2026 (`progress/numeros-publicos.md`, "Medição 4"): a
 * página de município levava ~37 caixas de glossário embutidas, **20% do
 * texto** do `<main>`, idênticas nas 5.571 páginas. Com a queda do Google em
 * 02/10 (a atualização de spam de setembro), o texto repetido em escala é o
 * que mais pesa contra o site. A frase continua a mesma, numa fonte só
 * (`lib/glossario.ts`); só deixa de ir dentro de cada página.
 *
 * `{ chave: frase }`, sem o resto do verbete: o título é o próprio termo no
 * texto e o "Ler mais" já sai no HTML.
 */
export const dynamic = "force-static";

export async function GET() {
  const frases = Object.fromEntries(
    Object.entries(GLOSSARIO).map(([chave, v]) => [chave, v.curta]),
  );
  // Sem `Cache-Control`: com `output: "export"` isto vira arquivo, e arquivo
  // não leva cabeçalho (ver `dados/indice.json/route.ts`).
  return new Response(JSON.stringify(frases), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
