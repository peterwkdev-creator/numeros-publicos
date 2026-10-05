"""O Brasil ao longo do tempo: seis séries do país, inteiras, e quem ocupava
a Presidência em cada período.

A espec é `especs/numeros-publicos-brasil-no-tempo.md`, no repositório de
trabalho. Aqui ficam a coleta, a conferência e o banco; a exportação para a
página lê do banco.

## As séries

Quatro do IBGE (API de agregados) e duas do Banco Central (SGS), todas no
nível do país. Cada uma vem com o histórico inteiro que a fonte publica
(`periodos/all` no IBGE, a janela desde 1990 no SGS): o site mostra a série
inteira, nunca um recorte, e recorte escolhido aqui seria escolha editorial.
A única exceção é técnica e está escrita na própria série: o IPCA começa em
07/1995, o primeiro mês em que os 12 meses acumulados caem inteiros no Real.

## Duas leituras, e nada se grava se divergirem

Cada série é lida por dois caminhos da mesma fonte, e os dois têm de dar os
mesmos pontos com os mesmos valores:

- IBGE: a API de agregados (`servicodados`) e a do SIDRA (`apisidra`), que
  são serviços diferentes do instituto;
- Banco Central: a série inteira numa consulta, e de novo em duas janelas
  que se emendam.

Ponto que falta num lado, sobra no outro ou difere em valor é ERRO, com a
lista, e o banco fica como estava.

## O banco

`brasil.db`, próprio, separado do banco dos municípios: outra fonte e outro
ritmo. Cada série é uma fatia, regravada inteira (apaga e escreve na mesma
transação: `stack-ingestao.md`, "Releitura substitui a fatia"). E a fatia não
encolhe sem aviso: menos pontos, começo mais tarde ou fim mais cedo que o já
gravado é recusado, salvo `permitir_encolher`.

## Quem ocupava o cargo

`brasil_mandatos.csv`, versionado ao lado: uma linha por período de
exercício, com a fonte oficial de cada data. `validar_mandatos` recusa linha
sem link oficial, período sobreposto e buraco entre dois períodos.

O fim de cada linha é o dia em que o seguinte ASSUMIU (intervalo semiaberto),
e não o último dia do mandato: a galeria da Presidência escreve "de
01/01/1995 a 31/12/1998", e a linha guarda 1995-01-01 a 1999-01-01. Assim
cada dia cai em exatamente uma faixa. Datas conferidas em 05/10/2026, página
por página. Onde a galeria tem erro de digitação (Lula "31/01/2006"; a posse
de 2015 escrita "01/01/2011"), a fonte é o Senado. A linha em aberto é a
atual: pela EC 111/2021, o sucessor toma posse em 5/1/2027.
"""

from __future__ import annotations

import csv
import datetime as dt
import re
import sqlite3
import time
from collections.abc import Callable
from pathlib import Path
from typing import NamedTuple
from urllib.parse import urlparse

from .ibge import ErroIBGE, Transporte, _numero, buscar_json, url_serie_regiao

SIDRA = "https://apisidra.ibge.gov.br/values"
SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados"
MANDATOS = Path(__file__).with_name("brasil_mandatos.csv")

#: Primeiro ano pedido ao SGS. As duas séries do BC começam em 2002 e 2006
#: (medido em 05/10/2026); pedir antes não corta nada, e a janela larga é o
#: que garante "a série inteira".
SGS_DESDE = 1990
#: Onde a segunda leitura do SGS corta a série em duas janelas.
SGS_CORTE = 2015


class ErroBrasil(RuntimeError):
    """A fonte mudou de forma, as duas leituras divergem, ou a fatia encolheu."""


class SerieBrasil(NamedTuple):
    """Uma série do país e a coordenada dela na fonte.

    `codigo` é a chave no banco e no JSON. `nome` é o que a página imprime:
    no IBGE, o nome dos metadados da tabela; no SGS, que dá nomes de catálogo
    longos, a forma curta, com o nome inteiro num comentário ao lado.
    """

    codigo: str
    nome: str
    unidade: str
    fonte: str  # "IBGE" ou "Banco Central"
    periodicidade: str  # "trimestral" ou "mensal"
    agregado: int | None = None
    variavel: int | None = None
    classificacao: str | None = None  # "11255[90707]", como na API
    sgs: int | None = None
    #: Primeiro período que entra, quando há critério técnico (só o IPCA).
    desde: str | None = None


# Os nomes do IBGE são os dos metadados de cada tabela, lidos em 05/10/2026.
SERIES: tuple[SerieBrasil, ...] = (
    SerieBrasil(
        "pib", "PIB a preços de mercado: taxa acumulada em quatro trimestres "
        "(em relação ao mesmo período do ano anterior)", "%", "IBGE",
        "trimestral", agregado=5932, variavel=6562,
        classificacao="11255[90707]"),
    SerieBrasil(
        "desocupacao", "Taxa de desocupação, na semana de referência, das "
        "pessoas de 14 anos ou mais de idade", "%", "IBGE", "trimestral",
        agregado=4099, variavel=4099),
    # A 6472, e não a 5436 da espec: a 5436 não publica de 2020T2 a 2022T1
    # (8 trimestres, nas duas leituras), e a 6472 tem os 58, iguais aos da
    # 5436 nos 50 que as duas têm (medido em 05/10/2026). E esta é a variável
    # da manchete da PNAD: todos os trabalhos, não só o principal.
    SerieBrasil(
        "rendimento", "Rendimento médio mensal real das pessoas de 14 anos ou "
        "mais de idade ocupadas na semana de referência com rendimento de "
        "trabalho, habitualmente recebido em todos os trabalhos", "R$",
        "IBGE", "trimestral", agregado=6472, variavel=5933),
    SerieBrasil(
        "ipca", "IPCA: variação acumulada em 12 meses", "%", "IBGE", "mensal",
        agregado=1737, variavel=2265, desde="1995-07"),
    # Nome no SGS: "Dívida bruta do governo geral (% PIB) - Metodologia
    # utilizada a partir de 2008" (a série começa em 12/2006 mesmo assim).
    SerieBrasil(
        "divida-bruta", "Dívida bruta do governo geral", "% do PIB",
        "Banco Central", "mensal", sgs=13762),
    # Nome no SGS: "NFSP sem desvalorização cambial (% PIB) - Fluxo acumulado
    # em 12 meses - Resultado primário - Total - Setor público consolidado".
    # Sinal da NFSP: positivo é déficit, negativo é superávit (01/2011 = -2,63,
    # ano de superávit). A página tem de dizer isso ao lado do gráfico.
    SerieBrasil(
        "nfsp-primario", "Necessidades de financiamento do setor público, "
        "resultado primário, acumulado em 12 meses", "% do PIB",
        "Banco Central", "mensal", sgs=5793),
)

TRIMESTRE = re.compile(r"(\d{4})0([1-4])")
MES = re.compile(r"(\d{4})(0[1-9]|1[0-2])")
DATA_SGS = re.compile(r"01/(0[1-9]|1[0-2])/(\d{4})")

Pontos = dict[str, float]


def agora() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def periodo_ibge(codigo: str, periodicidade: str) -> str:
    """`199601` vira `1996T1` (trimestre) e `199507` vira `1995-07` (mês)."""
    m = (TRIMESTRE if periodicidade == "trimestral" else MES).fullmatch(codigo)
    if not m:
        raise ErroBrasil(f"período {codigo!r} não é {periodicidade} do IBGE")
    a, b = m.groups()
    return f"{a}T{b}" if periodicidade == "trimestral" else f"{a}-{b}"


def periodo_sgs(data: str) -> str:
    """`01/08/2026` vira `2026-08`. Série mensal do SGS vem sempre no dia 1."""
    m = DATA_SGS.fullmatch(data)
    if not m:
        raise ErroBrasil(f"data {data!r} não é de série mensal do SGS")
    return f"{m.group(2)}-{m.group(1)}"


def _cortar(s: SerieBrasil, pontos: Pontos) -> Pontos:
    return {p: v for p, v in pontos.items() if s.desde is None or p >= s.desde}


def _classificacao(texto: str) -> tuple[str, str]:
    """`"11255[90707]"` vira `("11255", "90707")`."""
    cls, cat = texto.rstrip("]").split("[")
    return cls, cat


# ------------------------------------------------------------------ leituras

def url_agregados(s: SerieBrasil) -> str:
    return url_serie_regiao(s.agregado, "all", s.variavel, regiao=None,
                            classificacao=s.classificacao)


def ler_agregados(s: SerieBrasil, dados: object) -> Pontos:
    """A resposta da API de agregados, conferindo que é a série pedida."""
    try:
        (var,) = dados
        if str(var["id"]) != str(s.variavel):
            raise ErroBrasil(f"{s.codigo}: veio a variável {var['id']}, "
                             f"pedida {s.variavel}")
        (res,) = var["resultados"]
        if s.classificacao:
            cls, cat = _classificacao(s.classificacao)
            (c,) = res["classificacoes"]
            if str(c["id"]) != cls or list(c["categoria"]) != [cat]:
                raise ErroBrasil(f"{s.codigo}: veio a classificação "
                                 f"{c['id']} {list(c['categoria'])}, pedida "
                                 f"{s.classificacao}")
        (ser,) = res["series"]
        if ser["localidade"]["nivel"]["id"] != "N1":
            raise ErroBrasil(f"{s.codigo}: não veio o nível do país")
        serie = ser["serie"]
    except (KeyError, TypeError, ValueError) as e:
        raise ErroBrasil(f"{s.codigo}: a resposta de agregados mudou de forma "
                         f"({type(e).__name__}: {e})") from e
    pontos = {periodo_ibge(p, s.periodicidade): _numero(v)
              for p, v in serie.items()}
    return _cortar(s, {p: v for p, v in pontos.items() if v is not None})


def url_sidra(s: SerieBrasil) -> str:
    u = f"{SIDRA}/t/{s.agregado}/n1/all/v/{s.variavel}/p/all"
    if s.classificacao:
        cls, cat = _classificacao(s.classificacao)
        u += f"/c{cls}/{cat}"
    return u


def ler_sidra(s: SerieBrasil, dados: object) -> Pontos:
    """A resposta do `apisidra`: a primeira linha é o cabeçalho, e as colunas
    seguem a ordem do pedido (país, variável, período, classificação). A
    coluna do período é a `D3C`, e cada código tem de ter a forma do IBGE."""
    try:
        _, *linhas = dados
        pontos: Pontos = {}
        for linha in linhas:
            if linha["D1C"] != "1" or linha["D2C"] != str(s.variavel):
                raise ErroBrasil(f"{s.codigo}: linha do SIDRA de outro recorte "
                                 f"({linha['D1C']}, {linha['D2C']})")
            v = _numero(linha["V"])
            if v is not None:
                pontos[periodo_ibge(linha["D3C"], s.periodicidade)] = v
    except (KeyError, TypeError, ValueError) as e:
        raise ErroBrasil(f"{s.codigo}: a resposta do SIDRA mudou de forma "
                         f"({type(e).__name__}: {e})") from e
    return _cortar(s, pontos)


def url_sgs(s: SerieBrasil, de: int, ate: int) -> str:
    return (SGS.format(codigo=s.sgs) + "?formato=json"
            f"&dataInicial=01/01/{de}&dataFinal=31/12/{ate}")


def ler_sgs(s: SerieBrasil, dados: object) -> Pontos:
    """A resposta do SGS: `[{"data": "01/08/2026", "valor": "0.62"}, ...]`.
    O SGS não tem marcador de ausência (mês sem dado não vem na lista), então
    valor que não é número é erro. O `_numero` do IBGE, que trata marcador
    desconhecido como ausente, abriria aqui um buraco calado."""
    try:
        pontos: Pontos = {}
        for linha in dados or []:
            p = periodo_sgs(linha["data"])
            if p in pontos:
                raise ErroBrasil(f"{s.codigo}: {p} repetido no SGS")
            try:
                pontos[p] = float(linha["valor"])
            except ValueError as e:
                raise ErroBrasil(f"{s.codigo}: {p} veio com valor "
                                 f"{linha['valor']!r}, que não é número") from e
    except (KeyError, TypeError) as e:
        raise ErroBrasil(f"{s.codigo}: a resposta do SGS mudou de forma "
                         f"({type(e).__name__}: {e})") from e
    return _cortar(s, pontos)


def comparar(codigo: str, a: Pontos, b: Pontos) -> None:
    """Exige os mesmos períodos com os mesmos valores. Diz o que diverge
    (até cinco de cada tipo)."""
    so_a, so_b = sorted(a.keys() - b.keys()), sorted(b.keys() - a.keys())
    difs = sorted(p for p in a.keys() & b.keys() if a[p] != b[p])
    partes = []
    if so_a:
        partes.append(f"só na 1ª leitura: {', '.join(so_a[:5])}")
    if so_b:
        partes.append(f"só na 2ª leitura: {', '.join(so_b[:5])}")
    if difs:
        partes.append("valores diferentes: " + ", ".join(
            f"{p} ({a[p]} e {b[p]})" for p in difs[:5]))
    if partes:
        raise ErroBrasil(f"{codigo}: as duas leituras divergem; "
                         + "; ".join(partes))


def _seguinte(periodicidade: str, p: str) -> str:
    """`1996T4` → `1997T1`; `2019-12` → `2020-01`."""
    if periodicidade == "trimestral":
        a, t = int(p[:4]), int(p[5])
        return f"{a + t // 4}T{t % 4 + 1}"
    a, m = int(p[:4]), int(p[5:])
    return f"{a + m // 12}-{m % 12 + 1:02d}"


def buracos(periodicidade: str, pontos: Pontos) -> list[str]:
    """Os períodos que faltam entre o primeiro e o último. Não é erro: a
    fonte pode não ter publicado, e o gráfico mostra o vão em vez de ligar
    os pontos. Mas sai impresso, para ninguém o descobrir na página."""
    if not pontos:
        return []
    ultimo = max(pontos)
    faltam, p = [], min(pontos)
    while p < ultimo:
        p = _seguinte(periodicidade, p)
        if p not in pontos:
            faltam.append(p)
    return faltam


class Leitura(NamedTuple):
    serie: SerieBrasil
    pontos: Pontos
    origem: str  # a URL da primeira leitura, a que vai para o banco
    conferida: str  # a URL (ou as URLs) da segunda


def coletar(s: SerieBrasil, transporte: Transporte,
            dormir: Callable[[float], None] = time.sleep,
            hoje: dt.date | None = None) -> Leitura:
    """Lê a série pelos dois caminhos e só devolve se baterem."""
    ano = (hoje or dt.date.today()).year

    def obter(url: str) -> object:
        try:
            return buscar_json(transporte, url, dormir)
        except ErroIBGE as e:  # o nome é do IBGE; a repetição serve aos dois
            raise ErroBrasil(f"{s.codigo}: {e}") from e

    if s.fonte == "IBGE":
        u1, u2 = url_agregados(s), url_sidra(s)
        a = ler_agregados(s, obter(u1))
        b = ler_sidra(s, obter(u2))
    else:
        u1 = url_sgs(s, SGS_DESDE, ano)
        janelas = (url_sgs(s, SGS_DESDE, SGS_CORTE - 1),
                   url_sgs(s, SGS_CORTE, ano))
        u2 = " + ".join(janelas)
        a = ler_sgs(s, obter(u1))
        b = {}
        for u in janelas:
            parte = ler_sgs(s, obter(u))
            if parte.keys() & b.keys():
                raise ErroBrasil(f"{s.codigo}: as duas janelas do SGS se "
                                 "sobrepõem")
            b |= parte
    if not a:
        raise ErroBrasil(f"{s.codigo}: a fonte não devolveu nenhum ponto")
    comparar(s.codigo, a, b)
    return Leitura(s, a, u1, u2)


# ------------------------------------------------------------------ banco

ESQUEMA = """
-- Uma linha por ponto. Cada série é uma fatia, regravada inteira.
CREATE TABLE IF NOT EXISTS observacao (
    serie TEXT NOT NULL, periodo TEXT NOT NULL, valor REAL NOT NULL,
    coletado_em TEXT NOT NULL, origem TEXT NOT NULL,
    PRIMARY KEY (serie, periodo));

-- O que se sabe da série e de onde ela veio, uma linha por série.
CREATE TABLE IF NOT EXISTS serie (
    codigo TEXT PRIMARY KEY, nome TEXT NOT NULL, unidade TEXT NOT NULL,
    fonte TEXT NOT NULL, periodicidade TEXT NOT NULL,
    origem TEXT NOT NULL, conferida TEXT NOT NULL, pontos INTEGER NOT NULL,
    primeiro TEXT NOT NULL, ultimo TEXT NOT NULL, coletado_em TEXT NOT NULL);
"""


class ArmazemBrasil:
    def __init__(self, caminho: str | Path) -> None:
        # Sem transação implícita: `gravar` abre e fecha a dela à mão.
        self.con = sqlite3.connect(str(caminho), isolation_level=None)
        self.con.executescript(ESQUEMA)

    def __enter__(self) -> ArmazemBrasil:
        return self

    def __exit__(self, *_: object) -> None:
        self.con.close()

    def cobertura(self, codigo: str) -> tuple[int, str, str] | None:
        """Quantos pontos a série tem no banco, o primeiro e o último."""
        n, primeiro, ultimo = self.con.execute(
            "SELECT COUNT(*), MIN(periodo), MAX(periodo) FROM observacao"
            " WHERE serie = ?", (codigo,)).fetchone()
        return None if n == 0 else (n, primeiro, ultimo)

    def _encolheria(self, codigo: str, ps: list[str]) -> list[str]:
        """O que a série perderia, em cada uma das três dimensões."""
        velho = self.cobertura(codigo)
        if velho is None:
            return []
        n, primeiro, ultimo = velho
        return [motivo for motivo, perde in (
            (f"{n} pontos para {len(ps)}", len(ps) < n),
            (f"começo de {primeiro} para {ps[0]}", ps[0] > primeiro),
            (f"fim de {ultimo} para {ps[-1]}", ps[-1] < ultimo),
        ) if perde]

    def gravar(self, leituras: list[Leitura], *,
               permitir_encolher: bool = False) -> None:
        """Regrava as séries numa transação só: ou entram todas, ou nenhuma.
        Recusa série vazia e a que encolheria, nas três dimensões."""
        quando = agora()
        self.con.execute("BEGIN")
        try:
            for leitura in leituras:
                s, ps = leitura.serie, sorted(leitura.pontos)
                if not ps:
                    raise ErroBrasil(f"{s.codigo}: série sem nenhum ponto; "
                                     "nada foi gravado")
                motivos = ([] if permitir_encolher
                           else self._encolheria(s.codigo, ps))
                if motivos:
                    raise ErroBrasil(
                        f"{s.codigo}: a série encolheria ({'; '.join(motivos)}). "
                        "Ou a fonte mudou, e é notícia, ou o pedido está "
                        "errado; nada foi gravado (--permitir-encolher "
                        "se for a intenção)")
                self.con.execute("DELETE FROM observacao WHERE serie = ?",
                                 (s.codigo,))
                self.con.executemany(
                    "INSERT INTO observacao VALUES (?, ?, ?, ?, ?)",
                    [(s.codigo, p, leitura.pontos[p], quando, leitura.origem)
                     for p in ps])
                self.con.execute(
                    "INSERT OR REPLACE INTO serie VALUES "
                    "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (s.codigo, s.nome, s.unidade, s.fonte, s.periodicidade,
                     leitura.origem, leitura.conferida, len(ps), ps[0], ps[-1],
                     quando))
        except BaseException:
            self.con.execute("ROLLBACK")
            raise
        self.con.execute("COMMIT")

    def pontos(self, codigo: str) -> Pontos:
        return dict(self.con.execute(
            "SELECT periodo, valor FROM observacao WHERE serie = ?"
            " ORDER BY periodo", (codigo,)).fetchall())


def ingerir(banco: str | Path, transporte: Transporte,
            dormir: Callable[[float], None] = time.sleep,
            series: tuple[SerieBrasil, ...] = SERIES,
            permitir_encolher: bool = False) -> list[Leitura]:
    """Coleta e confere todas as séries, e só então grava todas juntas."""
    leituras = [coletar(s, transporte, dormir) for s in series]
    with ArmazemBrasil(banco) as db:
        db.gravar(leituras, permitir_encolher=permitir_encolher)
    return leituras


# ------------------------------------------------------------------ mandatos

#: De onde a data de um mandato pode ter sido lida. `gov.br` cobre a
#: Presidência, o Planalto e o Diário Oficial (`in.gov.br`); fora dele, só o
#: TSE e as duas Casas do Congresso.
DOMINIOS_OFICIAIS = ("gov.br", "tse.jus.br", "senado.leg.br", "camara.leg.br",
                     "congressonacional.leg.br")
COLUNAS_MANDATOS = ("nome", "inicio", "fim", "como", "fonte")


class Mandato(NamedTuple):
    nome: str
    inicio: str  # AAAA-MM-DD, o dia em que passou a ocupar o cargo
    fim: str | None  # o dia em que o seguinte assumiu; None se ainda ocupa
    como: str  # como assumiu, pelo nome do ato, sem adjetivo
    fonte: str  # link https da página oficial que dá as datas


def _oficial(url: str) -> bool:
    u = urlparse(url)
    host = u.hostname or ""
    return u.scheme == "https" and any(
        host == d or host.endswith("." + d) for d in DOMINIOS_OFICIAIS)


def _data_valida(d: str) -> bool:
    """`AAAA-MM-DD` de um dia que existe (`fromisoformat` aceita outras
    formas a partir do Python 3.11, por isso a forma se confere à parte)."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
        return False
    try:
        dt.date.fromisoformat(d)
    except ValueError:
        return False
    return True


def validar_mandatos(mandatos: list[Mandato]) -> None:
    """Fonte oficial em toda linha, datas válidas, e cada período começa no
    dia em que o anterior termina: nem sobreposição, nem buraco. O último, e
    só ele, está em aberto: alguém ocupa o cargo hoje. Junta todos os erros
    antes de recusar."""
    if not mandatos:
        raise ErroBrasil("tabela de mandatos inválida: a tabela está vazia")
    erros = []
    for i, m in enumerate(mandatos, start=1):
        if not m.nome.strip() or not m.como.strip():
            erros.append(f"linha {i}: nome ou forma de assumir vazios")
        if not _oficial(m.fonte):
            erros.append(f"linha {i} ({m.nome}): fonte {m.fonte!r} não é "
                         "link https de domínio oficial")
        for d in (m.inicio, m.fim):
            if d is not None and not _data_valida(d):
                erros.append(f"linha {i} ({m.nome}): data {d!r} inválida")
        if m.fim is not None and m.fim <= m.inicio:
            erros.append(f"linha {i} ({m.nome}): termina antes de começar")
        if m.fim is None and i != len(mandatos):
            erros.append(f"linha {i} ({m.nome}): só o último pode estar em "
                         "aberto")
    if mandatos[-1].fim is not None:
        erros.append(f"o último período ({mandatos[-1].nome}) termina em "
                     f"{mandatos[-1].fim}: falta quem assumiu depois")
    for a, b in zip(mandatos, mandatos[1:]):
        if a.fim is not None and a.fim != b.inicio:
            tipo = "sobreposição" if b.inicio < a.fim else "buraco"
            erros.append(f"{tipo} entre {a.nome} (até {a.fim}) e {b.nome} "
                         f"(desde {b.inicio})")
    if erros:
        raise ErroBrasil("tabela de mandatos inválida: " + "; ".join(erros))


def carregar_mandatos(caminho: str | Path = MANDATOS) -> list[Mandato]:
    with open(caminho, encoding="utf-8", newline="") as f:
        leitor = csv.DictReader(f)
        if tuple(leitor.fieldnames or ()) != COLUNAS_MANDATOS:
            raise ErroBrasil(f"{caminho}: colunas {leitor.fieldnames}, "
                             f"esperadas {list(COLUNAS_MANDATOS)}")
        mandatos = [Mandato(r["nome"], r["inicio"], r["fim"] or None,
                            r["como"], r["fonte"]) for r in leitor]
    validar_mandatos(mandatos)
    return mandatos
