/**
 * Mede a latência de interação dos DOIS campos da capa, com CPU de celular.
 *
 *     npm run medir-inp        # precisa de `npm run start` noutro terminal
 *
 * INP é o Core Web Vital mais reprovado da web, e a capa tem os dois únicos
 * pontos interativos do site:
 *
 * | campo | o que faz | o que a escala multiplicou |
 * |---|---|---|
 * | `[role=combobox]` do cabeçalho | abre a lista de sugestões | índice de 5.571 registros |
 * | `input[type=search]` da tabela | refiltra a tabela | **5.571 linhas** |
 *
 * ## Por que ele mede os dois, e por que isso é a correção de 10/09/2026
 *
 * A versão anterior pegava o campo com
 * `querySelector('input[type="search"], input[type="text"]')` — e uma lista de
 * seletores **não tem prioridade**: `querySelector` devolve o primeiro em ordem
 * de **documento** que case com qualquer um deles. O combobox do cabeçalho vem
 * antes na página, então ele era sempre o escolhido, enquanto o docstring dizia
 * medir *"buscar e ordenar 5.571 linhas"*. **O filtro da tabela nunca foi
 * medido** — justamente o que a expansão de 1.794 para 5.571 multiplicou.
 *
 * E o próprio script imprimia o delator: `linhas antes: 97 → depois: 97`. A
 * tabela não mudava, e ele concluía *"passa"* assim mesmo. Ninguém viu porque
 * ele **não tinha entrada no `package.json`** e por isso nunca era rodado — um
 * instrumento que ninguém executa apodrece sem avisar.
 *
 * ## A regra que ficou: número sem efeito não é medição
 *
 * Cada campo declara o efeito que a digitação **tem de** provocar — a tabela
 * encolhe, a lista abre. Sem o efeito, a latência descreve teclas caindo no
 * vazio, e o script **reprova** em vez de imprimir um número tranquilizador.
 *
 * ## Mediana de três rodadas, e não o pior caso de uma (06/10/2026)
 *
 * O CI roda num executor compartilhado. A publicação `f510024` reprovou aqui
 * com 216 ms no filtro da tabela, numa mudança que não o tocava; as duas
 * publicações anteriores tinham dado 80 e 56, e a busca, intocada, subiu de
 * 80 para 160 na mesma rodada. Em casa, com e sem a mudança: 72/64/48 contra
 * 72/72/88. A segunda tentativa do CI, sem mudar nada, deu 48. O pior caso de
 * UMA amostra mede o executor tanto quanto o código.
 *
 * Cada campo roda `RODADAS` vezes, numa página nova a cada vez, e reprova
 * pela **mediana dos piores casos**: uma rodada lenta sozinha não barra, duas
 * barram. As três são impressas, para a oscilação ficar à vista. O efeito
 * continua cobrado em TODA rodada: uma rodada sem efeito é medição inválida,
 * e a mediana não a apaga.
 */
import puppeteer from "puppeteer-core";

const ALVO = process.argv[2] ?? "http://127.0.0.1:8791/";
const LIMIAR = 200; // limiar de INP "bom", em ms
const RODADAS = 3; // ímpar, para a mediana ser uma das medidas

/** Os dois campos, cada um com o efeito que prova que a digitação chegou. */
const CAMPOS = [
  {
    nome: "busca do cabeçalho (combobox)",
    seletor: '[role="combobox"]',
    termo: "imperatriz",
    // O índice chega por `fetch` no primeiro foco: sem esperar, a lista ainda
    // não existe e o efeito não aconteceria por motivo nenhum.
    esperar: 'document.querySelectorAll("[role=option]").length > 0',
    efeito: () => document.querySelectorAll('[role="option"]').length,
    descreve: (a, d) => `opções na lista: ${a} → ${d}`,
    mudou: (a, d) => d > a,
  },
  {
    nome: "filtro da tabela (5.571 linhas)",
    seletor: 'input[type="search"]',
    termo: "imperatriz",
    esperar: null,
    efeito: () => document.querySelectorAll("tbody tr").length,
    descreve: (a, d) => `linhas na tabela: ${a} → ${d}`,
    mudou: (a, d) => d !== a,
  },
];

const nav = await puppeteer.launch({
  executablePath: process.env.CHROME
    ?? "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
});

let reprovou = false;

/**
 * Uma rodada de um campo numa página nova. Devolve as latências ordenadas e o
 * efeito, ou `null` se o campo não existe.
 */
async function rodada(campo) {
  // Página nova por rodada: estado de uma não pode vazar para a outra, e a
  // lista aberta do combobox mudaria a contagem de linhas do teste seguinte.
  const p = await nav.newPage();
  await p.setViewport({ width: 1280, height: 900 });

  // CPU 4x mais lenta: um celular mediano, que é onde INP reprova.
  const cdp = await p.createCDPSession();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await p.goto(ALVO, { waitUntil: "networkidle0", timeout: 60000 });
  await p.evaluateHandle("document.fonts.ready");

  const alvo = await p.$(campo.seletor);
  if (!alvo) {
    await p.close();
    return null;
  }

  // O observador entra ANTES da digitação, senão as primeiras teclas — que são
  // as mais lentas, porque carregam o primeiro trabalho — ficam de fora.
  await p.evaluate(() => {
    window.__lat = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.duration > 0) window.__lat.push(e.duration);
      }
    }).observe({ type: "event", durationThreshold: 0, buffered: true });
  });

  await alvo.click();
  if (campo.esperar) await p.waitForFunction(campo.esperar, { timeout: 15000 });
  const antes = await p.evaluate(campo.efeito);

  for (const c of campo.termo) {
    await p.keyboard.type(c);
    await new Promise((r) => setTimeout(r, 90));
  }
  await new Promise((r) => setTimeout(r, 700));

  const depois = await p.evaluate(campo.efeito);
  const d = (await p.evaluate(() => window.__lat)).sort((a, b) => a - b);
  await p.close();
  return { antes, depois, d };
}

for (const campo of CAMPOS) {
  console.log(`\n━━━ ${campo.nome}`);
  const piores = [];

  for (let i = 1; i <= RODADAS; i++) {
    const r = await rodada(campo);
    if (!r) {
      console.error(`  NÃO ACHEI o campo (${campo.seletor})`);
      reprovou = true;
      break;
    }
    const { antes, depois, d } = r;
    if (!d.length) {
      console.error(`  rodada ${i}: NENHUM evento medido — a digitação não gerou interação.`);
      reprovou = true;
    } else {
      const q = (f) => d[Math.min(Math.floor(d.length * f), d.length - 1)];
      const pior = d[d.length - 1];
      piores.push(pior);
      console.log(`  rodada ${i}: ${campo.descreve(antes, depois)} · `
        + `${d.length} eventos · p50 ${q(0.5).toFixed(0)}ms · `
        + `p98 ${q(0.98).toFixed(0)}ms · pior ${pior.toFixed(0)}ms`);
    }

    // O efeito é o que separa "medi a interação" de "medi teclas caindo no
    // vazio". Sem ele o número acima não descreve nada, e imprimi-lo como
    // aprovação é pior que não medir.
    if (!campo.mudou(antes, depois)) {
      console.error(`  rodada ${i}: REPROVA — a digitação não produziu efeito `
        + "nenhum, e a latência não mede este campo.");
      reprovou = true;
    }
  }

  if (piores.length === RODADAS) {
    const mediana = [...piores].sort((a, b) => a - b)[(RODADAS - 1) / 2];
    if (mediana > LIMIAR) {
      console.error(`  REPROVA: mediana dos piores casos ${mediana.toFixed(0)}ms > ${LIMIAR}ms`);
      reprovou = true;
    } else {
      console.log(`  passa: mediana dos piores casos ${mediana.toFixed(0)}ms `
        + `(limiar "bom" = ${LIMIAR}ms)`);
    }
  } else if (piores.length > 0) {
    console.error(`  REPROVA: só ${piores.length} de ${RODADAS} rodadas mediram algo.`);
    reprovou = true;
  }
}

await nav.close();
// `exitCode` e não `process.exit()`: no Windows sair com requisição em voo
// aborta o processo e o código de saída se perde. Já pago no `indexnow.mjs`.
if (reprovou) process.exitCode = 1;
