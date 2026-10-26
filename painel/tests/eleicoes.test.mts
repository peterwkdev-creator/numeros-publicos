/**
 * Eleições 2026: o percentual do município tem de ser o que o TSE publica
 * (`pvap`), e não uma conta própria sobre os válidos.
 *
 * O caso real é o DF: um município só, então o percentual que o bloco do
 * município calcula tem de ser IGUAL ao `pvap` da UF, candidato a candidato.
 * No governador do 1º turno há candidatos "Anulado sub judice" (1.843 votos
 * em 26/10/2026): sobre os válidos, a Celina sairia 49,99%; o TSE publica
 * 49,93%, sobre os votos de todos os candidatos.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import {
  eleicaoDoMunicipio, pctTse,
  type Eleicoes2026, type MunicipiosEleicoes,
} from "../lib/eleicoes.ts";

const ler = (caminho: string) => JSON.parse(fs.readFileSync(new URL(caminho, import.meta.url), "utf-8"));
const e = ler("../dados/eleicoes-2026.json") as Eleicoes2026;
const mm = ler("../dados/eleicoes-2026-municipios.json") as MunicipiosEleicoes;

test("eleicoes: pctTse arredonda meio para cima em inteiros e dá 0,01 a quem teve voto", () => {
  assert.equal(pctTse(2469, 20000), 12.35); // 12,345: em ponto flutuante viraria 12,34
  assert.equal(pctTse(2, 49656), 0.01); // 0,004%: o TSE publica 0,01
  assert.equal(pctTse(0, 49656), 0);
  assert.equal(pctTse(5, 0), 0);
  assert.equal(pctTse(1, 2), 50);
});

test("eleicoes: no DF (um município só) o percentual do bloco é o pvap da UF, com anulado sub judice", () => {
  const df = eleicaoDoMunicipio(e, mm, "5300108");
  assert.ok(df);
  const uf = e.governador["1"].df!;
  assert.ok(uf.anulados > 0, "o caso que importa tem voto anulado");
  const g1 = df.cargos.find((c) => c.chave === "g1")!;
  for (const l of g1.linhas) {
    const c = uf.candidatos.find((x) => x.n === l.n)!;
    if (!c.destino.startsWith("V")) { assert.equal(l.pct, null); continue; }
    assert.equal(l.pct, c.pct, `${c.nome}: bloco ${l.pct} contra pvap ${c.pct}`);
  }
  for (const chave of ["p1", "p2", "g2"] as const) {
    const g = df.cargos.find((c) => c.chave === chave);
    const ref = chave[0] === "p" ? null : e.governador["2"].df;
    if (!g || !ref) continue;
    for (const l of g.linhas) assert.equal(l.pct, ref.candidatos.find((x) => x.n === l.n)!.pct);
  }
});

test("eleicoes: 'eleito' é só st Eleito; quem vai ao 2º turno não é eleito", () => {
  const p1 = e.presidente["1"].brasil.candidatos;
  assert.equal(p1.filter((c) => c.eleito).length, 0);
  assert.equal(p1.filter((c) => c.situacao === "2º turno").length, 2);
  assert.equal(e.presidente["2"].brasil.candidatos.filter((c) => c.eleito).length, 1);
});
