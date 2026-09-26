"""INSS: a fila (pendentes) e os indeferimentos, do portal de dados abertos.

Escopo e decisões em `especs/numeros-publicos-inss.md` (§8 e §9), no
repositório da raiz. O resumo que importa para quem lê este arquivo:

- **Os pendentes medem a IDADE DA FILA**, não o tempo de análise: há quanto
  tempo esperam os pedidos que ainda não foram decididos, na data de
  referência. Quem foi atendido rápido já saiu do arquivo.
- **O tempo até a decisão só existe para os NEGADOS** (data do pedido e data do
  indeferimento). Os concedidos não trazem a data do pedido.
- **Código de serviço (fila) não é código de espécie (negados).** 1655 e 87 são
  o mesmo BPC-PcD em arquivos diferentes, e nada aqui os junta por conta própria.

## O rótulo do portal mente, e o mês se confere por dentro

Em 25/09/2026 o recurso "Agsoto 2026" dos pendentes apontava para
`PEND_202507.csv` — julho de **2025**. Por isso nenhum mês é aceito pelo rótulo:
nos pendentes, o nome do arquivo tem de dizer o mês pedido **e** a data de
criação mais recente tem de cair nele; nos negados, a coluna de competência
tem de dizer o mês em todas as linhas. Divergiu, recusa sem gravar nada.

## Leitor de XLSX sem dependência

O sistema não tem dependência de propósito, e as planilhas de negados têm de
60 a 70 MB. `linhas_xlsx` lê em fluxo com `zipfile` e `xml.etree.iterparse`.
Ele foi provado contra o `openpyxl` no arquivo real do INSS, que é a
implementação independente: planilha escrita à mão para teste carrega a
premissa de quem a escreveu.
"""

from __future__ import annotations

import calendar
import csv
import datetime as dt
import io
import re
import sqlite3
import unicodedata
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator
from xml.etree.ElementTree import iterparse

PORTAL = "https://dadosabertos.inss.gov.br/api/3/action/package_show?id="
PACOTE_PENDENTES = ("dados-de-requerimentos-administrativos-pendentes-"
                    "plano-de-dados-abertos-jun-2023-a-jun-2025")
PACOTE_INDEFERIDOS = ("beneficios-indeferidos-plano-de-dados-abertos-"
                      "jun-2023-a-jun-2025")

#: As 27 unidades da federação. Os negados escrevem a UF por extenso
#: ("Alagoas"), os pendentes pela sigla; o banco guarda a sigla.
UF_POR_NOME = {
    "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM",
    "bahia": "BA", "ceara": "CE", "distrito federal": "DF",
    "espirito santo": "ES", "goias": "GO", "maranhao": "MA",
    "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG",
    "para": "PA", "paraiba": "PB", "parana": "PR", "pernambuco": "PE",
    "piaui": "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN",
    "rio grande do sul": "RS", "rondonia": "RO", "roraima": "RR",
    "santa catarina": "SC", "sao paulo": "SP", "sergipe": "SE",
    "tocantins": "TO",
}
UFS = frozenset(UF_POR_NOME.values())

#: Abaixo disto, em relação ao mês anterior gravado, a cobertura encolheu.
#: A FILA pode cair de verdade (caiu 15% de junho para julho de 2026); o
#: número de serviços, espécies, agências e motivos, não por conta própria.
FRACAO_MINIMA = 0.8


class ErroINSS(RuntimeError):
    pass


# ── meses ───────────────────────────────────────────────────────────────────

def mes_de(texto: str) -> tuple[int, int]:
    """`"2026-07"` → `(2026, 7)`. Recusa qualquer outra forma."""
    m = re.fullmatch(r"(\d{4})-(\d{2})", texto.strip())
    if not m or not 1 <= int(m.group(2)) <= 12:
        raise ErroINSS(f"mês deve ser AAAA-MM, veio {texto!r}")
    return int(m.group(1)), int(m.group(2))


def ultimo_dia(ano: int, mes: int) -> dt.date:
    return dt.date(ano, mes, calendar.monthrange(ano, mes)[1])


def _sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto)
                   if unicodedata.category(c) != "Mn").lower().strip()


# ── pendentes (CSV) ─────────────────────────────────────────────────────────

CABECALHO_PENDENTES = (
    "Código da unidade da criação da tarefa",
    "Nome da unidade da criação da tarefa",
    "Código do serviço", "Nome do serviço",
    "UF da unidade da criação da tarefa",
    "Data da criação", "Quantidade de tarefas",
)


@dataclass(frozen=True, slots=True)
class LinhaPendente:
    unidade: str
    unidade_nome: str
    servico: int
    servico_nome: str
    uf: str
    criada: dt.date
    quantidade: int


def ler_pendentes(texto: Iterable[str]) -> Iterator[LinhaPendente]:
    """As linhas do CSV, já tipadas. O arquivo vem em latin-1; quem abre o
    arquivo decodifica, e esta função recebe texto."""
    leitor = csv.reader(texto)
    cabecalho = tuple(c.strip() for c in next(leitor))
    if cabecalho != CABECALHO_PENDENTES:
        raise ErroINSS(f"cabeçalho dos pendentes mudou: {cabecalho}")
    for n, l in enumerate(leitor, start=2):
        try:
            yield LinhaPendente(
                unidade=l[0].strip(), unidade_nome=l[1].strip(),
                servico=int(l[2]), servico_nome=l[3].strip(),
                uf=l[4].strip().upper(),
                criada=dt.datetime.strptime(l[5].strip().zfill(8), "%d%m%Y").date(),
                quantidade=int(l[6]))
        except (ValueError, IndexError) as e:
            raise ErroINSS(f"linha {n} dos pendentes ilegível: {l}") from e


def mes_do_nome_pendentes(nome: str) -> tuple[int, int]:
    m = re.search(r"PEND_(\d{4})(\d{2})", nome)
    if not m:
        raise ErroINSS(f"nome de arquivo sem PEND_AAAAMM: {nome!r}")
    return int(m.group(1)), int(m.group(2))


# ── XLSX sem dependência ────────────────────────────────────────────────────

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_RELS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_EPOCA_EXCEL = dt.datetime(1899, 12, 30)


def _coluna(ref: str) -> int:
    """`"AB12"` → 27 (zero-based). A letra é base 26 sem zero."""
    n = 0
    for ch in ref:
        if not ch.isalpha():
            break
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1


def _primeira_planilha(z: zipfile.ZipFile) -> str:
    from xml.etree.ElementTree import fromstring
    livro = fromstring(z.read("xl/workbook.xml"))
    folha = livro.find(f"{_NS}sheets/{_NS}sheet")
    if folha is None:
        raise ErroINSS("XLSX sem planilha")
    rid = folha.get(f"{_RELS}id")
    rels = fromstring(z.read("xl/_rels/workbook.xml.rels"))
    for r in rels:
        if r.get("Id") == rid:
            alvo = r.get("Target", "").lstrip("/")
            return alvo if alvo.startswith("xl/") else f"xl/{alvo}"
    raise ErroINSS(f"relação {rid} da primeira planilha não encontrada")


def _strings(z: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    saida: list[str] = []
    with z.open("xl/sharedStrings.xml") as fh:
        for _, el in iterparse(fh):
            if el.tag == f"{_NS}si":
                saida.append("".join(t.text or "" for t in el.iter(f"{_NS}t")))
                el.clear()
    return saida


def linhas_xlsx(caminho: str | Path) -> Iterator[list[str | float | None]]:
    """As linhas da primeira planilha, em fluxo: texto como `str`, número como
    `float`, célula vazia como `None`. Datas chegam como o serial do Excel —
    quem sabe qual coluna é data é quem lê o cabeçalho (`serial_para_data`)."""
    with zipfile.ZipFile(caminho) as z:
        strings = _strings(z)
        with z.open(_primeira_planilha(z)) as fh:
            linha: dict[int, str | float | None] = {}
            # `clear()` esvazia a linha, mas o elemento vazio continua preso no
            # `sheetData`: em 900 mil linhas, isso é memória que só cresce. A
            # linha lida sai do pai.
            pai = None
            for evento, el in iterparse(fh, events=("start", "end")):
                if evento == "start":
                    if el.tag == f"{_NS}sheetData":
                        pai = el
                    continue
                if el.tag == f"{_NS}c":
                    tipo = el.get("t")
                    v = el.find(f"{_NS}v")
                    if tipo == "inlineStr":
                        valor: str | float | None = "".join(
                            t.text or "" for t in el.iter(f"{_NS}t"))
                    elif v is None or v.text is None:
                        valor = None
                    elif tipo == "s":
                        valor = strings[int(v.text)]
                    elif tipo in ("str", "e"):
                        valor = v.text
                    elif tipo == "b":
                        valor = float(v.text)
                    else:
                        valor = float(v.text)
                    linha[_coluna(el.get("r", "A1"))] = valor
                elif el.tag == f"{_NS}row":
                    if linha:
                        largura = max(linha) + 1
                        yield [linha.get(i) for i in range(largura)]
                    else:
                        yield []
                    linha = {}
                    el.clear()
                    if pai is not None:
                        pai.remove(el)


def serial_para_data(valor: str | float | None) -> dt.date | None:
    if valor is None or valor == "":
        return None
    if isinstance(valor, str):
        valor = float(valor)
    return (_EPOCA_EXCEL + dt.timedelta(days=valor)).date()


# ── indeferidos (XLSX) ──────────────────────────────────────────────────────

# A clientela é o que separa, nos negados, o urbano do rural da MESMA espécie
# (aposentadoria por idade urbana e rural são as duas a espécie 41; ver a §10
# da especificação). Valor fora desta lista é a fonte mudando: recusa.
CLIENTELA = {"Urbano": "urbano", "Rural": "rural"}


@dataclass(frozen=True, slots=True)
class LinhaNegada:
    competencia: int
    especie: int
    especie_nome: str
    motivo: str
    clientela: str
    uf: str
    aps: int | None
    aps_nome: str
    pedido: dt.date
    negado: dt.date


def _achar(cabecalho: list, nome: str, ocorrencia: int = 1) -> int:
    vistos = 0
    for i, c in enumerate(cabecalho):
        if isinstance(c, str) and c.strip() == nome:
            vistos += 1
            if vistos == ocorrencia:
                return i
    raise ErroINSS(f"coluna {nome!r} (ocorrência {ocorrencia}) não está no "
                   f"cabeçalho: {cabecalho}")


def ler_indeferidos(linhas: Iterable[list]) -> Iterator[LinhaNegada]:
    """As linhas da planilha, depois do título e do cabeçalho. O cabeçalho é a
    primeira linha que tem `Dt DER`; o que vem antes é título."""
    it = iter(linhas)
    for cab in it:
        if any(isinstance(c, str) and c.strip() == "Dt DER" for c in cab):
            break
    else:
        raise ErroINSS("planilha de indeferidos sem cabeçalho com 'Dt DER'")
    i_comp = _achar(cab, "Competência indeferimento")
    i_esp, i_espn = _achar(cab, "Espécie"), _achar(cab, "Espécie", 2)
    i_mot, i_uf = _achar(cab, "Motivo Indeferimento"), _achar(cab, "UF")
    i_cli = _achar(cab, "Clientela")
    i_aps, i_apsn = _achar(cab, "APS"), _achar(cab, "APS", 2)
    i_neg, i_der = _achar(cab, "Dt Indeferimento"), _achar(cab, "Dt DER")
    for n, l in enumerate(it, start=1):
        if not l or l[i_comp] in (None, ""):
            continue
        uf_nome = _sem_acento(str(l[i_uf] or ""))
        cli = str(l[i_cli] or "").strip()
        if cli not in CLIENTELA:
            raise ErroINSS(f"indeferidos: linha {n} tem clientela {cli!r}, fora de "
                           f"{sorted(CLIENTELA)} — a fonte mudou; nada gravado")
        yield LinhaNegada(
            competencia=int(float(l[i_comp])),
            especie=int(float(l[i_esp])), especie_nome=str(l[i_espn]).strip(),
            motivo=str(l[i_mot]).strip(), clientela=CLIENTELA[cli],
            uf=UF_POR_NOME.get(uf_nome, uf_nome.upper()),
            aps=None if l[i_aps] in (None, "") else int(float(l[i_aps])),
            aps_nome=str(l[i_apsn] or "").strip(),
            pedido=serial_para_data(l[i_der]), negado=serial_para_data(l[i_neg]))


# ── estatística ─────────────────────────────────────────────────────────────

def quantil(contagem: dict[int, int], p: float) -> int | None:
    """O quantil de uma distribuição dada como `{valor: quantidade}`: o menor
    valor cuja frequência acumulada alcança `p` do total."""
    total = sum(contagem.values())
    if not total:
        return None
    alvo, acumulado = p * total, 0
    for valor in sorted(contagem):
        acumulado += contagem[valor]
        if acumulado >= alvo:
            return valor
    return max(contagem)


def resumo(contagem: dict[int, int]) -> dict | None:
    n = sum(contagem.values())
    if not n:
        return None
    return {"n": n, "mediana": quantil(contagem, .5),
            "p75": quantil(contagem, .75), "p90": quantil(contagem, .9),
            "acima_45": sum(q for d, q in contagem.items() if d > 45) / n,
            "acima_90": sum(q for d, q in contagem.items() if d > 90) / n}


# ── banco ───────────────────────────────────────────────────────────────────

ESQUEMA = """
CREATE TABLE IF NOT EXISTS servico (codigo INTEGER PRIMARY KEY, nome TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS especie (codigo INTEGER PRIMARY KEY, nome TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS unidade (codigo TEXT PRIMARY KEY, nome TEXT NOT NULL, uf TEXT);
CREATE TABLE IF NOT EXISTS aps (codigo INTEGER PRIMARY KEY, nome TEXT NOT NULL, uf TEXT);

-- A fila como vem: uma linha por (unidade, serviço, dia de criação).
CREATE TABLE IF NOT EXISTS pendente (
    mes TEXT NOT NULL, unidade TEXT NOT NULL, servico INTEGER NOT NULL,
    uf TEXT NOT NULL, criada TEXT NOT NULL, idade_dias INTEGER NOT NULL,
    quantidade INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_pendente_mes ON pendente (mes, servico);

-- Os negados, agregados: o arquivo tem uma linha por pedido (~900 mil/mês).
-- O motivo NÃO tem código no arquivo; a chave é o texto, como vem.
-- A clientela (urbano/rural) entrou em 26/09/2026: ver `ArmazemINSS`.
CREATE TABLE IF NOT EXISTS negado (
    mes TEXT NOT NULL, especie INTEGER NOT NULL, clientela TEXT NOT NULL,
    motivo TEXT NOT NULL, uf TEXT NOT NULL, aps INTEGER, dias INTEGER NOT NULL,
    quantidade INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_negado_mes ON negado (mes, especie);

CREATE TABLE IF NOT EXISTS coleta (
    mes TEXT NOT NULL, conjunto TEXT NOT NULL, arquivo TEXT NOT NULL,
    linhas INTEGER NOT NULL, total INTEGER NOT NULL, descartadas INTEGER NOT NULL,
    gravado_em TEXT NOT NULL, PRIMARY KEY (mes, conjunto));
"""


class ArmazemINSS:
    """O banco do INSS. Um banco anterior a 26/09/2026 tem negados SEM
    clientela, e eles não se completam sem reler o arquivo: abrir um desses
    levanta `ErroINSS`, a menos que `migrar=True` — o que só a ingestão pede,
    porque vai reler. Migrar apaga os negados e o registro de coleta deles;
    a fila não é tocada. Fatia faltando se recoleta e aparece na contagem;
    linha sem clientela misturaria urbano e rural sem aparecer em lugar nenhum."""

    def __init__(self, caminho: str | Path, migrar: bool = False) -> None:
        self.con = sqlite3.connect(str(caminho))
        self.con.row_factory = sqlite3.Row
        self.migrado = False
        colunas = {r["name"] for r in self.con.execute("PRAGMA table_info(negado)")}
        if colunas and "clientela" not in colunas:
            if not migrar:
                self.con.close()
                raise ErroINSS(
                    f"{caminho}: os negados foram gravados antes da clientela "
                    "(urbano/rural) e não se completam sem reler o arquivo. Rode "
                    "`inss-ingerir --conjunto indeferidos` de novo para cada mês: "
                    "ele apaga os negados antigos e grava com a clientela.")
            with self.con:
                self.con.execute("DROP TABLE negado")
                self.con.execute("DELETE FROM coleta WHERE conjunto = 'indeferidos'")
            self.migrado = True
        self.con.executescript(ESQUEMA)

    def __enter__(self) -> "ArmazemINSS":
        return self

    def __exit__(self, *_) -> None:
        self.con.close()

    # A cobertura de um mês gravado, para a trava.
    def cobertura(self, conjunto: str, mes: str) -> dict[str, int] | None:
        if conjunto == "pendentes":
            l = self.con.execute(
                "SELECT COUNT(DISTINCT servico) s, COUNT(DISTINCT unidade) u,"
                " COUNT(DISTINCT uf) f FROM pendente WHERE mes = ?", (mes,)).fetchone()
            return None if not l["f"] else {"serviços": l["s"], "unidades": l["u"],
                                            "UFs": l["f"]}
        l = self.con.execute(
            "SELECT COUNT(DISTINCT especie) e, COUNT(DISTINCT motivo) m,"
            " COUNT(DISTINCT aps) a, COUNT(DISTINCT uf) f,"
            " COUNT(DISTINCT clientela) c FROM negado WHERE mes = ?",
            (mes,)).fetchone()
        return None if not l["f"] else {"espécies": l["e"], "motivos": l["m"],
                                        "agências": l["a"], "UFs": l["f"],
                                        "clientelas": l["c"]}

    def mes_anterior(self, conjunto: str, mes: str) -> str | None:
        tabela = "pendente" if conjunto == "pendentes" else "negado"
        l = self.con.execute(f"SELECT MAX(mes) FROM {tabela} WHERE mes < ?",
                             (mes,)).fetchone()
        return l[0]


def _trava(db: ArmazemINSS, conjunto: str, mes: str, nova: dict[str, int],
           permitir: bool) -> None:
    if nova.get("UFs") != len(UFS):
        raise ErroINSS(f"{conjunto} de {mes}: {nova.get('UFs')} UFs, não 27 — "
                       "arquivo incompleto ou lido pela metade; nada gravado")
    anterior = db.mes_anterior(conjunto, mes)
    velha = db.cobertura(conjunto, anterior) if anterior else None
    if not velha or permitir:
        return
    caiu = [f"{k}: {velha[k]} em {anterior} → {nova[k]}" for k in velha
            if nova.get(k, 0) < FRACAO_MINIMA * velha[k]]
    if caiu:
        raise ErroINSS(f"RECUSADO: a cobertura de {conjunto} encolheu — "
                       + "; ".join(caiu) + ". Se é a intenção, repita com "
                       "--permitir-encolher. Nada gravado.")


def gravar_pendentes(db: ArmazemINSS, mes_pedido: str, nome_arquivo: str,
                     linhas: Iterable[LinhaPendente],
                     permitir_encolher: bool = False) -> dict:
    """Grava a fila de um mês. **Confere o mês por dentro** e substitui a fatia."""
    ano, mes = mes_de(mes_pedido)
    if mes_do_nome_pendentes(nome_arquivo) != (ano, mes):
        a, m = mes_do_nome_pendentes(nome_arquivo)
        raise ErroINSS(f"o arquivo {nome_arquivo} é de {a}-{m:02d}, não de "
                       f"{mes_pedido} — o rótulo do portal já mentiu assim; "
                       "nada gravado")
    ref = ultimo_dia(ano, mes)
    lidas = list(linhas)
    if not lidas:
        raise ErroINSS(f"pendentes de {mes_pedido}: arquivo sem linhas")
    mais_nova = max(l.criada for l in lidas)
    if (mais_nova.year, mais_nova.month) != (ano, mes):
        raise ErroINSS(f"pendentes de {mes_pedido}: a tarefa mais recente é de "
                       f"{mais_nova}, fora do mês — o arquivo não é deste mês; "
                       "nada gravado")
    futuras = [l for l in lidas if l.criada > ref]
    if futuras:
        raise ErroINSS(f"pendentes de {mes_pedido}: {len(futuras)} linhas "
                       "criadas depois da data de referência")
    cobertura = {"serviços": len({l.servico for l in lidas}),
                 "unidades": len({l.unidade for l in lidas}),
                 "UFs": len({l.uf for l in lidas} & UFS)}
    _trava(db, "pendentes", mes_pedido, cobertura, permitir_encolher)

    total = sum(l.quantidade for l in lidas)
    with db.con:  # uma transação: apaga a fatia e grava a nova, ou nada
        db.con.execute("DELETE FROM pendente WHERE mes = ?", (mes_pedido,))
        db.con.executemany(
            "INSERT INTO pendente VALUES (?, ?, ?, ?, ?, ?, ?)",
            ((mes_pedido, l.unidade, l.servico, l.uf, l.criada.isoformat(),
              (ref - l.criada).days, l.quantidade) for l in lidas))
        db.con.executemany("INSERT OR REPLACE INTO servico VALUES (?, ?)",
                           {(l.servico, l.servico_nome) for l in lidas})
        db.con.executemany("INSERT OR REPLACE INTO unidade VALUES (?, ?, ?)",
                           {(l.unidade, l.unidade_nome, l.uf) for l in lidas})
        db.con.execute(
            "INSERT OR REPLACE INTO coleta VALUES (?, 'pendentes', ?, ?, ?, 0, ?)",
            (mes_pedido, nome_arquivo, len(lidas), total, agora()))
    return {"linhas": len(lidas), "total": total, "referencia": ref.isoformat(),
            **cobertura}


def gravar_indeferidos(db: ArmazemINSS, mes_pedido: str, nome_arquivo: str,
                       linhas: Iterable[LinhaNegada],
                       permitir_encolher: bool = False) -> dict:
    """Grava os negados de um mês, agregados. **Toda linha** tem de ter a
    competência do mês pedido; e dia negativo (negado antes do pedido) é
    contado e informado, nunca gravado."""
    ano, mes = mes_de(mes_pedido)
    competencia = ano * 100 + mes
    agregado: Counter = Counter()
    especies: dict[int, str] = {}
    agencias: dict[int, tuple[str, str]] = {}
    lidas = negativas = sem_data = 0
    for l in linhas:
        lidas += 1
        if l.competencia != competencia:
            raise ErroINSS(f"indeferidos: linha {lidas} tem competência "
                           f"{l.competencia}, e o mês pedido é {competencia} — "
                           "nada gravado")
        if l.pedido is None or l.negado is None:
            sem_data += 1
            continue
        dias = (l.negado - l.pedido).days
        if dias < 0:
            negativas += 1
            continue
        agregado[(l.especie, l.clientela, l.motivo, l.uf, l.aps, dias)] += 1
        especies[l.especie] = l.especie_nome
        if l.aps is not None:
            agencias[l.aps] = (l.aps_nome, l.uf)
    if not lidas:
        raise ErroINSS(f"indeferidos de {mes_pedido}: planilha sem linhas")
    cobertura = {"espécies": len(especies),
                 "motivos": len({k[2] for k in agregado}),
                 "agências": len({k[4] for k in agregado}),
                 "UFs": len({k[3] for k in agregado} & UFS),
                 "clientelas": len({k[1] for k in agregado})}
    _trava(db, "indeferidos", mes_pedido, cobertura, permitir_encolher)

    total = sum(agregado.values())
    with db.con:
        db.con.execute("DELETE FROM negado WHERE mes = ?", (mes_pedido,))
        db.con.executemany(
            "INSERT INTO negado (mes, especie, clientela, motivo, uf, aps, dias,"
            " quantidade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ((mes_pedido, *k, q) for k, q in agregado.items()))
        db.con.executemany("INSERT OR REPLACE INTO especie VALUES (?, ?)",
                           especies.items())
        db.con.executemany("INSERT OR REPLACE INTO aps VALUES (?, ?, ?)",
                           ((c, n, u) for c, (n, u) in agencias.items()))
        db.con.execute(
            "INSERT OR REPLACE INTO coleta VALUES (?, 'indeferidos', ?, ?, ?, ?, ?)",
            (mes_pedido, nome_arquivo, lidas, total, negativas + sem_data, agora()))
    return {"linhas": lidas, "total": total, "negativas": negativas,
            "sem_data": sem_data, **cobertura}


# ── consultas ───────────────────────────────────────────────────────────────

def fila_por_servico(db: ArmazemINSS, mes: str) -> list[tuple[int, str, dict]]:
    dist: dict[int, Counter] = {}
    for l in db.con.execute(
            "SELECT servico, idade_dias, SUM(quantidade) q FROM pendente"
            " WHERE mes = ? GROUP BY servico, idade_dias", (mes,)):
        dist.setdefault(l["servico"], Counter())[l["idade_dias"]] += l["q"]
    nomes = dict(db.con.execute("SELECT codigo, nome FROM servico").fetchall())
    saida = [(s, nomes.get(s, "?"), resumo(c)) for s, c in dist.items()]
    return sorted(saida, key=lambda x: -x[2]["n"])


def negados_por_especie(db: ArmazemINSS, mes: str,
                        clientela: str | None = None) -> list[tuple[int, str, dict]]:
    """Dias do pedido ao "não", por espécie. `clientela` ("urbano" ou "rural")
    recorta; sem ela, as duas somam."""
    if clientela is not None and clientela not in CLIENTELA.values():
        raise ErroINSS(f"clientela {clientela!r}: use {sorted(CLIENTELA.values())}")
    dist: dict[int, Counter] = {}
    for l in db.con.execute(
            "SELECT especie, dias, SUM(quantidade) q FROM negado"
            " WHERE mes = ? AND (? IS NULL OR clientela = ?)"
            " GROUP BY especie, dias", (mes, clientela, clientela)):
        dist.setdefault(l["especie"], Counter())[l["dias"]] += l["q"]
    nomes = dict(db.con.execute("SELECT codigo, nome FROM especie").fetchall())
    saida = [(e, nomes.get(e, "?"), resumo(c)) for e, c in dist.items()]
    return sorted(saida, key=lambda x: -x[2]["n"])


def total_distribuicao(db: ArmazemINSS, conjunto: str, mes: str) -> dict | None:
    if conjunto == "pendentes":
        sql = ("SELECT idade_dias d, SUM(quantidade) q FROM pendente"
               " WHERE mes = ? GROUP BY idade_dias")
    else:
        sql = ("SELECT dias d, SUM(quantidade) q FROM negado"
               " WHERE mes = ? GROUP BY dias")
    return resumo({l["d"]: l["q"] for l in db.con.execute(sql, (mes,))})


# ── portal ──────────────────────────────────────────────────────────────────

MESES = ("janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro")


def recurso_do_mes(recursos: list[dict], conjunto: str, mes_pedido: str) -> dict:
    """O recurso do portal que diz ser daquele mês. **É só o candidato**: o mês
    de verdade se confere por dentro, na gravação."""
    ano, mes = mes_de(mes_pedido)
    if conjunto == "pendentes":
        marca = f"PEND_{ano}{mes:02d}"
        achados = [r for r in recursos if marca in (r.get("url") or "")]
    else:
        nome_mes = MESES[mes - 1]
        achados = [r for r in recursos
                   if nome_mes in _sem_acento(r.get("name") or "")
                   and str(ano) in (r.get("name") or "")]
    if len(achados) != 1:
        raise ErroINSS(f"{conjunto} {mes_pedido}: {len(achados)} recursos "
                       "candidatos no portal (esperava 1): "
                       f"{[r.get('name') for r in achados]}")
    return achados[0]


def agora() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def abrir_pendentes(caminho: str | Path) -> io.TextIOWrapper:
    """O CSV vem em latin-1 — medido nos arquivos de 2025 e 2026."""
    return open(caminho, encoding="latin-1", newline="")
