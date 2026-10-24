import { nomeCompetencia, type SnapshotCaged } from "./caged";
import type { Snapshot } from "./dados";
import type { SnapshotEmendas } from "./emendas";
import type { SnapshotFiscal } from "./fiscal";
import { nomeQuadrimestre } from "./fiscal/serie";
import type { SnapshotIdeb } from "./ideb";
import { dadoAtualizadoEm, mesPorExtenso, type SnapshotInss } from "./inss";

/**
 * "Período de cada fonte", na capa (M9 (4) da auditoria de usabilidade de
 * 05/10/2026; espec `especs/numeros-publicos-novidades.md`, forma A).
 *
 * Uma linha por fonte: o período que o site cobre e a data da coleta. Nada se
 * chama "novo": a capa diz de quando é cada número, e não que ele mudou. Os
 * textos de período saem das mesmas funções das páginas onde o número aparece.
 */
export interface PeriodoDaFonte {
  fonte: string;
  periodo: string;
  /** ISO da coleta, ou `null` quando o arquivo não a registra (nunca inventada). */
  coletadoEm: string | null;
  href: string;
  /** "AAAA-MM" do fim do período, só para ordenar, do mais recente ao mais antigo.
   *  Ano sem mês é "AAAA-00": vai depois dos meses do mesmo ano, para a
   *  estimativa "2026" não passar na frente de "setembro de 2026". */
  fim: string;
}

export interface FontesDaCapa {
  snapshot: Snapshot;
  caged: SnapshotCaged;
  fiscal: SnapshotFiscal;
  ideb: SnapshotIdeb;
  emendas: SnapshotEmendas;
  inss: SnapshotInss;
}

const mes = (aaaamm: string) => `${aaaamm.slice(0, 4)}-${aaaamm.slice(4)}`;

export function periodosDasFontes(f: FontesDaCapa): PeriodoDaFonte[] {
  const linhas: PeriodoDaFonte[] = [];

  // Os indicadores do IBGE têm cada um o seu ano: o intervalo deles.
  const anos = f.snapshot.indicadores.map((i) => i.periodo).filter(Boolean).sort();
  if (anos.length > 0) {
    const [de, ate] = [anos[0]!, anos.at(-1)!];
    linhas.push({
      fonte: "IBGE (população, Censo e PIB)",
      periodo: de === ate ? de : `de ${de} a ${ate}`,
      coletadoEm: f.snapshot.geradoEm ?? null,
      href: "/explorar/",
      fim: `${ate.slice(0, 4)}-00`,
    });
  }

  const c = f.caged;
  linhas.push({
    fonte: "Novo Caged (Ministério do Trabalho)",
    periodo: `${nomeCompetencia(c.competencias[0] ?? c.competencia)} a ${nomeCompetencia(c.competencia)}`,
    coletadoEm: c.coletadoEm ?? null,
    href: "/ranking/emprego-com-carteira/",
    fim: mes(c.competencia),
  });

  const fi = f.fiscal;
  linhas.push({
    fonte: "Tesouro Nacional (SICONFI), gasto com pessoal",
    periodo: nomeQuadrimestre(fi.exercicio, fi.periodo),
    coletadoEm: fi.coletadoEm ?? null,
    href: "/ranking/gasto-com-pessoal/",
    fim: `${fi.exercicio}-${String(fi.periodo * 4).padStart(2, "0")}`,
  });

  const ed = f.ideb.edicoes;
  if (ed.length > 0) {
    linhas.push({
      fonte: "INEP (Ideb)",
      periodo: ed.length > 1 ? `edições de ${ed[0]} a ${ed.at(-1)}` : `edição de ${ed[0]}`,
      coletadoEm: f.ideb.coletadoEm ?? null,
      href: "/explorar/?i=ideb-iniciais",
      fim: `${ed.at(-1)}-00`,
    });
  }

  const e = f.emendas;
  linhas.push({
    fonte: "Portal da Transparência (CGU), emendas pagas",
    periodo: `de ${e.anos[0]} a ${nomeCompetencia(e.ultimoMes)}`,
    coletadoEm: e.coletadoEm ?? null,
    href: "/explorar/?i=emendas",
    fim: mes(e.ultimoMes),
  });

  const { fila, negados } = f.inss;
  if (fila || negados) {
    const partes = [
      fila ? `pedidos pendentes em ${mesPorExtenso(fila.mes)}` : "",
      negados ? `negados em ${mesPorExtenso(negados.mes)}` : "",
    ].filter(Boolean);
    linhas.push({
      fonte: "INSS (fila e pedidos negados)",
      periodo: partes.join(" e "),
      coletadoEm: dadoAtualizadoEm(f.inss),
      href: "/inss/",
      fim: [fila?.mes, negados?.mes].filter((m): m is string => Boolean(m)).sort().at(-1)!,
    });
  }

  // `sort` é estável: no empate, fica a ordem acima.
  return linhas.sort((a, b) => b.fim.localeCompare(a.fim));
}
