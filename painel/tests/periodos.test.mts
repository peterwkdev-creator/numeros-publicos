/**
 * "Período de cada fonte", na capa: a linha diz de quando é o número e não
 * pode contradizer a página onde ele aparece.
 * Espec: `especs/numeros-publicos-novidades.md`, §4.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";

import { periodosDasFontes, type FontesDaCapa } from "../lib/periodos.ts";
import { fonteDoIndicador, INDICADORES_EXPLORAR, type FontesExplorar } from "../lib/explorar.ts";
import { dataCurta, type Snapshot } from "../lib/dados.ts";
import type { SnapshotCaged } from "../lib/caged.ts";
import type { SnapshotEmendas } from "../lib/emendas.ts";
import type { SnapshotFiscal } from "../lib/fiscal.ts";
import type { SnapshotIdeb } from "../lib/ideb.ts";
import type { SnapshotInss } from "../lib/inss.ts";

const ler = (nome: string) =>
  JSON.parse(fs.readFileSync(new URL(`../dados/${nome}`, import.meta.url), "utf-8"));
const fontes: FontesDaCapa = {
  snapshot: ler("snapshot.json") as Snapshot,
  caged: ler("caged.json") as SnapshotCaged,
  fiscal: ler("fiscal.json") as SnapshotFiscal,
  ideb: ler("ideb.json") as SnapshotIdeb,
  emendas: ler("emendas.json") as SnapshotEmendas,
  inss: ler("inss.json") as SnapshotInss,
};
const explorar: FontesExplorar = { ...fontes, idebFinais: ler("ideb-finais.json") as SnapshotIdeb };
const linhas = periodosDasFontes(fontes);
const linha = (inicio: string) => {
  const l = linhas.find((x) => x.fonte.startsWith(inicio));
  assert.ok(l, `sem linha de ${inicio}`);
  return l;
};
const notaDoExplorar = (chave: string) =>
  fonteDoIndicador(INDICADORES_EXPLORAR.find((i) => i.chave === chave)!, explorar);

test("uma linha por fonte, do período mais recente ao mais antigo", () => {
  assert.equal(linhas.length, 6);
  const fins = linhas.map((l) => l.fim);
  assert.deepEqual(fins, [...fins].sort().reverse());
  for (const l of linhas) assert.match(l.fim, /^\d{4}-\d{2}$/);
});

test("prova 1: o período é o mesmo texto da página onde o número aparece", () => {
  // O Explorar escreve a nota de fonte de cada indicador com as mesmas funções.
  assert.ok(notaDoExplorar("caged").includes(linha("Novo Caged").periodo));
  assert.ok(notaDoExplorar("pessoal").includes(linha("Tesouro").periodo));
  const ed = fontes.ideb.edicoes;
  assert.ok(notaDoExplorar("ideb-iniciais").includes(`edição de ${ed.at(-1)}`));
  assert.ok(linha("INEP").periodo.endsWith(String(ed.at(-1))));
  // A data da coleta é a mesma que o Explorar mostra.
  assert.ok(notaDoExplorar("caged").includes(dataCurta(linha("Novo Caged").coletadoEm)));
  assert.ok(notaDoExplorar("pessoal").includes(dataCurta(linha("Tesouro").coletadoEm)));
});

test("prova 2: nenhuma linha chama o dado de novo", () => {
  for (const l of linhas) {
    // "Novo Caged" é o nome da fonte, não um adjetivo do dado.
    const texto = `${l.fonte} ${l.periodo}`.replace("Novo Caged", "Caged");
    assert.doesNotMatch(texto, /\bnov[oa]s?\b|novidade/i);
  }
});

test("prova 3: fonte sem data de coleta fica sem data, nunca inventada", () => {
  const semData = periodosDasFontes({
    ...fontes,
    caged: { ...fontes.caged, coletadoEm: undefined } as unknown as SnapshotCaged,
    inss: { ...fontes.inss, fila: fontes.inss.fila && { ...fontes.inss.fila, gravadoEm: undefined },
      negados: fontes.inss.negados && { ...fontes.inss.negados, gravadoEm: undefined } } as unknown as SnapshotInss,
  });
  assert.equal(semData.find((l) => l.fonte.startsWith("Novo Caged"))!.coletadoEm, null);
  assert.equal(semData.find((l) => l.fonte.startsWith("INSS"))!.coletadoEm, null);
});

test("prova 4: trocar a competência do Caged muda a linha e a ordem", () => {
  const velho = periodosDasFontes({ ...fontes, caged: { ...fontes.caged, competencia: "201901" } });
  const l = velho.find((x) => x.fonte.startsWith("Novo Caged"))!;
  assert.ok(l.periodo.endsWith("janeiro de 2019"));
  assert.equal(velho.at(-1), l);
});

test("os links levam a páginas que existem", () => {
  for (const l of linhas) {
    const rota = l.href.split("?")[0]!.replace(/^\/|\/$/g, "");
    assert.ok(fs.existsSync(new URL(`../app/${rota}/page.tsx`, import.meta.url)), l.href);
  }
});
