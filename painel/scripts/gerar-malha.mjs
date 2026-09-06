/**
 * Gera `dados/malha-uf.json`: um caminho SVG por unidade da federação.
 *
 *     node scripts/gerar-malha.mjs
 *
 * ## Por que um arquivo versionado, e não uma busca no build
 *
 * A fronteira dos estados não muda. Buscá-la a cada build acrescentaria uma
 * dependência de rede a um processo que hoje lê tudo do disco — e o build
 * passaria a falhar quando o IBGE estivesse fora do ar, por um dado que é o
 * mesmo desde sempre. Roda uma vez, o resultado entra no repositório, e este
 * script fica como a prova de como ele foi feito.
 *
 * ## Caminho SVG pronto, e não coordenadas
 *
 * O `d` de um `<path>` é mais compacto que um array de pares, e dispensa
 * projetar no navegador. O mapa é renderizado **no servidor**, então a página
 * não carrega JavaScript nenhum para desenhá-lo — o que também o torna visível
 * para quem tem JS desligado e para o buscador.
 *
 * ## O que a simplificação custa, medido
 *
 * Douglas-Peucker sobre a malha de qualidade mínima do IBGE:
 *
 * | tolerância | pontos | gzip |
 * |---|---:|---:|
 * | 0,02° | 3.639 | 14,3 KB |
 * | **0,05°** | **2.176** | **8,8 KB** |
 * | 0,08° | 1.417 | 5,9 KB |
 *
 * 0,05° (~5 km) é o ponto onde a silhueta ainda é reconhecível num mapa de
 * 600px e o peso ainda cabe numa página que hoje tem 134 KB comprimidos.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SAIDA = path.resolve(AQUI, "..", "dados", "malha-uf.json");

/** ~5 km. Ver a tabela no cabeçalho. */
const TOLERANCIA = 0.05;
/** Duas casas decimais ≈ 1 km, abaixo do que a tolerância já descarta. */
const CASAS = 2;
/** Anel com menos que isto é ilha pequena demais para aparecer. */
const MINIMO_DE_PONTOS = 6;

const URL_MALHA =
  "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR" +
  "?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF";

/** As siglas, na ordem do código do IBGE. O `codarea` da malha é o código. */
const SIGLA = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
  21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL",
  28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR",
  42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF",
};

/** Douglas-Peucker: tira o ponto que não muda a forma além de `eps`. */
function simplificar(pts, eps) {
  if (pts.length < 3) return pts;
  const dist = ([x, y], [x1, y1], [x2, y2]) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
    const t = Math.max(0, Math.min(1,
      ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
  };
  let pior = 0;
  let iMax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > pior) { pior = d; iMax = i; }
  }
  if (pior <= eps) return [pts[0], pts[pts.length - 1]];
  return [
    ...simplificar(pts.slice(0, iMax + 1), eps).slice(0, -1),
    ...simplificar(pts.slice(iMax), eps),
  ];
}

/** Os anéis de um Polygon ou MultiPolygon, achatados. */
function aneis(geom) {
  if (geom.type === "Polygon") return geom.coordinates;
  if (geom.type === "MultiPolygon") return geom.coordinates.flat();
  return [];
}

const r = await fetch(URL_MALHA, {
  headers: { "User-Agent": "numeros-publicos/1.0 (+numerospublicos.com.br)" },
});
if (!r.ok) throw new Error(`IBGE devolveu HTTP ${r.status} para a malha`);
const bruto = Buffer.from(await r.arrayBuffer());
const geo = JSON.parse(
  (bruto[0] === 0x1f && bruto[1] === 0x8b ? gunzipSync(bruto) : bruto).toString("utf-8"),
);

// Primeiro simplifica tudo, para só então saber a extensão real do que sobrou:
// calcular os limites sobre a malha original deixaria uma margem que não existe.
const porUf = {};
for (const f of geo.features) {
  const sigla = SIGLA[Number(f.properties.codarea)];
  if (!sigla) throw new Error(`codarea sem sigla: ${f.properties.codarea}`);
  const polis = [];
  for (const anel of aneis(f.geometry)) {
    let s = simplificar(anel, TOLERANCIA)
      .map(([x, y]) => [Number(x.toFixed(CASAS)), Number(y.toFixed(CASAS))]);
    s = s.filter((p, i) => i === 0 || p[0] !== s[i - 1][0] || p[1] !== s[i - 1][1]);
    if (s.length >= MINIMO_DE_PONTOS) polis.push(s);
  }
  if (!polis.length) throw new Error(`${sigla} ficou sem anel após simplificar`);
  porUf[sigla] = polis;
}

const todos = Object.values(porUf).flat(2);
const xs = todos.map((p) => p[0]);
const ys = todos.map((p) => p[1]);
const minX = Math.min(...xs);
const maxX = Math.max(...xs);
const minY = Math.min(...ys);
const maxY = Math.max(...ys);

/**
 * Projeção equiretangular com correção de latitude.
 *
 * Sem o `cos` da latitude central o Brasil sai esticado na horizontal — a
 * distância de um grau de longitude encolhe conforme se afasta do equador, e
 * ignorar isso achata o país num retângulo que ninguém reconhece.
 *
 * Não é uma projeção cartográfica séria, e não precisa ser: o mapa aqui é uma
 * legenda visual para 27 valores, não um instrumento de medida.
 */
const LARGURA = 1000;
const centroY = (minY + maxY) / 2;
const escalaX = Math.cos((centroY * Math.PI) / 180);
const largGraus = (maxX - minX) * escalaX;
const altGraus = maxY - minY;
const ALTURA = Math.round((LARGURA * altGraus) / largGraus);

const px = (x) => ((x - minX) * escalaX * LARGURA) / largGraus;
// Y invertido: latitude cresce para o norte, e a coordenada SVG para o sul.
const py = (y) => ((maxY - y) * ALTURA) / altGraus;

const caminhos = {};
for (const [sigla, polis] of Object.entries(porUf)) {
  caminhos[sigla] = polis
    .map((anel) => "M" + anel
      .map(([x, y]) => `${px(x).toFixed(1)} ${py(y).toFixed(1)}`)
      .join("L") + "Z")
    .join("");
}

const saida = { viewBox: `0 0 ${LARGURA} ${ALTURA}`, caminhos };
writeFileSync(SAIDA, `${JSON.stringify(saida)}\n`, "utf-8");

const bytes = Buffer.byteLength(JSON.stringify(saida));
console.log(`${SAIDA}`);
console.log(`  ${Object.keys(caminhos).length} UFs · viewBox ${saida.viewBox} · ` +
            `${(bytes / 1024).toFixed(1)} KB`);
