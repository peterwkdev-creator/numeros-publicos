"""Emenda Pix (transferência especial): em que a prefeitura declarou aplicar.

Fonte: a API PostgREST do Transferegov (Ministério da Gestão), sem chave,
`api.transferegov.gestao.gov.br/transferenciasespeciais/`. A emenda Pix
(EC 105/2019, art. 166-A da Constituição) chega sem convênio: a finalidade só
existe no plano de ação que o próprio ente cadastra. Este módulo lê quatro
tabelas: o plano, o executor (com o objeto), a área de cada executor e o
relatório de gestão. O quanto foi PAGO segue vindo da CGU (`emendas.py`).

## O que se mede antes de gravar

- A API devolve no máximo 1.000 linhas por página, sem aviso: a coleta pagina
  com `order=` pela chave e, no fim, compara o total lido com o
  `content-range` da própria API (`Prefer: count=exact`). Diferente é ERRO.
- Releitura substitui as quatro tabelas numa transação só e recusa encolher
  em relação à coleta anterior, salvo `permitir_encolher`.

## A chave é o CNPJ, não o nome

O beneficiário vem por CNPJ. O município sai do CNPJ que a CGU pagou como
prefeitura (a tabela `pagamento` do mesmo `emendas.db`); só o CNPJ que a CGU
não conhece cai para o nome (UF + nome sem acento, com os apelidos das
emendas). Plano de município que não casa por nenhum dos dois é ERRO, com a
lista. Estado e DF ficam com município vazio (a página do estado é outra
fase).

## Área não tem valor

A área vem por executor, sem quantia, e um executor pode ter várias. Nada
aqui divide valor entre áreas (decisão do Peter de 29/10/2026: a página
conta planos por área, sem R$). Detalhe e medições:
`especs/numeros-publicos-emendas-pix.md` da raiz do projeto.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sqlite3
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Callable, Iterable

from .emendas import APELIDOS, carregar_apelidos, chave, municipios_do_snapshot

BASE = "https://api.transferegov.gestao.gov.br/transferenciasespeciais/"

#: Licença lida em 29/10/2026: o OpenAPI da API não declara nenhuma; a página
#: de dados abertos do Transferegov no gov.br traz, no rodapé, a do portal.
LICENCA = ("não declarada na API (OpenAPI sem licença, lido em 29/10/2026); a "
           "página de dados abertos do Transferegov no gov.br publica o "
           "conteúdo do portal sob Creative Commons Atribuição-SemDerivações "
           "3.0 (lido em 29/10/2026); dado público citado com o endereço e a "
           "data da coleta")

#: Linhas por página: o teto que a API aplica em silêncio (medido em
#: 29/10/2026: `limit=10000` devolve 1.000).
PAGINA = 1000

#: Tabela da API → ordem estável da paginação. A do executor desempata pela
#: agência: a API repete o executor com dois nomes de agência (8 casos em
#: 29/10/2026), e empate na ordem deixa a linha trocar de página entre dois
#: pedidos (uma some, a outra dobra, e a contagem fecha igual).
TABELAS = {
    "plano_acao_especial": "id_plano_acao",
    "executor_especial": "id_executor,nome_agencia_executor",
    "finalidade_especial": "id_executor,cd_area_politica_publica_pt",
    "relatorio_gestao_novo_especial": "id_relatorio_gestao_novo",
}

#: Só o plano "CIENTE" recebe; "IMPEDIDO" e "IMPEDIDO_REJEICAO_PLANO_TRABALHO"
#: ficam gravados, mas não contam.
SITUACAO_VALIDA = "CIENTE"

ESTADO = re.compile(r"^(ESTADO|GOVERNO|DISTRITO FEDERAL)\b")
PREFIXO_MUNICIPIO = re.compile(r"^(MUNICIPIO|PREFEITURA MUNICIPAL)( DE| DO| DA| DOS| DAS)?\s+")

ESQUEMA = """
CREATE TABLE IF NOT EXISTS pix_plano (
    id_plano INTEGER PRIMARY KEY, codigo TEXT NOT NULL, ano INTEGER NOT NULL,
    situacao TEXT NOT NULL, cnpj TEXT NOT NULL, beneficiario TEXT NOT NULL,
    uf TEXT NOT NULL, municipio INTEGER, emenda TEXT NOT NULL,
    ano_emenda TEXT NOT NULL, custeio INTEGER NOT NULL,
    investimento INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pix_executor (
    id_executor INTEGER PRIMARY KEY, id_plano INTEGER NOT NULL,
    cnpj TEXT NOT NULL, executor TEXT NOT NULL, objeto TEXT NOT NULL,
    custeio INTEGER NOT NULL, investimento INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pix_area (
    id_executor INTEGER NOT NULL, cd_funcao INTEGER NOT NULL,
    funcao TEXT NOT NULL, cd_subfuncao INTEGER NOT NULL, subfuncao TEXT NOT NULL,
    PRIMARY KEY (id_executor, cd_subfuncao));
CREATE TABLE IF NOT EXISTS pix_relatorio (
    id_relatorio INTEGER PRIMARY KEY, id_plano INTEGER NOT NULL,
    tipo TEXT NOT NULL, data TEXT NOT NULL, executado INTEGER NOT NULL,
    pendente INTEGER NOT NULL, situacao TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pix_coleta (
    tabela TEXT PRIMARY KEY, linhas INTEGER NOT NULL, origem TEXT NOT NULL,
    licenca TEXT NOT NULL, coletado_em TEXT NOT NULL);
"""


class ErroPix(RuntimeError):
    """A coleta ou a gravação não fecha: nada é gravado."""


def agora() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def texto(v) -> str:
    """Espaço normalizado (a fonte traz "Infraestrutura Urbana "); a palavra
    e a caixa ficam como a fonte escreveu."""
    return " ".join(str(v or "").split())


def centavos(v) -> int:
    """Real da API (número JSON) → centavos, sem erro de ponto flutuante."""
    if v is None:
        return 0
    return int((Decimal(str(v)) * 100).quantize(Decimal(1), ROUND_HALF_UP))


# ------------------------------------------------------------------ coleta

Abrir = Callable[[urllib.request.Request], object]


def _pedir(url: str, abrir: Abrir, contar: bool = False):
    req = urllib.request.Request(url, headers={"Prefer": "count=exact"} if contar else {})
    with abrir(req) as r:
        corpo = json.loads(r.read().decode("utf-8"))
        intervalo = r.headers.get("Content-Range", "") if contar else ""
    return corpo, intervalo


def baixar_tabela(tabela: str, abrir: Abrir | None = None,
                  base: str = BASE) -> list[dict]:
    """Todas as linhas de `tabela`, conferidas contra o total que a API declara."""
    abrir = abrir or (lambda req: urllib.request.urlopen(req, timeout=120))
    ordem = TABELAS[tabela]
    linhas: list[dict] = []
    total_declarado = None
    while True:
        url = f"{base}{tabela}?limit={PAGINA}&offset={len(linhas)}&order={ordem}"
        pagina, intervalo = _pedir(url, abrir, contar=total_declarado is None)
        if total_declarado is None:
            m = re.search(r"/(\d+)$", intervalo)
            if not m:
                raise ErroPix(f"{tabela}: a API não declarou o total "
                              f"(Content-Range {intervalo!r})")
            total_declarado = int(m.group(1))
        linhas += pagina
        if len(pagina) < PAGINA:
            break
    if len(linhas) != total_declarado:
        raise ErroPix(f"{tabela}: lidas {len(linhas)} linhas, a API declara "
                      f"{total_declarado}; nada foi gravado")
    return linhas


# ------------------------------------------------------------------ ligação

def ligar_municipios(planos: Iterable[dict], cnpj_municipio: dict[str, int],
                     por_nome: dict[tuple[str, str], int],
                     apelidos: dict[tuple[str, str], int]) -> tuple[dict[int, int | None], list[str]]:
    """`({id_plano: código IBGE ou None}, planos de município que não casaram)`."""
    saida: dict[int, int | None] = {}
    sem_casar: list[str] = []
    for p in planos:
        nome = texto(p["nome_beneficiario_plano_acao"]).upper()
        uf = texto(p["uf_beneficiario_plano_acao"])
        if ESTADO.match(nome):
            saida[p["id_plano_acao"]] = None
            continue
        m = cnpj_municipio.get(p["cnpj_beneficiario_plano_acao"])
        if m is None:
            k = chave(uf, PREFIXO_MUNICIPIO.sub("", nome.replace(":", "'")))
            m = por_nome.get(k) or apelidos.get(k)
        if m is None:
            sem_casar.append(f"{p['id_plano_acao']} {uf} {nome} "
                             f"({p['cnpj_beneficiario_plano_acao']})")
        saida[p["id_plano_acao"]] = m
    return saida, sem_casar


# ------------------------------------------------------------------ armazém

class ArmazemPix:
    def __init__(self, caminho: str | Path) -> None:
        self.con = sqlite3.connect(str(caminho), isolation_level=None)
        self.con.executescript(ESQUEMA)

    def __enter__(self) -> "ArmazemPix":
        return self

    def __exit__(self, *_) -> None:
        self.con.close()

    def cnpj_municipio(self) -> dict[str, int]:
        """CNPJ → município, dos pagamentos da CGU já gravados à prefeitura
        (natureza "Município"; o fundo municipal tem CNPJ próprio e não é
        beneficiário de plano). Um CNPJ em dois municípios é ERRO (medido em
        29/10/2026: nenhum)."""
        try:
            pares = self.con.execute(
                "SELECT DISTINCT cnpj, municipio FROM pagamento"
                " WHERE natureza = 'Município'").fetchall()
        except sqlite3.OperationalError:
            return {}
        saida: dict[str, int] = {}
        for cnpj, m in pares:
            if saida.setdefault(cnpj, m) != m:
                raise ErroPix(f"CNPJ {cnpj} em dois municípios na CGU")
        return saida

    def contagens(self) -> dict[str, int]:
        return {t: self.con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                for t in ("pix_plano", "pix_executor", "pix_area", "pix_relatorio")}

    def gravar(self, tabelas: dict[str, list[tuple]], *, origem: str,
               permitir_encolher: bool = False) -> None:
        """Substitui as quatro tabelas numa transação; recusa encolher."""
        antes = self.contagens()
        if not permitir_encolher:
            menores = {t: (antes[t], len(v)) for t, v in tabelas.items()
                       if len(v) < antes[t]}
            if menores:
                raise ErroPix(f"a coleta encolheu {menores} (antes, agora); "
                              "use --permitir-encolher se for a intenção")
        quando = agora()
        try:
            self.con.execute("BEGIN")
            for t, linhas in tabelas.items():
                self.con.execute(f"DELETE FROM {t}")
                if linhas:
                    marcas = ", ".join("?" * len(linhas[0]))
                    self.con.executemany(f"INSERT INTO {t} VALUES ({marcas})", linhas)
                self.con.execute("INSERT OR REPLACE INTO pix_coleta VALUES (?, ?, ?, ?, ?)",
                                 (t, len(linhas), origem, LICENCA, quando))
            self.con.execute("COMMIT")
        except BaseException:
            self.con.execute("ROLLBACK")
            raise


def linhas_para_gravar(brutas: dict[str, list[dict]],
                       municipio: dict[int, int | None]) -> dict[str, list[tuple]]:
    """As quatro tabelas da API → as linhas das tabelas `pix_*`. Área de
    executor que não existe fica de fora (a fonte tem área órfã: medido em
    29/10/2026, 60.308 executores citados contra 57.374)."""
    plano = [(p["id_plano_acao"], texto(p["codigo_plano_acao"]), int(p["ano_plano_acao"]),
              texto(p["situacao_plano_acao"]), texto(p["cnpj_beneficiario_plano_acao"]),
              texto(p["nome_beneficiario_plano_acao"]), texto(p["uf_beneficiario_plano_acao"]),
              municipio[p["id_plano_acao"]], texto(p["numero_emenda_parlamentar_plano_acao"]),
              texto(p["ano_emenda_parlamentar_plano_acao"]),
              centavos(p["valor_custeio_plano_acao"]),
              centavos(p["valor_investimento_plano_acao"]))
             for p in brutas["plano_acao_especial"]]
    # A API repete o executor com outro nome de agência (que não se grava):
    # igual em tudo o que se grava, fica um; diferente, é ERRO.
    por_id: dict[int, tuple] = {}
    for e in brutas["executor_especial"]:
        t = (e["id_executor"], e["id_plano_acao"], texto(e["cnpj_executor"]),
             texto(e["nome_executor"]), texto(e["objeto_executor"]),
             centavos(e["vl_custeio_executor"]), centavos(e["vl_investimento_executor"]))
        if por_id.setdefault(t[0], t) != t:
            raise ErroPix(f"executor {t[0]} repetido com dados diferentes: "
                          f"{por_id[t[0]]} e {t}")
    executor = list(por_id.values())
    ids = set(por_id)
    vistos: set[tuple[int, int]] = set()
    area = []
    for f in brutas["finalidade_especial"]:
        k = (f["id_executor"], f["cd_area_politica_publica_pt"])
        if f["id_executor"] in ids and k not in vistos:
            vistos.add(k)
            area.append((f["id_executor"], f["cd_area_politica_publica_tipo_pt"],
                         texto(f["area_politica_publica_tipo_pt"]),
                         f["cd_area_politica_publica_pt"], texto(f["area_politica_publica_pt"])))
    relatorio = [(r["id_relatorio_gestao_novo"], r["id_plano_acao"],
                  texto(r["tipo_relatorio_gestao_novo"]), texto(r["data_e_hora_relatorio_gestao_novo"]),
                  centavos(r["valor_executado_relatorio_gestao_novo"]),
                  centavos(r["valor_pendente_relatorio_gestao_novo"]),
                  texto(r["situacao_relatorio_gestao_novo"]))
                 for r in brutas["relatorio_gestao_novo_especial"]]
    return {"pix_plano": plano, "pix_executor": executor, "pix_area": area,
            "pix_relatorio": relatorio}


def ingerir(snapshot: dict, banco: str | Path, *, abrir: Abrir | None = None,
            base: str = BASE, permitir_encolher: bool = False,
            tabela_apelidos: str | Path = APELIDOS) -> dict:
    """Coleta as quatro tabelas, liga ao município e grava. Devolve o resumo."""
    brutas = {t: baixar_tabela(t, abrir, base) for t in TABELAS}
    por_nome = municipios_do_snapshot(snapshot)
    apelidos = carregar_apelidos(por_nome, tabela_apelidos)
    with ArmazemPix(banco) as db:
        municipio, sem_casar = ligar_municipios(
            brutas["plano_acao_especial"], db.cnpj_municipio(), por_nome, apelidos)
        if sem_casar:
            raise ErroPix(f"{len(sem_casar)} planos de município sem casar: "
                          + "; ".join(sem_casar[:20]))
        linhas = linhas_para_gravar(brutas, municipio)
        db.gravar(linhas, origem=base, permitir_encolher=permitir_encolher)
        cont = db.contagens()
        n_mun = db.con.execute("SELECT COUNT(DISTINCT municipio) FROM pix_plano"
                               " WHERE municipio IS NOT NULL").fetchone()[0]
    ids = {e["id_executor"] for e in brutas["executor_especial"]}
    return {"contagens": cont, "municipios": n_mun,
            "orfas": sum(f["id_executor"] not in ids
                         for f in brutas["finalidade_especial"])}


# ------------------------------------------------------------------ conferência

def conferir_com_cgu(banco: str | Path) -> list[tuple[str, int, int, int, int]]:
    """Por ano da emenda: (ano, centavos do plano "CIENTE", centavos pagos pela
    CGU como transferência especial, pares município-ano iguais, pares)."""
    con = sqlite3.connect(str(banco))
    try:
        plano = dict(((m, a), v) for m, a, v in con.execute(
            "SELECT municipio, ano_emenda, SUM(custeio + investimento) FROM pix_plano"
            " WHERE situacao = ? AND municipio IS NOT NULL GROUP BY 1, 2",
            (SITUACAO_VALIDA,)))
        cgu = dict(((m, a), v) for m, a, v in con.execute(
            "SELECT municipio, substr(emenda, 1, 4), SUM(centavos) FROM pagamento"
            " WHERE tipo = 'Emenda Individual - Transferências Especiais' GROUP BY 1, 2"))
    finally:
        con.close()
    saida = []
    for ano in sorted({a for _, a in plano}):
        chaves = [k for k in plano if k[1] == ano]
        saida.append((ano, sum(plano[k] for k in chaves),
                      sum(v for k, v in cgu.items() if k[1] == ano),
                      sum(plano[k] == cgu.get(k, 0) for k in chaves), len(chaves)))
    return saida
