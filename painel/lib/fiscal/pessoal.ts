/**
 * O limite de pessoal da LRF: as faixas, os entes que não são município, a
 * regra única que decide a faixa de uma linha (`faixaDaLinha`) e a série de
 * pessoal com a mesma condenação do cartão.
 */

import type { Faixa, LinhaFiscal, PontoSerie, SnapshotFiscal } from "./tipos";
import { LIMITE_PLAUSIVEL, MINIMO_PLAUSIVEL, pontoPlausivel } from "./serie";

/**
 * O rótulo de cada faixa.
 *
 * **`sem-dado` e `nao-consultado` são coisas diferentes, e confundi-las é
 * caluniar.** "Sem relatório entregue" é uma afirmação sobre o município;
 * "ainda não consultado" é uma afirmação sobre nós. Até 03/09/2026 as duas
 * colapsavam no mesmo rótulo — o que era inofensivo enquanto a varredura
 * cobria 100% do universo, e virou falso no instante da expansão nacional, com
 * 3.777 municípios ainda não varridos sendo acusados de não prestar contas.
 */
export const ROTULO_FAIXA: Record<Faixa, string> = {
  // Auditoria de termos (M4, M6, 26/10/2026): "acima do limite prudencial"
  // parecia incluir quem passou do teto, "dentro do limite" não dizia de
  // qual, e "implausível" é palavra de estatístico. A planilha segue com o
  // rótulo antigo (`ROTULO_FAIXA_ARQUIVO`): quem filtra por ele não quebra.
  implausivel: "Valor impossível — provável erro de preenchimento",
  "acima-legal": "Acima do teto legal",
  "acima-prudencial": "Entre o limite prudencial e o teto",
  abaixo: "Abaixo do limite prudencial",
  "sem-dado": "Sem relatório entregue",
  "nao-consultado": "Ainda não consultado",
  "como-estado": "Presta contas como estado, não como município",
  "nao-instalado": "Ainda não instalado no período",
};

/**
 * O rótulo da faixa como sai na planilha (`municipios.xlsx`): o de antes da
 * auditoria de termos de 26/10/2026, congelado. A página fala com o leitor
 * (`ROTULO_FAIXA`); a planilha é filtrada por quem já a usa, e valor de
 * coluna trocado quebra o filtro dele.
 */
export const ROTULO_FAIXA_ARQUIVO: Record<Faixa, string> = {
  ...ROTULO_FAIXA,
  implausivel: "Valor implausível — provável erro de preenchimento",
  "acima-prudencial": "Acima do limite prudencial",
  abaixo: "Dentro do limite",
};

/**
 * A faixa como ela sai nos CSVs — a coluna `pessoal_situacao`.
 *
 * Até 22/09/2026 os CSVs largos traziam `pessoal_pct_rcl` sem a faixa, e os 40
 * percentuais que a página marca como erro de preenchimento saíam como número
 * comum: Planalto Alegre/SC, com 99,69% sobre uma RCL desmentida, era a
 * prefeitura mais comprometida do estado para quem abrisse o arquivo. É a
 * lição do `pessoal_publicou` de Brasília: **o arquivo viaja sem a explicação
 * da página**, e é ele que alguém republica.
 *
 * Código e não o rótulo por extenso: no CSV quem lê é quem filtra, e
 * `implausivel` se filtra sem acento nem espaço. O XLSX, lido por gente, leva o
 * rótulo — ver `ROTULO_FAIXA`.
 */
export const CODIGO_FAIXA: Record<Faixa, string> = {
  implausivel: "implausivel",
  "acima-legal": "acima_limite_legal",
  "acima-prudencial": "acima_limite_prudencial",
  abaixo: "dentro_do_limite",
  "sem-dado": "sem_relatorio",
  "nao-consultado": "nao_consultado",
  "como-estado": "presta_contas_como_estado",
  "nao-instalado": "nao_instalado_no_periodo",
};

/**
 * Entes que o IBGE lista como município mas que **não entregam RGF municipal**,
 * porque não são municípios.
 *
 * Hoje só o Distrito Federal (5300108). Ele entrega o Anexo 01 normalmente —
 * conferido na fonte em 04/09/2026, `co_esfera=E&id_ente=53`, 215 itens,
 * "Governo do Distrito Federal". O que ele não faz, e nunca fará, é entregar
 * como *município*.
 *
 * **Sem esta distinção o site acusava Brasília de não prestar contas**, e
 * dizia "sobre ele não se sabe" a respeito de um ente que publica tudo. É o
 * mesmo erro que a faixa `nao-consultado` existe para impedir, uma casa
 * adiante: ali se confundia "não perguntamos" com "não entregou"; aqui,
 * "perguntamos no lugar errado" com "não entregou".
 *
 * Lista literal, e não regra: é **um** ente entre 5.571, e uma regra inferida
 * ("todo ente cujo código termina em 5300108") seria fingir generalidade que
 * não existe. Se aparecer outro, entra aqui com a consulta que o comprovou.
 */
export const PRESTA_COMO_ESTADO: ReadonlySet<number> = new Set([5300108]);

/**
 * Municípios instalados DEPOIS de algum exercício que o snapshot cobre: o ano
 * em que a prefeitura passou a existir.
 *
 * Hoje só Boa Esperança do Norte/MT (5101837). Criado pela Lei Estadual 7.264,
 * de 29/03/2000, e **instalado em 01/01/2025**, com o primeiro prefeito eleito
 * em 06/10/2024 — conferido em 06/10/2026 na agência do IBGE ("IBGE atualiza
 * estruturas territoriais do país", notícia 43213). Até 31/12/2024 não havia
 * prefeitura para entregar o RGF de 2024.
 *
 * **Sem esta distinção o site dizia que ele "não entregou o Relatório de
 * Gestão Fiscal do 3º quadrimestre de 2024"**, e o contava entre os que não
 * entregaram em Mato Grosso. É o erro de `PRESTA_COMO_ESTADO` no eixo do
 * tempo: lá se perguntava na esfera errada, aqui no ano errado.
 *
 * Lista literal, pelo mesmo motivo daquela: é um ente, e a data vem de uma
 * fonte conferida, não de uma regra inferida.
 */
export const INSTALADO_EM: ReadonlyMap<number, number> = new Map([[5101837, 2025]]);

/** Quantos municípios de `INSTALADO_EM` ainda não existiam como prefeitura no
 *  exercício. O SICONFI os consulta e não acha relatório, então a conta
 *  `cobertura.consultados - cobertura.publicaram` os poria entre os que não
 *  entregaram: quem lê a cobertura desconta estes. A regra é a de `faixaDe`. */
export function naoInstaladosEm(exercicio: number): number {
  let n = 0;
  for (const ano of INSTALADO_EM.values()) if (exercicio < ano) n++;
  return n;
}

/** Onde o município cai em relação aos dois limites da Lei de
 *  Responsabilidade Fiscal. Sem percentual, a resposta é "não sei" — e "não
 *  sei" nunca pode virar "está abaixo". */
export function faixaDe(
  percentual: number | null,
  limitePrudencial: number | null,
  limites: SnapshotFiscal["limites"],
  /** `null` = ainda não consultado; `false` = consultado e não entregou. */
  publicou: boolean | null = false,
  /** O código IBGE, para reconhecer quem presta contas como estado e quem
   *  ainda não estava instalado. */
  codigo?: number,
  /** O exercício do período em destaque; sem ele, não se testa a instalação. */
  exercicio?: number,
): Faixa {
  // Antes de tudo: quem não é município não deixou de entregar relatório de
  // município. Perguntar na esfera errada e registrar a ausência como falta
  // é acusação sem lastro -- ver `PRESTA_COMO_ESTADO`.
  if (codigo !== undefined && PRESTA_COMO_ESTADO.has(codigo)) {
    return "como-estado";
  }
  // Nem quem ainda não existia como prefeitura -- ver `INSTALADO_EM`.
  const instalado = codigo !== undefined ? INSTALADO_EM.get(codigo) : undefined;
  if (instalado !== undefined && exercicio !== undefined && exercicio < instalado) {
    return "nao-instalado";
  }
  // A ordem importa: "não perguntamos" vem ANTES de qualquer leitura do
  // percentual, porque sem consulta não há percentual para interpretar.
  if (publicou === null) return "nao-consultado";
  if (percentual === null) return "sem-dado";
  if (percentual > LIMITE_PLAUSIVEL) return "implausivel";
  if (percentual < MINIMO_PLAUSIVEL) return "implausivel";
  if (percentual > limites.legal) return "acima-legal";
  if (percentual > (limitePrudencial ?? limites.prudencial)) {
    return "acima-prudencial";
  }
  return "abaixo";
}

/**
 * Acima disto, a RCL que o município declarou no RGF não descreve o caixa dele.
 *
 * Medido em 22/09/2026 sobre 3.240 municípios que entregaram os dois
 * relatórios de 2024: a receita corrente (RREO) dividida pela RCL **ajustada**
 * (RGF) — o denominador do percentual — tem mediana **1,041**, p95 1,16 e
 * p99 2,03. São duas declarações do mesmo caixa, e na prática batem. Acima de
 * 2,0 a RCL é que está baixa demais, e o percentual de pessoal sai inflado.
 * Remedido em 12/10/2026, com o RGF e o RREO Simplificados: 5.539 municípios,
 * mediana 1,039, p95 1,16, p99 1,41; 36 acima de 2,0 e 6 abaixo de 0,5.
 *
 * **O limite NÃO tem folga sobre o p99, e o argumento é outro:** todos os 34
 * municípios acima de 2,0 foram examinados um a um. 26 já eram implausíveis
 * pela faixa (mais de 100%); os 8 restantes têm a série quebrando no mesmo
 * quadrimestre em que a razão estoura. A primeira versão deste comentário
 * citava a distribuição contra a RCL **bruta** (1,000/1,13/1,93) — outra
 * grandeza, e o erro do `numeros-publicos.md`: limiar calibrado carrega a
 * distância junto.
 *
 * **Só este lado.** Abaixo de 0,5 o suspeito é o RREO (Apiaí/SP, Porto
 * Calvo/AL), e aí o percentual de pessoal não fica sob suspeita nenhuma.
 */
export const RAZAO_RECEITA_RCL_MAXIMA = 2.0;

/**
 * A segunda cláusula: razão ALTA sozinha não basta; com o SALTO, basta.
 *
 * Achada no mesmo dia, lendo o ranking depois da primeira versão da regra: ela
 * tirou oito municípios do topo e **promoveu ao 1º lugar Promissão/SP**, com
 * razão 1,92 — a mesma patologia, logo abaixo do limite. O limite fora
 * escolhido pela distribuição, não pelo que separa os casos.
 *
 * O que separa é o MECANISMO. Se a RCL foi declarada k vezes menor, a razão
 * sobe para ~1,04·k **e** o percentual salta k vezes sobre a própria história
 * do município. Nos quebrados os dois batem — Promissão: razão/1,04 = 1,85,
 * salto 1,81; Rubinéia/SP: 1,51 e 1,61; Gália/SP: 1,44 e 1,52. Nos casos
 * reais a razão sobe sem o salto — Pontalinda/SP: 1,38 e 1,04; Turmalina/SP:
 * 1,36 e 0,97 —, e eles continuam acusados, como devem.
 *
 * 1,4 está bem além do p95 da razão (1,16); 1,3 é um salto de 30% num
 * quadrimestre sobre a mediana dos últimos seis. Nenhum dos dois sozinho
 * separaria os grupos; juntos, separaram todos os casos examinados.
 */
export const RAZAO_RECEITA_RCL_COM_SALTO = 1.4;
export const SALTO_MINIMO = 1.3;

/**
 * Quanto o percentual do período em destaque passa da mediana dos últimos
 * seis períodos plausíveis do próprio município. `null` com menos de três
 * pontos: sem história, não há salto a medir — e ausência de régua não é
 * reprovação.
 */
export function saltoSobreAHistoria(
  s: SnapshotFiscal,
  codigo: number,
  percentual: number,
): number | null {
  const anteriores = (s.serie[String(codigo)] ?? [])
    .filter(([ex, pe]) => !(ex === s.exercicio && pe === s.periodo))
    .filter(pontoPlausivel)
    .map(([, , , v]) => v)
    .slice(-6);
  if (anteriores.length < 3) return null;
  const ord = [...anteriores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  const med = ord.length % 2 ? ord[meio]! : (ord[meio - 1]! + ord[meio]!) / 2;
  return med > 0 ? percentual / med : null;
}

/**
 * `true` quando a receita corrente declarada pelo próprio município é mais que
 * o dobro da RCL sobre a qual ele calculou o percentual de pessoal.
 *
 * Achado em 22/09/2026: **oito municípios** estavam no ranking de "acima do
 * limite legal", seis deles entre as sete primeiras posições — inclusive o
 * primeiro —, com 71% a 99% declarados. As séries contam a mesma história:
 * Aparecida/SP ficou entre 44% e 52% por treze quadrimestres e saltou para
 * 93%; Juruá/AM, de 33–44% para 84%. Folha não dobra num quadrimestre;
 * declaração quebra.
 *
 * **O primeiro lugar quebrou por outro caminho**, e é por isso que a régua é a
 * RCL ajustada: Planalto Alegre/SC tem receita corrente IGUAL à RCL bruta
 * (razão 1,00), e uma RCL ajustada de 43% da bruta — no país, o ajuste deixa
 * 98% em mediana e 89% no p1. Contra a bruta ele passaria; contra o
 * denominador que o percentual de fato usa, não.
 *
 * Só compara o MESMO exercício: receita de um ano contra RCL de outro não diz
 * nada sobre nenhum dos dois.
 */
export function rclDesmentida(
  s: SnapshotFiscal,
  codigo: number,
  rclAjustada: number | null,
  percentual: number | null,
): boolean {
  const razao = razaoReceitaRcl(s, codigo, rclAjustada);
  if (razao === null) return false;
  if (razao > RAZAO_RECEITA_RCL_MAXIMA) return true;
  if (razao <= RAZAO_RECEITA_RCL_COM_SALTO || percentual === null) return false;
  const salto = saltoSobreAHistoria(s, codigo, percentual);
  return salto !== null && salto > SALTO_MINIMO;
}

/** Receita corrente (RREO) sobre a RCL ajustada (RGF), no mesmo exercício. */
export function razaoReceitaRcl(
  s: SnapshotFiscal,
  codigo: number,
  rclAjustada: number | null,
): number | null {
  // O exercício da COLETA, sem recuar — o mesmo recorte do percentual em
  // destaque. Ver `receitaDe` e o par dela.
  const ex = s.receita?.exercicios[0];
  if (!ex || ex.exercicio !== s.exercicio) return null;
  const total = ex.porMunicipio[String(codigo)]?.[0];
  if (typeof total !== "number" || !rclAjustada || rclAjustada <= 0) return null;
  return total / rclAjustada;
}

/**
 * A faixa de uma linha do snapshot — **o único lugar** que a decide para o site.
 *
 * `faixaDe` classifica o percentual pelo que ele diz; esta acrescenta o que
 * ele não pode dizer sozinho: se o denominador dele é desmentido por outra
 * declaração do mesmo município. Ranking, panorama dos estados, página do
 * município e capa chamam esta, e não aquela — uma regra repetida em quatro
 * lugares é quatro chances de o próximo chamador esquecê-la e voltar a acusar.
 *
 * Só as faixas que LEEM o percentual mudam. "Não consultado", "sem dado" e
 * "presta contas como estado" não dependem do número, e continuam como estão.
 */
export function faixaDaLinha(s: SnapshotFiscal, linha: LinhaFiscal): Faixa {
  const [codigo, , , , publicou, percentual, limitePrudencial, , rclAjustada] = linha;
  const f = faixaDe(percentual, limitePrudencial, s.limites, publicou, codigo, s.exercicio);
  const leuOPercentual =
    f === "abaixo" || f === "acima-prudencial" || f === "acima-legal";
  return leuOPercentual && rclDesmentida(s, codigo, rclAjustada, percentual)
    ? "implausivel"
    : f;
}

/**
 * A série de pessoal de um município, com a MESMA condenação que o cartão.
 *
 * ## Por que `pontoPlausivel` sozinho não basta aqui
 *
 * Achado em 22/09/2026, horas depois de `faixaDaLinha` entrar no ar. O cartão
 * das 14 páginas de RCL desmentida dizia "implausível" — e, na mesma página, a
 * série desenhava aquele ponto, a tabela o exibia sem marca e a prosa dizia que
 * Aparecida/SP "subiu 43,90 pontos percentuais": uma frase construída
 * justamente sobre o número que o cartão acima declarava inválido.
 * `pontoPlausivel` só sabe da faixa 0–100%; quem sabe da RCL é `faixaDaLinha`,
 * e ela decide um ponto só.
 *
 * **Só o ponto do período em destaque** é condenado pela RCL: é o único cuja
 * receita do mesmo exercício existe para comparar (`razaoReceitaRcl`). Os
 * anteriores continuam pela régua de 0–100% — e são eles que mostram o salto.
 *
 * `usaveis` é o que entra em gráfico, variação e interrupções; `condenado`
 * decide a marca na tabela, que continua exibindo tudo.
 */
export function serieDePessoal(
  s: SnapshotFiscal,
  codigo: number,
  faixa: Faixa | undefined,
): {
  todos: PontoSerie[];
  usaveis: PontoSerie[];
  condenado: (p: PontoSerie) => boolean;
} {
  const todos = s.serie[String(codigo)] ?? [];
  const condenado = (p: PontoSerie) =>
    !pontoPlausivel(p) ||
    (faixa === "implausivel" && p[0] === s.exercicio && p[1] === s.periodo);
  return { todos, usaveis: todos.filter((p) => !condenado(p)), condenado };
}
