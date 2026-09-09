/**
 * Testes das duas bibliotecas puras do painel.
 *
 * Roda no `node:test`, que vem com o Node, sobre TypeScript que o próprio Node
 * remove — **zero dependência**, como o `stack.md` cobra. O resto do painel se
 * verifica por fora (`npm run auditar` contra o HTML gerado, `conferir-xlsx`
 * abrindo a planilha no LibreOffice); aqui ficam só as funções cujo erro é
 * silencioso e aritmético, que nenhuma das duas pegaria.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";

import {
  concorda, descricaoDe, fracaoDe, INDICADORES_DA_CAPA, projetar,
  COLUNA_DA_CAPA, rotuloCurto, unidadeDaColuna, type Snapshot,
} from "../lib/dados.ts";
import {
  funcoesDoPais, mediana, panoramaEstados, posicaoNaLista, rankingPessoal,
} from "../lib/nacional.ts";
import {
  compararFuncoes, faixaDe, faixasEmLinha, FAIXA_DA_LETRA, funcoesDe,
  funcoesRecentesDe, LETRA_FAIXA, parDeFuncoes,
  contiguos, indiceQuadrimestre, interrupcoes, pontoPlausivel, PRESTA_COMO_ESTADO,
  ROTULO_FAIXA, serieFuncoesDe, type PontoSerie,
} from "../lib/fiscal.ts";
import { posicaoEntre, posicaoNoEstado } from "../lib/posicao.ts";
import { emContracao } from "../lib/estado.ts";
import { faixaDoValor, percentuaisPorUf } from "../lib/mapa.ts";
import {
  medianasDe, medidasDe, PARES_CENSO, rotuloDownload, taxasDoPais,
  medidasDoPais,
} from "../lib/censo.ts";
import { xlsx } from "../lib/xlsx.ts";

// ------------------------------------------------------------------ posicao

test("posicaoEntre situa o valor entre os comparáveis", () => {
  const p = posicaoEntre(50, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.ok(p);
  assert.equal(p.base, 10);
  assert.equal(p.mediana, 55);
});

test("quem não entregou não conta — e não vira zero", () => {
  // `null` é "não entregou". Tratá-lo como 0 poria o município no fim da fila
  // POR NÃO TER PRESTADO CONTAS, que é o inverso da verdade.
  const valores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const com = posicaoEntre(50, [...valores, null, null, null]);
  const sem = posicaoEntre(50, valores);
  assert.deepEqual(com?.base, sem?.base);
  assert.deepEqual(com?.mediana, sem?.mediana);
});

test("percentual implausível não empurra os outros um degrau", () => {
  const valores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const p = posicaoEntre(50, [...valores, 371]);
  assert.equal(p?.base, 10, "371% é erro de preenchimento, não um município caro");
});

test("abaixo de 10 comparáveis não há distribuição, e o certo é dizer isso", () => {
  assert.equal(posicaoEntre(50, [10, 20, 30, 40, 50, 60, 70, 80, 90]), null);
});

test("sem percentual próprio não há posição", () => {
  assert.equal(posicaoEntre(null, [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]), null);
});

// --------------------------------------------------------------------- xlsx

/** Descomprime uma entrada do ZIP. Ver `scripts/conferir-xlsx.mjs`. */
function entrada(buf: Buffer, alvo: string): string {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(fim + 16);
  for (let i = 0; i < buf.readUInt16LE(fim + 10); i += 1) {
    const tn = buf.readUInt16LE(p + 28);
    const nome = buf.toString("utf-8", p + 46, p + 46 + tn);
    if (nome === alvo) {
      const d = buf.readUInt32LE(p + 42);
      const ini = d + 30 + buf.readUInt16LE(d + 26) + buf.readUInt16LE(d + 28);
      return inflateRawSync(
        buf.subarray(ini, ini + buf.readUInt32LE(p + 20)),
      ).toString("utf-8");
    }
    p += 46 + tn + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  throw new Error(`${alvo} não está no pacote`);
}

test("a 27ª coluna é AA, e não AZ nem BA", () => {
  // Errar a base 26 desloca a planilha inteira a partir da 27ª coluna, em
  // silêncio: o arquivo abre, e os números ficam sob os cabeçalhos errados.
  const linha = Array.from({ length: 55 }, (_, i) => `c${i}`);
  const xml = entrada(xlsx([{ nome: "T", linhas: [linha] }]), "xl/worksheets/sheet1.xml");
  for (const [i, esperado] of [[0, "A1"], [25, "Z1"], [26, "AA1"], [27, "AB1"],
                               [51, "AZ1"], [52, "BA1"]] as const) {
    assert.ok(xml.includes(`r="${esperado}"`), `coluna ${i} devia ser ${esperado}`);
  }
});

test("número sai como número; texto, como texto", () => {
  const xml = entrada(
    xlsx([{ nome: "T", linhas: [["cab"], [42, "quarenta e dois"]] }]),
    "xl/worksheets/sheet1.xml",
  );
  assert.ok(xml.includes("<v>42</v>"), "o número virou texto — a soma não fecharia");
  assert.ok(xml.includes('t="inlineStr"'), "o texto perdeu o tipo");
});

test("célula vazia é AUSÊNCIA: não vira zero nem string vazia", () => {
  const xml = entrada(
    xlsx([{ nome: "T", linhas: [["a", "b"], [null, 7]] }]),
    "xl/worksheets/sheet1.xml",
  );
  assert.ok(!xml.includes('r="A2"'), "a ausência ganhou uma célula");
  assert.ok(xml.includes('r="B2"'), "a célula seguinte se perdeu junto");
});

test("o styles.xml existe — sem ele o Excel recusa o arquivo inteiro", () => {
  const buf = xlsx([{ nome: "T", linhas: [["a"]] }]);
  assert.ok(entrada(buf, "xl/styles.xml").includes("styleSheet"));
});

test("dois builds do mesmo dado dão bytes idênticos", () => {
  // A data do ZIP é fixa de propósito: com a data corrente, um `git diff` do
  // artefato deixaria de significar alguma coisa.
  const um = xlsx([{ nome: "T", linhas: [["a", 1]] }]);
  const outro = xlsx([{ nome: "T", linhas: [["a", 1]] }]);
  assert.ok(um.equals(outro));
});

test("caractere de XML no dado não quebra o pacote", () => {
  const xml = entrada(
    xlsx([{ nome: "T", linhas: [["a"], ['Saúde & <Educação> "básica"']] }]),
    "xl/worksheets/sheet1.xml",
  );
  assert.ok(xml.includes("&amp;") && xml.includes("&lt;"));
});

// ---------------------------------------------------------------- descricao

test("a cauda entra quando cabe inteira", () => {
  const d = descricaoDe("Principal.", "Cauda.", 155);
  assert.equal(d, "Principal. Cauda.");
});

test("a cauda é DESCARTADA, não cortada", () => {
  // Ela é idêntica em todas as páginas: é a parte com menos valor de
  // diferenciação, e portanto a que deve ceder primeiro. Cortá-la produzia
  // "do Tesouro Nacional e do…", que parece erro e gasta o pouco que sobrava.
  const principal = "a".repeat(100);
  const d = descricaoDe(principal, "b".repeat(100), 155);
  assert.equal(d, principal);
  assert.ok(!d.includes("…"));
});

test("só o principal excedendo é que se corta — e no espaço, nunca no meio da palavra", () => {
  const d = descricaoDe("palavra ".repeat(30).trim(), "cauda", 40);
  assert.ok(d.endsWith("…"));
  assert.ok(!d.includes(" …"), "sobrou espaço antes das reticências");
  assert.ok(d.length <= 40);
  assert.ok(d.slice(0, -1).split(" ").every((w) => w === "palavra"),
            "cortou no meio de uma palavra");
});

test("principal sem espaço nenhum ainda respeita o limite", () => {
  const d = descricaoDe("x".repeat(200), "cauda", 40);
  assert.ok(d.length <= 40);
});

// -------------------------------------------------------------------- faixas

const LIMITES = { legal: 54, prudencial: 51.3 };

test("quem presta contas como estado NÃO é marcado como faltoso", () => {
  // O Distrito Federal entrega o Anexo 01 na esfera estadual — conferido na
  // fonte, 215 itens. Marcá-lo "sem relatório entregue" é acusar de não
  // prestar contas quem presta, e foi o que o site fez até 04/09/2026.
  const df = 5300108;
  assert.ok(PRESTA_COMO_ESTADO.has(df));
  assert.equal(faixaDe(null, null, LIMITES, false, df), "como-estado");
  // e mesmo se a coleta o marcasse de qualquer outro jeito
  assert.equal(faixaDe(null, null, LIMITES, null, df), "como-estado");
  assert.equal(faixaDe(45, 51.3, LIMITES, true, df), "como-estado");
});

test("um município comum não é afetado pela exceção", () => {
  const comum = 3550308; // São Paulo
  assert.equal(faixaDe(null, null, LIMITES, false, comum), "sem-dado");
  assert.equal(faixaDe(null, null, LIMITES, null, comum), "nao-consultado");
  assert.equal(faixaDe(45, 51.3, LIMITES, true, comum), "abaixo");
  assert.equal(faixaDe(52, 51.3, LIMITES, true, comum), "acima-prudencial");
  assert.equal(faixaDe(60, 51.3, LIMITES, true, comum), "acima-legal");
  assert.equal(faixaDe(371, 51.3, LIMITES, true, comum), "implausivel");
});

test("sem código, o comportamento é o de antes", () => {
  // `codigo` é opcional: quem não o passa não pode receber a faixa nova por
  // acidente, e quem passa não muda de resposta para os demais municípios.
  assert.equal(faixaDe(null, null, LIMITES, false), "sem-dado");
});

test("toda faixa tem rótulo — inclusive a nova", () => {
  // `Record<Faixa, string>` já obriga isso no TypeScript, mas o rótulo vazio
  // passaria: é ele que sai na planilha e no CSV de quem baixa.
  for (const [faixa, rotulo] of Object.entries(ROTULO_FAIXA)) {
    assert.ok(rotulo.length > 3, `faixa ${faixa} sem rótulo utilizável`);
  }
});

// ------------------------------------------------- faixas em linha (busca)

/** O mínimo que `indexarFiscal` lê. */
const fiscalDe = (municipios: unknown[][]) => ({
  limites: LIMITES,
  municipios,
}) as never;

test("a string de faixas casa POSIÇÃO a POSIÇÃO com as linhas", () => {
  // A ordem é o contrato. Se ela escorregar, cada município exibe a situação
  // fiscal do vizinho — e a página continua bem formada, que é o que torna
  // este defeito invisível sem um teste.
  const linhas = [[1], [2], [3], [4]];
  const fiscal = fiscalDe([
    [1, "", "", null, true, 45, 51.3, null, null],   // abaixo
    [2, "", "", null, true, 60, 51.3, null, null],   // acima do legal
    [3, "", "", null, false, null, null, null, null], // não entregou
    [4, "", "", null, true, 52, 51.3, null, null],   // acima do prudencial
  ]);
  assert.equal(faixasEmLinha(linhas, fiscal), "alsp");
});

test("município ausente do snapshot fiscal vira 'não consultado', não 'não entregou'", () => {
  // O primeiro é afirmação sobre nós; o segundo, sobre ele. Trocá-los acusa
  // de não prestar contas quem nunca foi perguntado.
  const faixas = faixasEmLinha([[99]], fiscalDe([]));
  assert.equal(faixas, LETRA_FAIXA["nao-consultado"]);
  assert.notEqual(faixas, LETRA_FAIXA["sem-dado"]);
});

test("o Distrito Federal sai como 'como-estado' também na string", () => {
  assert.equal(
    faixasEmLinha([[5300108]], fiscalDe([
      [5300108, "", "", null, false, null, null, null, null],
    ])),
    LETRA_FAIXA["como-estado"],
  );
});

test("toda faixa tem uma letra, e toda letra volta à sua faixa", () => {
  // A letra viaja até o navegador e é traduzida de volta lá. Uma faixa nova
  // sem letra viraria `undefined` no filtro — silenciosamente sem resultado.
  const letras = Object.values(LETRA_FAIXA);
  assert.equal(new Set(letras).size, letras.length, "duas faixas com a mesma letra");
  for (const [faixa, letra] of Object.entries(LETRA_FAIXA)) {
    assert.equal(letra.length, 1, `a letra de ${faixa} não tem 1 caractere`);
    assert.equal(FAIXA_DA_LETRA[letra], faixa);
  }
  assert.equal(Object.keys(LETRA_FAIXA).length, Object.keys(ROTULO_FAIXA).length);
});

// ----------------------------------------------------------- panorama nacional

test("a mediana de lista vazia é null, nunca zero", () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([5]), 5);
  assert.equal(mediana([1, 2, 3, 4]), 2.5);
  assert.equal(mediana([3, 1, 2]), 2, "não ordenou antes de tirar o meio");
});

test("o panorama não conta como faltoso quem presta contas como estado", () => {
  // O DF sai das DUAS contas: nem no denominador nem entre os que faltaram.
  // Contá-lo derrubaria a taxa de entrega de uma unidade inteira para 0%.
  const fiscal = {
    limites: LIMITES,
    municipios: [
      [5300108, "Brasília", "DF", null, false, null, null, null, null],
      [3550308, "São Paulo", "SP", null, true, 40, 51.3, null, null],
      [3509502, "Campinas", "SP", null, false, null, null, null, null],
    ],
  } as never;
  const p = panoramaEstados(fiscal);
  assert.equal(p.find((x) => x.uf === "DF"), undefined,
    "o DF entrou no panorama sem ter relatório municipal para comparar");
  const sp = p.find((x) => x.uf === "SP")!;
  assert.equal(sp.municipios, 2);
  assert.equal(sp.publicaram, 1);
  assert.equal(sp.taxa, 50);
});

test("o implausível não entra na mediana do estado", () => {
  const municipios = Array.from({ length: 12 }, (_, i) => [
    1000 + i, `M${i}`, "XX", null, true, 40 + i, 51.3, null, null,
  ]);
  const semErro = panoramaEstados({ limites: LIMITES, municipios } as never)[0]!;
  const comErro = panoramaEstados({
    limites: LIMITES,
    municipios: [...municipios, [9999, "Erro", "XX", null, true, 371, 51.3, null, null]],
  } as never)[0]!;
  assert.equal(semErro.mediana, comErro.mediana,
    "371% deslocou a mediana do estado — é erro de preenchimento, não gasto");
  assert.equal(comErro.base, semErro.base);
});

test("abaixo de 10 comparáveis o estado não ganha mediana", () => {
  const poucos = Array.from({ length: 9 }, (_, i) => [
    2000 + i, `P${i}`, "YY", null, true, 45, 51.3, null, null,
  ]);
  assert.equal(panoramaEstados({ limites: LIMITES, municipios: poucos } as never)[0]!.mediana,
    null, "9 municípios não descrevem um estado");
});

test("posicaoNaLista conta quem está estritamente abaixo", () => {
  // Empate NÃO conta como "abaixo": dois estados com a mesma taxa não estão um
  // acima do outro, e afirmar que estão inventa uma ordem.
  assert.deepEqual(posicaoNaLista(50, [10, 50, 50, 90]), { abaixo: 1, de: 4 });
  assert.deepEqual(posicaoNaLista(10, [10, 50]), { abaixo: 0, de: 2 });
});

// ------------------------------------------------------- funções no país

test("o país soma valores absolutos, não médias de percentual", () => {
  // Se somasse percentuais, um município de 3 mil habitantes pesaria o mesmo
  // que São Paulo na composição do gasto do Brasil.
  const fiscal = {
    limites: LIMITES,
    municipios: [],
    funcoes: {
      periodo: 6,
      rotulos: ["Educação", "Saúde"],
      exercicios: [{
        exercicio: 2024,
        porMunicipio: {
          // um grande: 900 em Educação, 100 em Saúde
          "1": [1000, [[0, 900], [1, 100]]],
          // um pequeno com a proporção INVERSA: 1 e 9
          "2": [10, [[0, 1], [1, 9]]],
        },
      }],
    },
  } as never;
  const p = funcoesDoPais(fiscal)!;
  assert.equal(p.total, 1010);
  assert.equal(p.municipios, 2);
  // Educação: 901 de 1010 = 89,2%. Pela média das fatias daria 90% e 10%
  // trocados de lugar entre os dois — a proporção do pequeno pesaria igual.
  assert.equal(p.fatias[0]!.nome, "Educação");
  assert.ok(Math.abs(p.fatias[0]!.percentual! - 89.207) < 0.01);
});

test("rótulo faltante não imprime 'undefined' na página", () => {
  const fiscal = {
    limites: LIMITES, municipios: [],
    funcoes: {
      periodo: 6,
      rotulos: ["Educação"],
      exercicios: [{
        exercicio: 2024,
        porMunicipio: { "1": [100, [[0, 60], [7, 40]]] },
      }],
    },
  } as never;
  const p = funcoesDoPais(fiscal)!;
  const orfa = p.fatias.find((f) => f.nome !== "Educação")!;
  assert.equal(orfa.nome, "Função 7");
  assert.ok(!orfa.nome.includes("undefined"));
});

test("sem bloco de funções, o país é null — não um total zerado", () => {
  assert.equal(funcoesDoPais({ limites: LIMITES, municipios: [] } as never), null);
});

// ------------------------------------------------------------- IndexNow

test("a chave do IndexNow no script é EXATAMENTE a do arquivo público", () => {
  // O protocolo compara as duas. Divergindo, toda submissão volta 403 — e o
  // 403 só aparece quando alguém roda o envio, que pode ser semanas depois de
  // a divergência entrar. É o tipo de defeito que não dói onde nasce.
  const script = fs.readFileSync("scripts/indexnow.mjs", "utf-8");
  const noScript = script.match(/^const CHAVE = "([^"]+)";$/m)?.[1];
  assert.ok(noScript, "não achei a constante CHAVE no script");

  const arquivo = `public/${noScript}.txt`;
  assert.ok(fs.existsSync(arquivo),
    `o arquivo público da chave não existe: ${arquivo}`);

  const conteudo = fs.readFileSync(arquivo, "utf-8");
  assert.equal(conteudo, noScript,
    "o conteúdo do arquivo difere da chave — inclusive quebra de linha no fim conta");
  // A regra do protocolo: 8 a 128 caracteres, só letras, números e hífen.
  assert.match(noScript, /^[a-zA-Z0-9-]{8,128}$/);
});

// ---------------------------------------------------- posição no estado

test("posicaoNoEstado situa sem classificar", () => {
  const p = posicaoNoEstado(30, [10, 20, 30, 40, 50]);
  assert.deepEqual(p, { abaixo: 2, de: 5, mediana: 30 });
});

test("quem não tem o valor fica FORA da conta, não no fim", () => {
  // Não saber a população de um município não o torna o menor do estado, e um
  // denominador que inclui desconhecidos descreve outra coisa.
  const com = posicaoNoEstado(30, [10, 20, 30, 40, 50, null, null, undefined]);
  const sem = posicaoNoEstado(30, [10, 20, 30, 40, 50]);
  assert.deepEqual(com, sem);
});

test("abaixo do mínimo não há posição — o Distrito Federal tem um município", () => {
  assert.equal(posicaoNoEstado(30, [30]), null);
  assert.equal(posicaoNoEstado(30, [10, 20, 30, 40]), null);
  assert.ok(posicaoNoEstado(30, [10, 20, 30, 40, 50]));
});

test("sem valor próprio não há posição", () => {
  assert.equal(posicaoNoEstado(null, [10, 20, 30, 40, 50]), null);
  assert.equal(posicaoNoEstado(undefined, [10, 20, 30, 40, 50]), null);
  assert.equal(posicaoNoEstado(NaN, [10, 20, 30, 40, 50]), null);
});

test("empate não conta como estar acima", () => {
  assert.equal(posicaoNoEstado(30, [30, 30, 30, 30, 30])!.abaixo, 0);
});

// ------------------------------------------------------------ concordância

test("um estado com UM município não vira \"1 dos 1 municípios\"", () => {
  // O Distrito Federal tem um município, e a concordância singular mordeu TRÊS
  // vezes em 04/09/2026 — "Os 1 municípios", "0 de 0 que entregaram", "1 dos 1
  // municípios não têm". Cada uma foi remendada onde apareceu; a seguinte
  // apareceu em outro lugar. Este teste é o que impede a quarta.
  assert.equal(fracaoDe(1, 1), "o único município");
  assert.equal(fracaoDe(0, 1), "nenhum município");
  assert.equal(concorda(1, 1, "não tem", "não têm"), "não tem");
});

test("a fração comum sai no plural", () => {
  assert.equal(fracaoDe(388, 399), "388 dos 399 municípios");
  assert.equal(concorda(388, 399, "não tem", "não têm"), "não têm");
});

test("um entre muitos usa \"de\", não \"dos\"", () => {
  assert.equal(fracaoDe(1, 497), "1 de 497 municípios");
  assert.equal(concorda(1, 497, "não tem", "não têm"), "não tem");
});

test("o substantivo é parametrizável e pluraliza junto", () => {
  assert.equal(fracaoDe(3, 27, "estado"), "3 dos 27 estados");
  assert.equal(fracaoDe(1, 1, "estado"), "o único estado");
});

// ------------------------------------------------------------- enxugar

test("a regra do enxugar é lista do que SAI, nunca do que fica", () => {
  // A primeira versão era "apagar todo .txt menos o robots.txt", e teria
  // apagado a CHAVE DO INDEXNOW — um .txt na raiz cujo sumiço só apareceria
  // semanas depois, como 403 no próximo envio. Lista de exclusão apodrece a
  // cada arquivo novo em `public/`; lista de inclusão erra para o lado seguro.
  const fonte = fs.readFileSync("scripts/enxugar.mjs", "utf-8");

  // `ehPayload` decide o que sai. Ela tem de exigir uma marca do Next, nunca
  // apenas a extensão.
  assert.match(fonte, /__next\./,
    "a regra não menciona o prefixo do Next — está apagando por extensão?");
  assert.match(fonte, /index\.html/,
    "`index.txt` só é payload ao lado de um index.html; a condição sumiu");

  // E o script se recusa a terminar sem a chave preservada.
  assert.match(fonte, /chave do IndexNow NÃO está entre os mantidos/,
    "sumiu a verificação final que protege a chave");
});

// ----------------------------------------------------------------- projetar

/** Um snapshot mínimo com quatro indicadores, na ordem das colunas. */
function snapshotFalso(): Snapshot {
  const ind = (codigo: string) => ({
    codigo, nome: codigo, unidade: "Pessoas", agregado: 1, variavel: 1,
    periodo: "2022", origem: null, coletadoEm: "2026-09-04T00:00:00+00:00",
    totalRegiao: null,
  });
  return {
    geradoEm: "2026-09-04T00:00:00+00:00", fonte: "teste",
    colunas: ["codigo", "nome", "uf", "a", "b", "c", "d"],
    indicadores: [ind("a"), ind("b"), ind("c"), ind("d")],
    ufs: [],
    municipios: [
      [1, "Um", "AA", 10, 20, 30, 40],
      [2, "Dois", "BB", 11, null, 33, 44],
    ],
  };
}

test("projetar recorta as colunas pedidas, na ordem pedida", () => {
  const p = projetar(snapshotFalso(), ["c", "a"]);
  assert.deepEqual(p.indicadores.map((i) => i.codigo), ["c", "a"]);
  assert.deepEqual(p.linhas, [
    [1, "Um", "AA", 30, 10],
    [2, "Dois", "BB", 33, 11],
  ]);
});

test("projetar preserva a ordem das LINHAS, que é contrato com faixasEmLinha", () => {
  // Se a projeção reordenasse, cada município exibiria a situação fiscal do
  // vizinho — e a página continuaria bem formada, que é o que torna esse
  // defeito difícil de ver.
  const s = snapshotFalso();
  const p = projetar(s, ["a"]);
  assert.deepEqual(p.linhas.map((l) => l[0]), s.municipios.map((l) => l[0]));
});

test("projetar preserva a AUSÊNCIA como null, nunca como zero", () => {
  const p = projetar(snapshotFalso(), ["b"]);
  assert.equal(p.linhas[1]![3], null);
});

test("projetar LEVANTA quando o indicador não existe", () => {
  // Omitir em silêncio faria a capa renderizar uma coluna a menos sem dizer por
  // quê: um indicador renomeado no motor Python sumiria da tela sem nada
  // quebrar, que é a classe de defeito mais fácil de nunca descobrir.
  assert.throws(() => projetar(snapshotFalso(), ["a", "inexistente"]),
                /inexistente/);
});

test("os indicadores da capa continuam sendo três", () => {
  // Sentinela: com os dez do Censo 2022 no snapshot, iterar tudo daria 13
  // cartões e 13 colunas numéricas, e mandaria +149 KB comprimidos nas props
  // de toda visita. Se esta lista crescer, que seja por decisão.
  assert.equal(INDICADORES_DA_CAPA.length, 3);
});

// -------------------------------------------------------------------- censo

test("medidasDe calcula o percentual do par, e o absoluto sobrevive", () => {
  // Volta Redonda/RJ, valores reais do Censo 2022.
  const m = medidasDe({
    "esgoto-rede": 94063, "domicilios-total": 97991,
  }).find((x) => x.chave === "esgoto")!;
  assert.equal(m.parte, 94063);
  assert.equal(m.total, 97991);
  assert.ok(Math.abs(m.percentual! - 95.99) < 0.01);
});

test("ausência de dado vira null, NUNCA zero", () => {
  // 8 municípios não têm dado de água e 25 não têm de esgoto. Um município sem
  // dado de esgoto não tem 0% de esgoto: tem 0 de informação. Confundir os dois
  // é como um painel passa a mentir sem ninguém notar.
  for (const valores of [
    { "esgoto-rede": null, "domicilios-total": 100 },
    { "esgoto-rede": 50, "domicilios-total": null },
    {},
  ]) {
    const m = medidasDe(valores).find((x) => x.chave === "esgoto")!;
    assert.equal(m.percentual, null);
  }
});

test("denominador zero não vira divisão por zero nem 0%", () => {
  const m = medidasDe({ "esgoto-rede": 0, "domicilios-total": 0 })
    .find((x) => x.chave === "esgoto")!;
  assert.equal(m.percentual, null);
});

test("zero de verdade continua sendo zero", () => {
  // Costa Marques/RO tem 0,0% de esgoto, e isso É um fato, não uma ausência.
  const m = medidasDe({ "esgoto-rede": 0, "domicilios-total": 1500 })
    .find((x) => x.chave === "esgoto")!;
  assert.equal(m.percentual, 0);
  assert.notEqual(m.percentual, null);
});

test("medianasDe ignora quem não tem as duas pontas", () => {
  const colunas = ["codigo", "esgoto-rede", "domicilios-total"];
  const linhas = [
    [1, 50, 100],     // 50%
    [2, 10, 100],     // 10%
    [3, 90, 100],     // 90%
    [4, null, 100],   // sem numerador: fora
    [5, 30, null],    // sem denominador: fora
    [6, 5, 0],        // denominador zero: fora
  ];
  assert.equal(medianasDe(linhas, colunas)["esgoto"], 50);
});

test("mediana de município NÃO é a taxa do país", () => {
  // Dois municípios pequenos sem esgoto e um grande com esgoto: a mediana dos
  // municípios é 0% e a taxa do conjunto é 90%. Os dois são corretos e dizem
  // coisas opostas -- é o caso real do esgoto (26,9% contra 64,7%), e a razão
  // de a página nunca poder chamar um de outro.
  const colunas = ["codigo", "esgoto-rede", "domicilios-total"];
  const linhas = [[1, 0, 10], [2, 0, 10], [3, 900, 1000]];
  assert.equal(medianasDe(linhas, colunas)["esgoto"], 0);
  const totalParte = 0 + 0 + 900;
  const totalTudo = 10 + 10 + 1000;
  assert.ok(Math.abs((totalParte * 100) / totalTudo - 88.2) < 0.1);
});

test("todo par aponta para indicador que existe no snapshot", () => {
  // Sentinela: um indicador renomeado no motor Python faria a página exibir
  // travessão em toda linha, sem nada quebrar -- e sem nada acusar.
  const snapshot = JSON.parse(
    fs.readFileSync(new URL("../dados/snapshot.json", import.meta.url), "utf-8"),
  );
  for (const par of PARES_CENSO) {
    assert.ok(snapshot.colunas.includes(par.numerador),
      `numerador ausente no snapshot: ${par.numerador}`);
    assert.ok(snapshot.colunas.includes(par.denominador),
      `denominador ausente no snapshot: ${par.denominador}`);
  }
});

test("taxa do país NÃO é a mediana dos municípios", () => {
  // O caso real do esgoto, em miniatura: dois municípios pequenos sem rede e um
  // grande com rede. A mediana municipal é 0% e a taxa do país 88%. Confundi-los
  // troca "a maioria dos municípios não tem" por "a maioria das casas tem".
  const colunas = ["codigo", "esgoto-rede", "domicilios-total"];
  const linhas = [[1, 0, 10], [2, 0, 10], [3, 900, 1000]];
  assert.equal(medianasDe(linhas, colunas)["esgoto"], 0);
  assert.ok(Math.abs(taxasDoPais(linhas, colunas)["esgoto"]! - 88.24) < 0.01);
});

test("taxa do país ignora quem tem só uma das pontas", () => {
  // Somar um numerador cujo denominador falta inflaria a taxa em silêncio --
  // e o resultado passaria de 100%, que é plausível o bastante para ninguém
  // olhar duas vezes.
  const colunas = ["codigo", "esgoto-rede", "domicilios-total"];
  const linhas = [[1, 50, 100], [2, 900, null]];
  assert.equal(taxasDoPais(linhas, colunas)["esgoto"], 50);
});

test("a página não crava percentual do Censo em texto", () => {
  // O defeito que este teste impede: a primeira versão da ressalva escreveu
  // "26,9%" à mão -- número medido numa categoria de esgoto que nem era a
  // exibida -- enquanto a tabela ao lado mostrava 32,6%. Nenhum teste pegava,
  // porque continua sendo uma frase bem formada.
  const pagina = fs.readFileSync(
    new URL("../app/municipio/[slug]/page.tsx", import.meta.url), "utf-8");
  const secao = pagina.slice(pagina.indexOf("Como se vive em"));
  const cravados = [...secao.matchAll(/<strong>\s*\d+[.,]\d+%/g)].map((m) => m[0]);
  assert.deepEqual(cravados, [],
    `percentual escrito à mão na seção do Censo: ${cravados.join(", ")}`);
});

test("todo indicador do snapshot tem rótulo ÚNICO no download", () => {
  // O defeito que este teste impede, achado em 05/09/2026 lendo o CSV baixado:
  // o nome vem da VARIÁVEL do IBGE, e com classificação quatro indicadores
  // compartilham a mesma. O arquivo saía com quatro linhas "Domicílios
  // particulares permanentes ocupados" -- 97.180, 97.991, 94.063 e 97.672 --
  // e nada dizendo qual era água, total, esgoto ou lixo.
  //
  // Na tela nunca apareceu, porque a página nomeia cada linha. O arquivo viaja
  // SEM a página, e é ele que alguém republica.
  const snapshot = JSON.parse(
    fs.readFileSync(new URL("../dados/snapshot.json", import.meta.url), "utf-8"),
  );
  const rotulos = snapshot.indicadores.map(
    (i: { codigo: string; nome: string }) => rotuloDownload(i.codigo, i.nome));
  const repetidos = rotulos.filter(
    (r: string, i: number) => rotulos.indexOf(r) !== i);
  assert.deepEqual([...new Set(repetidos)], [],
    `rótulo repetido no download: ${[...new Set(repetidos)].join(" | ")}`);
});

test("indicador sem classificação mantém o nome da fonte", () => {
  // Repetir PIB e população na lista de rótulos criaria uma segunda verdade a
  // manter, que divergiria da fonte no dia em que o IBGE renomeasse a variável.
  assert.equal(rotuloDownload("pib-municipal", "Produto Interno Bruto"),
               "Produto Interno Bruto");
});

// --------------------------------------------------------------------- mapa

test("faixaDoValor reparte 0 a 100 em cinco faixas, e a ausência fica fora", () => {
  assert.equal(faixaDoValor(0), 0);
  assert.equal(faixaDoValor(19.9), 0);
  assert.equal(faixaDoValor(20), 1);
  assert.equal(faixaDoValor(99.9), 4);
  assert.equal(faixaDoValor(100), 4, "100% tem de cair na última, não fora dela");
  assert.equal(faixaDoValor(null), null);
  assert.equal(faixaDoValor(NaN), null);
});

test("UF sem uma das pontas fica sem faixa, e não em 0%", () => {
  // Cinza dizendo "sem dado" e azul-claro dizendo "quase nada" são afirmações
  // opostas sobre um estado. Confundi-las é o defeito que este site existe
  // para não cometer.
  const r = percentuaisPorUf(
    [{ sigla: "AA", totais: { n: 5, d: 10 } },
     { sigla: "BB", totais: { n: null, d: 10 } },
     { sigla: "CC", totais: { n: 5, d: 0 } }],
    "n", "d");
  assert.equal(r["AA"], 50);
  assert.equal(r["BB"], null);
  assert.equal(r["CC"], null, "denominador zero não é 0%, é ausência");
});

test("toda camada do mapa tem regra de cor no CSS", () => {
  // A troca de indicador é CSS puro, e as chaves vivem em dois arquivos. Uma
  // chave nova em `page.tsx` sem a regra correspondente deixaria o mapa inteiro
  // na cor padrão -- sem erro, sem aviso, e com aparência de funcionar.
  const lib = fs.readFileSync(
    new URL("../lib/mapa.ts", import.meta.url), "utf-8");
  const css = fs.readFileSync(
    new URL("../app/componentes/mapa-uf.module.css", import.meta.url), "utf-8");
  const bloco = lib.slice(lib.indexOf("export function camadasPadrao"));
  const chaves = [...bloco.matchAll(/chave:\s*"([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(chaves.length >= 2, `esperava camadas, achei ${chaves.length}`);
  for (const c of chaves) {
    assert.ok(css.includes(`input[value="${c}"]:checked`),
      `camada "${c}" não tem regra de cor em mapa-uf.module.css`);
    assert.ok(css.includes(`[data-${c}="4"]`),
      `camada "${c}" não tem as cinco faixas no CSS`);
  }
});

test("emContracao cobre as três preposições, e as 27 UFs", () => {
  assert.equal(emContracao("do Rio Grande do Sul"), "no Rio Grande do Sul");
  assert.equal(emContracao("da Bahia"), "na Bahia");
  assert.equal(emContracao("de Alagoas"), "em Alagoas");
  assert.equal(emContracao("do Distrito Federal"), "no Distrito Federal");
  // Entrada fora do formato volta como veio: texto estranho e visível é melhor
  // que preposição inventada, que passa despercebida.
  assert.equal(emContracao("Sergipe"), "Sergipe");
});

test("toda contração da página de estado é derivável", () => {
  // Sentinela: se alguém acrescentar uma UF com contração fora de de/do/da, a
  // frase "Como se vive ..." sai sem preposição e ninguém percebe -- ela
  // continua sendo uma frase.
  const pagina = fs.readFileSync(
    new URL("../app/estado/[uf]/page.tsx", import.meta.url), "utf-8");
  const bloco = pagina.slice(pagina.indexOf("const CONTRACAO"),
                             pagina.indexOf("function crase"));
  const valores = [...bloco.matchAll(/"((?:de|do|da) [^"]+)"/g)].map((m) => m[1]);
  assert.equal(valores.length, 27, `esperava 27 contrações, achei ${valores.length}`);
  for (const v of valores) {
    assert.notEqual(emContracao(v), v, `contração não derivável: "${v}"`);
  }
});

test("os totais do país pareiam as pontas, como taxasDoPais", () => {
  // A capa usa os totais somados por UF; as medianas e taxas vêm dos
  // municípios. Se as duas agregações discordassem, a página mostraria dois
  // números do mesmo fato -- e nenhum teste pegaria, porque cada um está certo
  // no seu caminho.
  const snapshot = JSON.parse(
    fs.readFileSync(new URL("../dados/snapshot.json", import.meta.url), "utf-8"),
  );
  const porUf = medidasDoPais(snapshot.municipios, snapshot.colunas);
  const porMunicipio = taxasDoPais(snapshot.municipios, snapshot.colunas);
  for (const m of porUf) {
    if (m.percentual === null) continue;
    const outro = porMunicipio[m.chave];
    assert.ok(outro !== null && outro !== undefined,
      `${m.chave} sem taxa pelos municípios`);
    assert.ok(Math.abs(m.percentual - outro!) < 0.01,
      `${m.chave}: ${m.percentual.toFixed(3)}% em medidasDoPais contra ` +
      `${outro!.toFixed(3)}% em taxasDoPais`);
  }
});

test("as três páginas comparam contra coisas DIFERENTES, e dizem qual", () => {
  // O risco que o componente compartilhado cria: a coluna de comparação é do
  // chamador, e trocá-la seria erro grave e invisível. No esgoto, a mediana dos
  // municípios é 32,6% e a taxa do país é 64,7% -- as duas corretas, e a página
  // continuaria bem formada com qualquer uma no lugar da outra.
  const ler = (rel: string) =>
    fs.readFileSync(new URL(rel, import.meta.url), "utf-8");
  const muni = ler("../app/municipio/[slug]/page.tsx");
  const est = ler("../app/estado/[uf]/page.tsx");

  const rotuloDe = (src: string) => {
    const i = src.indexOf("<TabelaCenso");
    assert.notEqual(i, -1, "TabelaCenso não é usada nesta página");
    const m = src.slice(i, i + 500).match(/rotulo:\s*"([^"]+)"/);
    assert.ok(m, "TabelaCenso sem rótulo de comparação");
    return m![1];
  };
  const capa = ler("../app/page.tsx");
  const rMuni = rotuloDe(muni);
  const rEst = rotuloDe(est);
  const rCapa = rotuloDe(capa);

  assert.match(rMuni, /[Mm]ediana/,
    `no município a comparação é a mediana dos municípios, achei "${rMuni}"`);
  assert.match(rEst, /Brasil/,
    `no estado a comparação é a taxa do país, achei "${rEst}"`);
  // Na capa a coluna "Aqui" JÁ é o Brasil, então a vizinha tem de ser a
  // mediana -- comparar o país com o país não diria nada.
  assert.match(rCapa, /[Mm]ediana/,
    `na capa a comparação é a mediana dos municípios, achei "${rCapa}"`);
  assert.notEqual(rMuni, rEst, "município e estado não podem comparar com o mesmo");

  // E a coluna do VALOR: "Aqui" serve ao município e ao estado, e mente na capa.
  const valorDe = (src: string) => {
    const i = src.indexOf("<TabelaCenso");
    const m = src.slice(i, i + 500).match(/rotuloValor="([^"]+)"/);
    return m ? m[1] : "Aqui";
  };
  assert.equal(valorDe(muni), "Aqui");
  assert.equal(valorDe(est), "Aqui");
  assert.match(valorDe(capa), /Brasil/,
    `na capa a coluna do valor é o país, achei "${valorDe(capa)}"`);
});

test("a página do município mantém a ressalva que separa mediana de taxa", () => {
  // Enquanto a coluna vizinha for a MEDIANA dos municípios, a página precisa
  // dizer que ela não é a taxa do país -- senão o leitor conclui que 32,6% dos
  // domicílios brasileiros têm esgoto, e são 64,7%.
  const muni = fs.readFileSync(
    new URL("../app/municipio/[slug]/page.tsx", import.meta.url), "utf-8");
  assert.ok(muni.includes("A mediana ao lado é dos municípios, não do país"),
    "a ressalva sumiu da página do município");
});

test("a unidade aparece onde informa, e some onde é ruído", () => {
  // "Pessoas" depois de "População" custava 60px por coluna e não dizia nada --
  // e foi o que fez a tabela de estados esconder a última coluna atrás da
  // rolagem. "Mil reais" depois de "PIB" é o oposto: sem ela, erra-se por mil.
  //
  // A primeira versão INFERIA isso comparando as palavras, e estava errada:
  // "população" não contém "pessoa". Declarar é o que funciona.
  assert.equal(unidadeDaColuna("populacao-censo-2022"), "");
  assert.equal(unidadeDaColuna("populacao-estimada"), "");
  assert.equal(unidadeDaColuna("pib-municipal"), "mil reais");
  assert.equal(unidadeDaColuna("indicador-que-nao-existe"), "");
});

test("todo indicador da capa tem rótulo curto", () => {
  // Sentinela: um indicador novo na capa sem rótulo curto cai no nome da
  // variável do IBGE e a tabela volta a transbordar -- sem erro e sem aviso.
  for (const c of INDICADORES_DA_CAPA) {
    assert.ok(COLUNA_DA_CAPA[c], `indicador da capa sem entrada de coluna: ${c}`);
    assert.notEqual(rotuloCurto(c, "NOME LONGO DA VARIÁVEL"), "NOME LONGO DA VARIÁVEL",
      `indicador da capa sem rótulo curto: ${c}`);
  }
});

// ------------------------------------------------------- série de funções

/** Três exercícios, com o município 1 declarando em todos menos 2022. */
function fiscalComSerie(): never {
  return {
    limites: LIMITES,
    municipios: [],
    funcoes: {
      periodo: 6,
      rotulos: ["Educação", "Saúde", "Urbanismo", "Cultura"],
      exercicios: [
        { exercicio: 2024, porMunicipio: { "1": [100, [[0, 50], [1, 30], [3, 20]]] } },
        { exercicio: 2023, porMunicipio: { "1": [200, [[0, 80], [1, 80], [2, 40]]] } },
        { exercicio: 2022, porMunicipio: {} },
      ],
    },
  } as never;
}

test("a série vai do mais ANTIGO para o mais recente", () => {
  // `exercicios` vem do mais recente porque quem quer a foto usa o primeiro.
  // Uma série se lê da esquerda para a direita no tempo, e inverter aqui é o
  // que evita cada componente reordenar por conta.
  const s = serieFuncoesDe(fiscalComSerie(), 1);
  assert.deepEqual(s.map((p) => p.exercicio), [2023, 2024]);
});

test("ano sem entrega vira BURACO, e não um ponto de zero", () => {
  // O município não gastou zero em 2022: ele não declarou. Um ponto de zero
  // desenharia uma queda que ninguém reportou.
  const s = serieFuncoesDe(fiscalComSerie(), 1);
  assert.equal(s.length, 2, "2022 não foi declarado e não pode virar ponto");
  assert.ok(!s.some((p) => p.exercicio === 2022));
});

test("o conjunto de funções é o MESMO em todos os anos", () => {
  // Se cada ano trouxesse as suas maiores, a terceira barra significaria
  // "Urbanismo" num ano e "Cultura" no outro -- e as barras empilhadas
  // pareceriam comparáveis sem ser.
  const s = serieFuncoesDe(fiscalComSerie(), 1, 2);
  const nomes = s.map((p) => p.fatias.map((f) => f.nome));
  assert.deepEqual(nomes[0], nomes[1]);
  assert.deepEqual(nomes[0], ["Educação", "Saúde", "outras 2 funções"]);
});

test("função ausente num ano vale zero, e a soma continua fechando", () => {
  // Urbanismo existe em 2023 e some em 2024. A fatia tem de aparecer com zero
  // -- omiti-la faria a barra daquele ano ter menos segmentos que a vizinha.
  const s = serieFuncoesDe(fiscalComSerie(), 1, 4);
  for (const p of s) {
    assert.equal(p.fatias.length, 4);
    assert.equal(p.fatias.reduce((a, f) => a + f.valor, 0), p.total);
  }
  const em2024 = s.find((p) => p.exercicio === 2024)!;
  assert.equal(em2024.fatias.find((f) => f.nome === "Urbanismo")!.valor, 0);
});

test("a cauda soma tudo o que não está entre as nomeadas", () => {
  const s = serieFuncoesDe(fiscalComSerie(), 1, 1);
  const em2023 = s.find((p) => p.exercicio === 2023)!;
  assert.equal(em2023.fatias[0]!.nome, "Educação");
  assert.equal(em2023.fatias[0]!.valor, 80);
  assert.equal(em2023.fatias[1]!.nome, "outras 3 funções");
  assert.equal(em2023.fatias[1]!.valor, 120);
});

test("município sem nenhuma entrega devolve série vazia", () => {
  assert.deepEqual(serieFuncoesDe(fiscalComSerie(), 999), []);
});

/**
 * Um bloco com três municípios em situações diferentes de entrega.
 *
 * `1` entregou os dois anos mais novos da coleta — o caso comum.
 * `2` parou em 2022, e tem 2022/2021/2020 seguidos.
 * `3` só tem 2022 e 2020: dois pontos com um SALTO no meio.
 */
function fiscalDesencontrado(): never {
  const f = (t: number) => [t, [[0, t * 0.6], [1, t * 0.4]]];
  return {
    limites: LIMITES,
    municipios: [],
    funcoes: {
      periodo: 6,
      rotulos: ["Educação", "Saúde"],
      exercicios: [
        { exercicio: 2024, porMunicipio: { "1": f(240) } },
        { exercicio: 2023, porMunicipio: { "1": f(200) } },
        { exercicio: 2022, porMunicipio: { "2": f(120), "3": f(130) } },
        { exercicio: 2021, porMunicipio: { "2": f(100) } },
        { exercicio: 2020, porMunicipio: { "2": f(90), "3": f(60) } },
      ],
    },
  } as never;
}

test("quem não entregou o ano mais novo mantém a seção, com o ano que tem", () => {
  // O defeito que isto fecha: 568 municípios perdiam a seção inteira -- e até
  // quatro anos dentro dela -- por não terem entrada no exercício da coleta.
  const r = funcoesRecentesDe(fiscalDesencontrado(), 2);
  assert.ok(r, "o município tem 2022, 2021 e 2020: a seção não pode sumir");
  assert.equal(r.exercicio, 2022, "recua até o mais recente QUE ELE TEM");
  assert.equal(r.total, 120);
});

test("o ano volta junto com as fatias, para o rótulo não poder divergir", () => {
  // Se o chamador tivesse de buscar o ano por fora, a página diria 2024 sobre
  // um dado de 2022 -- que é exatamente o que ela dizia antes.
  const s = fiscalDesencontrado();
  assert.equal(funcoesRecentesDe(s, 1)!.exercicio, 2024);
  assert.equal(funcoesRecentesDe(s, 2)!.exercicio, 2022);
});

test("funcoesDe NÃO recua — é o que impede somar 2022 com 2024", () => {
  // `somarFuncoes` no `lib/estado.ts` soma os totais dos municípios de um
  // estado. Se esta função recuasse, ela somaria o orçamento de 2022 de um com
  // o de 2024 do vizinho e chamaria o resultado de "total do estado". Não
  // quebraria nada: daria número. O CSV e o XLSX têm o mesmo problema, num
  // arquivo que viaja sem a explicação da página.
  const s = fiscalDesencontrado();
  assert.equal(funcoesDe(s, 2), null, "sem 2024, o agregado não recebe nada");
  assert.equal(funcoesDe(s, 1)!.exercicio, 2024);
});

test("a comparação exige anos CONSECUTIVOS, e o salto a cancela", () => {
  // A faixa de plausibilidade (0,5-3,0) foi medida de um ano para o outro:
  // mediana 1,193. De 2020 para 2022 a mediana esperada já é ~1,42, e mais
  // longe a régua reprovaria município normal como declaração quebrada.
  const s = fiscalDesencontrado();
  assert.equal(parDeFuncoes(s.funcoes!, 3), null, "2022 e 2020 não são um par");
  assert.equal(compararFuncoes(s, 3), null);
});

test("a comparação acha o par consecutivo mais recente que o município tem", () => {
  const par = parDeFuncoes(fiscalDesencontrado().funcoes!, 2);
  assert.equal(par?.atual.exercicio, 2022);
  assert.equal(par?.anterior.exercicio, 2021, "e não 2020, que é o par antigo");
  const c = compararFuncoes(fiscalDesencontrado(), 2);
  assert.equal(c?.exercicioAtual, 2022);
  assert.equal(c?.exercicioAnterior, 2021);
});

test("o salto cancela a comparação, mas NÃO a série", () => {
  // São gates diferentes: a comparação exige dois anos seguidos, a série exige
  // três pontos quaisquer. Amarrá-los fazia o mais exigente mandar nos dois.
  const s = serieFuncoesDe(fiscalDesencontrado(), 3);
  assert.deepEqual(s.map((p) => p.exercicio), [2020, 2022]);
});

// ─── O cartão de compartilhamento ──────────────────────────────────────────
//
// Achado em 07/09/2026 varrendo o `out/`: as páginas de município tinham
// `og:title` certo e **`twitter:title` genérico** — "Números Públicos", o da
// capa. E nenhuma tinha imagem. Nada disso aparece no site, na auditoria ou no
// HTML lido de passagem: só ao colar o link em algum lugar.
const { cartaoSocial } = await import("../lib/servidor.ts");

test("o cartão diz a MESMA coisa nos dois vocabulários", () => {
  // O X prefere `twitter:` quando existe, e existia — herdado do layout. O
  // resultado era o cartão da CAPA em 5.598 páginas de município e estado:
  // não um cartão faltando, um cartão ERRADO.
  const c = cartaoSocial("São Luís (MA) — dados abertos", "1.037.775 hab", "/municipio/sao-luis-ma/");
  assert.equal(c.twitter.title, c.openGraph.title);
  assert.equal(c.twitter.description, c.openGraph.description);
  assert.match(String(c.openGraph.title), /São Luís/);
});

test("o cartão leva imagem nos dois — era o que sumia ao sobrescrever openGraph", () => {
  // `generateMetadata` devolvendo `openGraph` SUBSTITUI o objeto do layout, e a
  // imagem da convenção de arquivo viajava dentro dele.
  const c = cartaoSocial("t", "d", "/x/");
  const og = c.openGraph.images as { url: string }[];
  assert.equal(og.length, 1);
  assert.match(og[0]!.url, /opengraph-image\.png$/);
  assert.equal((c.twitter.images as string[]).length, 1);
  assert.equal(c.twitter.card, "summary_large_image");
});

test("a url do cartão é absoluta e termina em barra", () => {
  // `og:url` relativo não resolve na maioria dos leitores de cartão, e a barra
  // final é o que o `trailingSlash: true` publica — divergir aqui produziria um
  // cartão apontando para o 308 em vez da página.
  const c = cartaoSocial("t", "d", "/municipio/bonito-pa/");
  assert.match(String(c.openGraph.url), /^https:\/\/.+\/municipio\/bonito-pa\/$/);
});

// ─── O ranking nacional de gasto com pessoal ───────────────────────────────
//
// Uma lista ordenada é lida como acusação, então as três recusas que o resto
// do site já pratica pesam mais aqui.
function fiscalParaRanking(): never {
  const m = (codigo: number, nome: string, uf: string, publicou: boolean,
             percentual: number | null) =>
    [codigo, nome, uf, 10000, publicou, percentual, 51.3, 0, 0];
  return {
    limites: { prudencial: 51.3, legal: 54.0 },
    municipios: [
      m(1, "Acima Um", "BA", true, 62.0),
      m(2, "Acima Dois", "BA", true, 58.0),
      m(3, "Quebrado", "BA", true, 371.02),   // erro de preenchimento
      m(4, "Prudencial", "BA", true, 52.0),
      m(5, "Tranquilo", "BA", true, 40.0),
      m(6, "Nao Entregou", "BA", false, null),
      m(5300108, "Brasília", "DF", false, null),  // presta contas como estado
    ],
  } as never;
}

test("declaração implausível NÃO é ranqueada, e também não some", () => {
  // Ranqueá-la publicaria "gastou 371% da receita com pessoal" como fato --
  // acusação a um município real, produzida por formulário preenchido errado.
  // Omiti-la faria a página afirmar que o dado não existe, quando ele existe
  // e está quebrado.
  const r = rankingPessoal(fiscalParaRanking());
  assert.deepEqual(r.acimaDoTeto.map((x) => x.nome), ["Acima Um", "Acima Dois"]);
  assert.deepEqual(r.implausiveis.map((x) => x.nome), ["Quebrado"]);
});

test("o denominador é quem ENTREGOU, e o resto vai dito", () => {
  // "2 de 5" faria parecer que 3 estão bem. A verdade é que sobre 1 não se
  // sabe nada -- a mesma distinção que a faixa `nao-consultado` mantém.
  const r = rankingPessoal(fiscalParaRanking());
  assert.equal(r.universo, 6, "o DF sai do universo: não é município");
  assert.equal(r.publicaram, 5);
  assert.equal(r.naoEntregaram, 1);
  assert.equal(r.comoEstado, 1);
});

test("quem presta contas como estado sai das DUAS contas", () => {
  // Contá-lo como faltoso é a acusação que a faixa `como-estado` impede.
  const r = rankingPessoal(fiscalParaRanking());
  assert.ok(!r.acimaDoTeto.some((x) => x.uf === "DF"));
  assert.ok(!r.implausiveis.some((x) => x.uf === "DF"));
  assert.equal(r.universo + r.comoEstado, 7);
});

test("a faixa prudencial é alerta, e não entra na lista de infração", () => {
  const r = rankingPessoal(fiscalParaRanking());
  assert.equal(r.naFaixaPrudencial, 1);
  assert.ok(!r.acimaDoTeto.some((x) => x.nome === "Prudencial"));
});

test("o limite prudencial PRÓPRIO do município manda, e não o global", () => {
  // Achado revisando, em 07/09/2026: 16 municípios declaram limite prudencial
  // proprio (57% ou 59,05%, contra 51,3% global) e em DOIS deles isso muda a
  // faixa. Recomparando com o global, o ranking os contaria em alerta enquanto
  // a página do próprio município diz que estão abaixo -- duas páginas do
  // mesmo site se contradizendo, sem nada quebrar.
  const s = fiscalParaRanking();
  (s as { municipios: unknown[] }).municipios.push(
    // 53% passa do prudencial GLOBAL (51,3) e não do próprio (57).
    [11, "Limite Proprio", "PA", 10000, true, 53.0, 57.0, 0, 0]);
  const r = rankingPessoal(s);
  assert.equal(r.naFaixaPrudencial, 1, "só o 'Prudencial' de 52% conta");
  assert.ok(!r.acimaDoTeto.some((x) => x.nome === "Limite Proprio"));
});

test("o empate se desfaz pelo nome, senão dois builds divergem", () => {
  const s = fiscalParaRanking();
  (s as { municipios: unknown[] }).municipios.push(
    [9, "Aaa Empate", "BA", 10000, true, 58.0, 51.3, 0, 0]);
  const r = rankingPessoal(s);
  assert.deepEqual(r.acimaDoTeto.map((x) => x.nome),
    ["Acima Um", "Aaa Empate", "Acima Dois"]);
});

test("ponto SEM percentual não é plausível — `null >= 0` é true em JS", () => {
  // O tipo diz `number` e o JSON em tempo de execução pode trazer `null`: o
  // TypeScript garante o contrato do código, não o do arquivo. Sem o `typeof`,
  // um ponto nulo passaria e seria desenhado como ZERO -- "não declarou"
  // virando "não gastou", que é a distinção que este projeto inteiro mantém.
  //
  // Hoje o `exportar` filtra `WHERE percentual IS NOT NULL`, então nenhum nulo
  // chega aqui. A guarda protege o dia em que alguém mexer naquele WHERE sem
  // saber que este gráfico depende dele.
  assert.equal(pontoPlausivel([2021, 1, true, null as unknown as number]), false);
  assert.equal(pontoPlausivel([2021, 1, true, undefined as unknown as number]), false);
  assert.equal(pontoPlausivel([2021, 1, true, 0]), true, "zero declarado é dado");
  assert.equal(pontoPlausivel([2021, 1, true, 54.8]), true);
  assert.equal(pontoPlausivel([2021, 1, true, 371.02]), false);
});

// ── O eixo do tempo, e a linha que se interrompe no buraco ──────────────────
//
// Escritos em 09/09/2026, depois que a varredura do RGF levou a série de 6
// pontos para 15 e a conferência de uniformidade reprovou: 286 dos 3.814
// municípios têm pontos não consecutivos, e o maior buraco desenhava 40 meses
// como um passo só.

test("o índice do quadrimestre é contínuo entre exercícios", () => {
  // A virada de ano é onde um índice ingênuo quebra: 2020/3 e 2021/1 são
  // vizinhos no tempo, e a diferença tem de ser 1 como qualquer outro par.
  assert.equal(
    indiceQuadrimestre(2021, 1) - indiceQuadrimestre(2020, 3), 1,
    "2020/3 -> 2021/1 é um passo, não um salto de ano");
  assert.equal(
    indiceQuadrimestre(2024, 3) - indiceQuadrimestre(2020, 1), 14,
    "os 15 pontos da série cobrem 14 passos");
});

test("contíguo é vizinhança NO TEMPO, não na lista", () => {
  const a: PontoSerie = [2020, 1, true, 40];
  assert.equal(contiguos(a, [2020, 2, true, 41]), true);
  assert.equal(contiguos([2020, 3, true, 41], [2021, 1, true, 42]), true);
  // Ipiranga do Norte e companhia: pularam 2020-2022 inteiros.
  assert.equal(contiguos(a, [2023, 2, true, 44]), false);
  // E o caso que o filtro de implausível cria sozinho: o ponto do meio sai da
  // lista, os vizinhos ficam adjacentes NO ARRAY e não no tempo.
  assert.equal(contiguos([2024, 1, true, 44], [2024, 3, true, 46]), false);
});

test("a distância no eixo é proporcional ao TEMPO, não à ordem", () => {
  // Sem isto os dois pares abaixo ocupariam a mesma largura, e o gráfico
  // diria que oito meses e um quadrimestre são a mesma coisa.
  const curto = indiceQuadrimestre(2024, 2) - indiceQuadrimestre(2024, 1);
  const longo = indiceQuadrimestre(2023, 1) - indiceQuadrimestre(2020, 1);
  assert.equal(curto, 1);
  assert.equal(longo, 9);
  assert.notEqual(curto, longo);
});

test("interrupcoes: uma definicao so, para o grafico e para a prosa", () => {
  const contigua: PontoSerie[] = [
    [2024, 1, true, 40], [2024, 2, true, 41], [2024, 3, true, 42],
  ];
  assert.equal(interrupcoes(contigua), 0);

  // Presidente Médici/RO, medido no snapshot de 09/09/2026: entregou os três
  // quadrimestres de 2020 e os três de 2024, e nada entre eles.
  const presidenteMedici: PontoSerie[] = [
    [2020, 1, true, 43], [2020, 2, true, 44], [2020, 3, true, 45],
    [2024, 1, true, 51], [2024, 2, true, 52], [2024, 3, true, 53],
  ];
  assert.equal(interrupcoes(presidenteMedici), 1);

  // O ponto implausível descartado abre buraco tão real quanto o não entregue:
  // sem contá-lo, o traço quebraria num lugar que o texto não menciona.
  const comImplausivel: PontoSerie[] = [
    [2024, 1, true, 40], [2024, 2, true, 371], [2024, 3, true, 42],
  ];
  assert.equal(interrupcoes(comImplausivel), 1);

  // E o contrário do teste acima, para ele não passar por vacuidade.
  assert.equal(interrupcoes([[2024, 1, true, 40]]), 0, "um ponto não interrompe");
  assert.equal(interrupcoes(undefined), 0);
});
