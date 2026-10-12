/**
 * Emendas parlamentares pagas à prefeitura, na página do município. **Módulo
 * puro.**
 *
 * O arquivo (`dados/emendas.json`) vem de `python -m numeros_publicos
 * emendas-exportar`, que só o escreve com a soma fechada contra o banco; o
 * banco, por sua vez, só foi gravado com o total igual ao CSV da CGU ao
 * centavo. Aqui não se recalcula nada da fonte: só se escolhe o ano e se
 * converte centavo em real.
 *
 * ## O que a página diz, e este módulo sustenta
 *
 * - **Só 2025 e o ano corrente na página.** Até 2024, parte do dinheiro de
 *   emendas era paga ao Banco do Brasil, sem o município de destino, e em
 *   2025 isso acaba: barras de 2015 a 2026 mostrariam um salto que é em boa
 *   parte mudança de registro (a espec, armadilha 2). A série inteira vai
 *   para o CSV, com a nota.
 * - **Ausência não é zero.** Ano sem nenhum pagamento é `null`; zero é a
 *   soma de pagamentos que se anulam.
 * - **Estorno passa com o sinal.** Um ano (ou tipo) em que os estornos
 *   superam os pagamentos tem saldo negativo, e é isso que se mostra.
 */

import type { FatiaFuncao } from "./fiscal";
import { expandir, type Snapshot } from "./dados";

/** `[código IBGE, centavos por ano, centavos por tipo no ano dos tipos]`. */
export type LinhaEmendas = [number, (number | null)[], (number | null)[]];

export type SnapshotEmendas = {
  fonte: string;
  origem: string;
  /** Data do arquivo da CGU, ISO sem fuso (a hora do zip). */
  dataArquivo: string;
  sha256: string;
  /** O último mês com pagamento no arquivo, `AAAAMM`. */
  ultimoMes: string;
  coletadoEm: string | null;
  anos: number[];
  /** O último ano cheio: o da divisão por tipo. */
  anoTipos: number;
  tipos: string[];
  municipios: LinhaEmendas[];
};

/** Os nomes da fonte, curtos para a tabela. Tipo sem rótulo usa o da fonte. */
const ROTULOS: Record<string, string> = {
  "Emenda Individual - Transferências Especiais": "Individual: transferência especial",
  "Emenda Individual - Transferências com Finalidade Definida":
    "Individual: finalidade definida",
  "Emenda de Bancada": "De bancada estadual",
  "Emenda de Comissão": "De comissão",
  "Emenda de Relator": "De relator",
};

export function rotuloDoTipo(tipo: string): string {
  return ROTULOS[tipo] ?? tipo;
}

/** Um ano: `reais` é `null` quando não houve pagamento nenhum. */
export type AnoEmendas = { ano: number; reais: number | null };

export type EmendasMunicipio = {
  /** Toda a série do arquivo, para o CSV. */
  anos: AnoEmendas[];
  /** O último ano cheio (o dos tipos) e o ano corrente, parcial. */
  cheio: AnoEmendas;
  parcial: AnoEmendas | null;
  /** Os tipos do ano cheio, do maior para o menor; só os que tiveram pagamento. */
  tipos: FatiaFuncao[];
  /** Algum pagamento no ano cheio ou no parcial: decide se há o que mostrar. */
  temRecente: boolean;
};

/**
 * Até este ano, parte do dinheiro de emendas era paga ao Banco do Brasil, sem
 * o município de destino: R$ 19,27 bi em 2024 contra R$ 0,15 bi em 2025 (a
 * espec, armadilha 2). Os downloads levam a série inteira com esta ressalva.
 */
export const ULTIMO_ANO_VIA_BB = 2024;

/**
 * Os dois que não têm prefeitura, com o porquê. Sem isto a página diria
 * "nenhum pagamento à prefeitura de Brasília", que é verdade e insinua uma
 * prefeitura que não existe (decisão de 09/10/2026). O teste confere que
 * nenhum dos dois tem pagamento no arquivo: se um dia tiver, alguém olha.
 */
export const SEM_PREFEITURA: ReadonlyMap<number, string> = new Map([
  [5300108, "o Distrito Federal recebe emendas como ente estadual"],
  [2605459, "é distrito estadual, administrado pelo governo de Pernambuco"],
]);

const reais = (centavos: number | null | undefined): number | null =>
  centavos === null || centavos === undefined ? null : centavos / 100;

const cacheIndice = new WeakMap<object, Map<number, LinhaEmendas>>();

/** As emendas de um município, ou `null` se o código não está no arquivo. */
export function emendasDe(e: SnapshotEmendas, codigo: number): EmendasMunicipio | null {
  let indice = cacheIndice.get(e.municipios);
  if (!indice) {
    indice = new Map(e.municipios.map((l) => [l[0], l]));
    cacheIndice.set(e.municipios, indice);
  }
  const l = indice.get(codigo);
  if (!l) return null;
  const anos = e.anos.map((ano, i) => ({ ano, reais: reais(l[1][i]) }));
  const doAno = (ano: number) => anos.find((a) => a.ano === ano) ?? { ano, reais: null };
  const cheio = doAno(e.anoTipos);
  const ultimo = Number(e.ultimoMes.slice(0, 4));
  const parcial = ultimo > e.anoTipos ? doAno(ultimo) : null;
  const total = cheio.reais;
  const tipos = e.tipos
    .map((tipo, i) => ({ tipo, valor: reais(l[2][i]) }))
    .filter((t): t is { tipo: string; valor: number } => t.valor !== null)
    .map(({ tipo, valor }) => ({
      nome: rotuloDoTipo(tipo),
      valor,
      percentual: total !== null && total > 0 ? (valor * 100) / total : null,
    }))
    .sort((a, b) => b.valor - a.valor);
  return {
    anos, cheio, parcial, tipos,
    temRecente: cheio.reais !== null || (parcial?.reais ?? null) !== null,
  };
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * Reais por habitante, ou `null` sem pagamento no ano ou sem população.
 *
 * A população é a ESTIMADA do IBGE, a mais perto do ano do dinheiro (o Censo
 * de 2022 fica três anos atrás de 2025); a página diz o ano dela.
 */
export function porHabitante(
  reais: number | null | undefined, populacao: number | null | undefined,
): number | null {
  return typeof reais === "number" && populacao ? reais / populacao : null;
}

const cachePorUf = new WeakMap<object, WeakMap<object, Map<string, number[]>>>();

/**
 * O valor por habitante, no ano cheio, de cada município da UF que teve
 * pagamento e tem população: a régua contra a qual a página situa um deles.
 *
 * Calculado uma vez para as 27 UFs e guardado pela identidade dos dois
 * arquivos: são 5.571 páginas pedindo a mesma lista.
 */
export function porHabitanteDaUf(e: SnapshotEmendas, snapshot: Snapshot, uf: string): number[] {
  let porSnapshot = cachePorUf.get(e);
  if (!porSnapshot) {
    porSnapshot = new WeakMap();
    cachePorUf.set(e, porSnapshot);
  }
  let porUf = porSnapshot.get(snapshot);
  if (!porUf) {
    porUf = new Map();
    const i = e.anos.indexOf(e.anoTipos);
    const pagos = new Map(e.municipios.map((l) => [l[0], reais(l[1][i])]));
    for (const m of expandir(snapshot)) {
      const v = porHabitante(pagos.get(m.codigo), m.valores["populacao-estimada"]);
      if (v === null) continue;
      const lista = porUf.get(m.uf);
      if (lista) lista.push(v);
      else porUf.set(m.uf, [v]);
    }
    porSnapshot.set(snapshot, porUf);
  }
  return porUf.get(uf) ?? [];
}

/**
 * As emendas de um conjunto de municípios (os de um estado), somadas no ano
 * cheio e no parcial, e quantos tiveram algum pagamento no ano cheio.
 *
 * Ausência continua não sendo zero: sem nenhum pagamento no conjunto, o ano
 * sai `null`. Código ausente do arquivo não entra em nada.
 */
export function emendasDeVarios(e: SnapshotEmendas, codigos: Iterable<number>): {
  cheio: AnoEmendas; parcial: AnoEmendas | null; comPagamento: number;
} {
  const ultimo = Number(e.ultimoMes.slice(0, 4));
  const anoParcial = ultimo > e.anoTipos ? ultimo : null;
  let cheio: number | null = null;
  let parcial: number | null = null;
  let comPagamento = 0;
  for (const codigo of codigos) {
    const um = emendasDe(e, codigo);
    if (!um) continue;
    if (um.cheio.reais !== null) {
      cheio = (cheio ?? 0) + um.cheio.reais;
      comPagamento += 1;
    }
    if (um.parcial?.reais != null) parcial = (parcial ?? 0) + um.parcial.reais;
  }
  return {
    cheio: { ano: e.anoTipos, reais: cheio },
    parcial: anoParcial === null ? null : { ano: anoParcial, reais: parcial },
    comPagamento,
  };
}

/** `"202609"` → `"setembro"`: o mês de corte do ano parcial. */
export function mesDeCorte(ultimoMes: string): string {
  return MESES[Number(ultimoMes.slice(4)) - 1]!;
}
