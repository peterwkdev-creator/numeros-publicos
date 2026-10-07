"""O Brasil ao longo do tempo: as duas leituras de cada série, o banco que
não encolhe calado e a tabela de quem ocupava a Presidência.

Sem rede: o transporte é um dicionário de URL para resposta, montado com a
forma das respostas reais lidas em 05/10/2026.
"""

from __future__ import annotations

import argparse
import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from numeros_publicos import brasil, cli
from numeros_publicos.brasil import (
    ArmazemBrasil, ErroBrasil, Leitura, LeituraMetas, Mandato, Meta,
    SerieBrasil, buracos, carregar_mandatos, carregar_metas, coletar,
    coletar_metas, conferir_metas, ler_tabela_metas, periodo_ibge,
    periodo_sgs, validar_mandatos,
)
from numeros_publicos.ibge import Resposta

PIB = SerieBrasil("pib", "PIB", "%", "IBGE", "trimestral", agregado=5932,
                  variavel=6562, classificacao="11255[90707]")
IPCA = SerieBrasil("ipca", "IPCA", "%", "IBGE", "mensal", agregado=1737,
                   variavel=2265, desde="1995-07")
DIVIDA = SerieBrasil("divida-bruta", "Dívida", "% do PIB", "Banco Central",
                     "mensal", sgs=13762)


def agregados(s: SerieBrasil, serie: dict[str, str], cat: str | None = None):
    cls = []
    if s.classificacao:
        c, k = s.classificacao.rstrip("]").split("[")
        cls = [{"id": c, "nome": "x", "categoria": {cat or k: "y"}}]
    return [{"id": str(s.variavel), "variavel": s.nome, "unidade": s.unidade,
             "resultados": [{"classificacoes": cls, "series": [{
                 "localidade": {"id": "1", "nivel": {"id": "N1", "nome": "Brasil"},
                                "nome": "Brasil"},
                 "serie": serie}]}]}]


def sidra(s: SerieBrasil, serie: dict[str, str]):
    cab = {"V": "Valor", "D1C": "Brasil (Código)", "D2C": "Variável (Código)",
           "D3C": "Período (Código)"}
    return [cab] + [{"V": v, "D1C": "1", "D2C": str(s.variavel), "D3C": p}
                    for p, v in serie.items()]


def sgs(pontos: dict[str, str]):
    return [{"data": f"01/{p[5:]}/{p[:4]}", "valor": v}
            for p, v in pontos.items()]


class Transporte:
    def __init__(self, respostas: dict[str, object]) -> None:
        self.respostas = respostas
        self.pedidas: list[str] = []

    def __call__(self, url: str) -> Resposta:
        self.pedidas.append(url)
        if url not in self.respostas:
            return Resposta(404, f"não previsto: {url}")
        return Resposta(200, json.dumps(self.respostas[url]))


def sem_pausa(_):
    pass


def transporte_ibge(s, a, b=None):
    return Transporte({brasil.url_agregados(s): agregados(s, a),
                       brasil.url_sidra(s): sidra(s, b if b is not None else a)})


class TestPeriodos(unittest.TestCase):
    def test_trimestre_e_mes(self):
        self.assertEqual(periodo_ibge("199601", "trimestral"), "1996T1")
        self.assertEqual(periodo_ibge("199507", "mensal"), "1995-07")
        self.assertEqual(periodo_sgs("01/08/2026"), "2026-08")

    def test_forma_inesperada_e_erro(self):
        for codigo, per in (("199605", "trimestral"), ("199513", "mensal"),
                            ("1996", "mensal")):
            with self.assertRaises(ErroBrasil):
                periodo_ibge(codigo, per)
        with self.assertRaises(ErroBrasil):
            periodo_sgs("15/08/2026")  # série diária não é o que se pediu

    def test_buracos(self):
        self.assertEqual(buracos("trimestral", {"2019T4": 1, "2020T3": 1}),
                         ["2020T1", "2020T2"])
        self.assertEqual(buracos("mensal", {"2019-11": 1, "2020-02": 1}),
                         ["2019-12", "2020-01"])
        self.assertEqual(buracos("mensal", {"2019-11": 1, "2019-12": 1}), [])


class TestDuasLeituras(unittest.TestCase):
    SERIE = {"199601": "2.5", "199602": "2.1", "199603": "..."}

    def test_iguais_passam_e_ausente_fica_de_fora(self):
        lida = coletar(PIB, transporte_ibge(PIB, self.SERIE), sem_pausa)
        self.assertEqual(lida.pontos, {"1996T1": 2.5, "1996T2": 2.1})
        self.assertIn("/agregados/5932/periodos/all/", lida.origem)
        self.assertIn("apisidra", lida.conferida)

    def test_valor_diferente_reprova_dizendo_qual(self):
        outra = dict(self.SERIE, **{"199602": "2.2"})
        with self.assertRaisesRegex(ErroBrasil, r"1996T2 \(2.1 e 2.2\)"):
            coletar(PIB, transporte_ibge(PIB, self.SERIE, outra), sem_pausa)

    def test_ponto_faltando_num_lado_reprova(self):
        menos = {"199601": "2.5"}
        with self.assertRaisesRegex(ErroBrasil, "só na 1ª leitura: 1996T2"):
            coletar(PIB, transporte_ibge(PIB, self.SERIE, menos), sem_pausa)

    def test_categoria_errada_reprova(self):
        t = transporte_ibge(PIB, self.SERIE)
        t.respostas[brasil.url_agregados(PIB)] = agregados(PIB, self.SERIE,
                                                           cat="90687")
        with self.assertRaisesRegex(ErroBrasil, "classificação"):
            coletar(PIB, t, sem_pausa)

    def test_ipca_comeca_em_julho_de_1995(self):
        serie = {"199506": "33.0", "199507": "35.0", "199508": "30.0"}
        lida = coletar(IPCA, transporte_ibge(IPCA, serie), sem_pausa)
        self.assertEqual(sorted(lida.pontos), ["1995-07", "1995-08"])

    def test_sgs_inteira_contra_duas_janelas(self):
        tudo = {"2014-11": "60.1", "2014-12": "61.0", "2015-01": "62.3"}
        antes = {k: v for k, v in tudo.items() if k < "2015"}
        depois = {k: v for k, v in tudo.items() if k >= "2015"}
        hoje = brasil.dt.date(2026, 10, 5)
        t = Transporte({
            brasil.url_sgs(DIVIDA, 1990, 2026): sgs(tudo),
            brasil.url_sgs(DIVIDA, 1990, 2014): sgs(antes),
            brasil.url_sgs(DIVIDA, 2015, 2026): sgs(depois)})
        lida = coletar(DIVIDA, t, sem_pausa, hoje=hoje)
        self.assertEqual(len(lida.pontos), 3)
        self.assertEqual(len(t.pedidas), 3)
        # Uma janela que perde um mês é pega pela comparação.
        t.respostas[brasil.url_sgs(DIVIDA, 2015, 2026)] = sgs({})
        with self.assertRaisesRegex(ErroBrasil, "só na 1ª leitura: 2015-01"):
            coletar(DIVIDA, t, sem_pausa, hoje=hoje)

    def test_valor_do_sgs_que_nao_e_numero_reprova(self):
        # O `_numero` do IBGE tomaria isto por ausente, e o mês sumiria calado
        # das duas leituras ao mesmo tempo, sem divergência para acusar.
        with self.assertRaisesRegex(ErroBrasil, "2015-01 veio com valor 'n/d'"):
            brasil.ler_sgs(DIVIDA, sgs({"2014-12": "61.0", "2015-01": "n/d"}))

    def test_fonte_vazia_reprova(self):
        with self.assertRaisesRegex(ErroBrasil, "nenhum ponto"):
            coletar(PIB, transporte_ibge(PIB, {}), sem_pausa)


CAMBIO = next(s for s in brasil.SERIES if s.codigo == "cambio")
SELIC = next(s for s in brasil.SERIES if s.codigo == "selic")


def diaria(dias: dict[str, str]):
    """`{"1994-07-01": "0.9320"}` na forma do SGS diário."""
    return [{"data": f"{d[8:]}/{d[5:7]}/{d[:4]}", "valor": v}
            for d, v in dias.items()]


def transporte_diario(codigo: int, de: int, ate: int, dias: dict[str, str]):
    """Uma resposta por janela diária, cada uma com os dias que lhe cabem."""
    return {brasil._url_sgs(codigo, a, b): diaria(
                {d: v for d, v in dias.items() if a <= int(d[:4]) <= b})
            for a, b in brasil.janelas_diarias(de, ate)}


class TestCambio(unittest.TestCase):
    HOJE = brasil.dt.date(2026, 10, 6)
    MENSAL = {"1994-06": "2296.2562", "1994-07": "0.9333", "1994-08": "0.9002"}
    # Julho dá 0,9333 certo; agosto dá 0,90025, o empate na quinta casa que o
    # BC arredondou para baixo em 1996-04, 1999-08 e 2001-03.
    PTAX = {"1994-07-01": "0.9320", "1994-07-29": "0.9346",
            "1994-08-01": "0.9002", "1994-08-31": "0.9003",
            "1994-09-01": "0.8700"}

    def transporte(self, mensal=None, ptax=None):
        return Transporte({
            brasil.url_sgs(CAMBIO, 1990, 2026): sgs(mensal or self.MENSAL),
            **transporte_diario(1, 1994, 2026, ptax or self.PTAX)})

    def test_janelas_diarias_de_dez_anos(self):
        self.assertEqual(brasil.janelas_diarias(1994, 2026),
                         [(1994, 2003), (2004, 2013), (2014, 2023), (2024, 2026)])
        self.assertEqual(brasil.janelas_diarias(2024, 2026), [(2024, 2026)])

    def test_media_confere_ate_o_arredondamento_e_corta_no_real(self):
        lida = coletar(CAMBIO, self.transporte(), sem_pausa, hoje=self.HOJE)
        self.assertEqual(lida.pontos, {"1994-07": 0.9333, "1994-08": 0.9002})
        self.assertEqual(lida.origem, brasil.url_sgs(CAMBIO, 1990, 2026))
        self.assertIn("bcdata.sgs.1/", lida.conferida)

    def test_meia_casa_a_mais_reprova(self):
        mensal = dict(self.MENSAL, **{"1994-08": "0.9001"})
        with self.assertRaisesRegex(ErroBrasil, r"1994-08 \(0.9001 e 0.900250\)"):
            coletar(CAMBIO, self.transporte(mensal=mensal), sem_pausa,
                    hoje=self.HOJE)

    def test_mes_faltando_na_mensal_reprova(self):
        mensal = {"1994-08": "0.9002"}
        with self.assertRaisesRegex(ErroBrasil, "só na média da diária: 1994-07"):
            coletar(CAMBIO, self.transporte(mensal=mensal), sem_pausa,
                    hoje=self.HOJE)

    def test_mensal_parada_reprova(self):
        ptax = dict(self.PTAX, **{"1994-10-03": "0.85", "1994-11-01": "0.84"})
        with self.assertRaisesRegex(ErroBrasil, "para em 1994-08"):
            coletar(CAMBIO, self.transporte(ptax=ptax), sem_pausa,
                    hoje=self.HOJE)

    def test_mes_corrente_nao_tem_media(self):
        dias = brasil.ler_sgs_diaria("t", diaria(
            {"2026-09-30": "5.30", "2026-10-01": "5.40"}))
        self.assertEqual(brasil.medias_mensais(dias, self.HOJE),
                         {"2026-09": brasil.Decimal("5.30")})


def vigencia(inicio: str, fim: str | None, meta: float, n: int):
    return {"NumeroReuniaoCopom": n, "MetaSelic": meta,
            "DataInicioVigencia": f"{inicio}T03:00:00Z",
            "DataFimVigencia": f"{fim}T03:00:00Z" if fim else None}


class TestSelic(unittest.TestCase):
    HOJE = brasil.dt.date(1999, 6, 10)
    # A primeira é da TBC, de antes da meta: cai antes de março e não entra.
    COPOM = {"conteudo": [
        vigencia("1999-05-20", None, 27.0, 4),
        vigencia("1999-04-15", "1999-05-19", 34.0, 3),
        vigencia("1999-03-25", "1999-04-14", 42.0, 2),
        vigencia("1999-03-05", "1999-03-24", 45.0, 1),
        vigencia("1999-01-20", "1999-03-04", 2.9, 0)]}
    # O SGS 432 traz datas futuras: 30/06 ainda não chegou.
    DIAS = {"1999-03-05": "45.00", "1999-03-31": "42.00",
            "1999-04-30": "34.00", "1999-05-31": "27.00",
            "1999-06-30": "27.00"}

    def transporte(self, copom=None, dias=None):
        return Transporte({brasil.API_COPOM: copom or self.COPOM,
                           **transporte_diario(432, 1999, 1999, dias or self.DIAS)})

    def test_meta_do_ultimo_dia_de_cada_mes_ate_hoje(self):
        lida = coletar(SELIC, self.transporte(), sem_pausa, hoje=self.HOJE)
        self.assertEqual(lida.pontos,
                         {"1999-03": 42.0, "1999-04": 34.0, "1999-05": 27.0})
        self.assertEqual(lida.origem, brasil.API_COPOM)
        self.assertIn("bcdata.sgs.432/", lida.conferida)

    def test_serie_diaria_diferente_reprova(self):
        dias = dict(self.DIAS, **{"1999-04-30": "33.50"})
        with self.assertRaisesRegex(ErroBrasil, r"1999-04 \(34.0 e 33.5\)"):
            coletar(SELIC, self.transporte(dias=dias), sem_pausa,
                    hoje=self.HOJE)

    def test_vigencias_sobrepostas_reprovam(self):
        copom = {"conteudo": self.COPOM["conteudo"]
                 + [vigencia("1999-04-01", "1999-04-30", 40.0, 9)]}
        with self.assertRaisesRegex(ErroBrasil, "1999-04-30 cai em 2"):
            coletar(SELIC, self.transporte(copom=copom), sem_pausa,
                    hoje=self.HOJE)

    def test_meta_que_nao_e_numero_reprova(self):
        copom = {"conteudo": [vigencia("1999-05-20", None, None, 4)]}
        with self.assertRaisesRegex(ErroBrasil, "reunião 4 veio com a meta None"):
            brasil.ler_copom(SELIC, copom, self.HOJE)

    def test_meia_noite_de_brasilia_com_e_sem_horario_de_verao(self):
        # 02:00 UTC é a meia-noite do horário de verão: o dia é 30, e não 29
        # (o fuso fixo em UTC-3 errava a meta de novembro de 2011 e de 2016).
        self.assertEqual(brasil._data_copom("2011-11-30T02:00:00Z"),
                         brasil.dt.date(2011, 11, 30))
        self.assertEqual(brasil._data_copom("1999-03-05T03:00:00Z"),
                         brasil.dt.date(1999, 3, 5))
        for outra in ("1999-03-05T00:00:00Z", "1999-03-05T03:00:00"):
            with self.assertRaises(ValueError):
                brasil._data_copom(outra)

    def test_fim_de_vigencia_no_horario_de_verao(self):
        # As vigências de 2011 como o BC as publica (reuniões 162 e 163).
        copom = {"conteudo": [
            {"NumeroReuniaoCopom": 163, "MetaSelic": 11.0,
             "DataInicioVigencia": "2011-12-01T02:00:00Z",
             "DataFimVigencia": "2012-01-18T02:00:00Z"},
            {"NumeroReuniaoCopom": 162, "MetaSelic": 11.5,
             "DataInicioVigencia": "2011-10-20T02:00:00Z",
             "DataFimVigencia": "2011-11-30T02:00:00Z"}]}
        s = SELIC._replace(desde="2011-11")
        self.assertEqual(brasil.ler_copom(s, copom, brasil.dt.date(2011, 12, 31)),
                         {"2011-11": 11.5, "2011-12": 11.0})


def leitura(s: SerieBrasil, pontos: dict[str, float]) -> Leitura:
    return Leitura(s, pontos, "https://origem", "https://conferida")


def metas(*anos: int) -> LeituraMetas:
    return LeituraMetas([Meta(a, 4.5, 2.0, "Resolução CMN nº 1") for a in anos],
                        "https://sgs", "https://pagina")


# A forma da página do Banco Central lida em 06/10/2026: o texto da meta
# contínua antes da tabela; uma linha inteira; uma revista (2003, com as duas
# metas na mesma célula e um espaço de largura zero no nome da norma); e uma
# das curtas do começo, sem norma nem data.
PAGINA_METAS = {"conteudo": (
    "<p>Desde janeiro de 2025, a meta se refere à inflação acumulada em doze "
    "meses. A meta, fixada pela Resolução CMN nº 5.141, de 26 de junho de "
    "2024, é de 3,00%, com intervalo de tolerância de &plusmn;1,5 ponto "
    "percentual.</p><table><tr><th>Ano</th><th>Norma</th><th>Data</th>"
    "<th>Meta (%)</th><th>Tamanho</th><th>Intervalo</th><th>Efetiva</th>"
    "<th>Carta</th></tr>"
    "<tr><td>2024</td><td>Resolução CMN nº 4.918</td><td>24/6/2021</td>"
    "<td>3,00</td><td>1,50</td><td>1,50-4,50</td><td>4,83</td><td>Sim</td></tr>"
    "<tr><td>2003*</td><td>Resolução CM​N nº 2.972<br>Resolução CMN nº "
    "2.842</td><td>27/6/2002<br>28/6/2001</td><td>4<br>3,25</td>"
    "<td>2,5<br>2</td><td>1,5-6,5 <br>1,25-5,25</td><td>9,30</td><td>Sim</td>"
    "</tr><tr><td>1999</td><td>8</td><td>2</td><td>6-10</td><td>8,94</td>"
    "<td>Não</td></tr></table>")}
METAS_PAGINA = [Meta(1999, 8.0, 2.0, "Resolução CMN nº 2.615"),
                Meta(2003, 4.0, 2.5, "Resolução CMN nº 2.972"),
                Meta(2024, 3.0, 1.5, "Resolução CMN nº 4.918"),
                Meta(2025, 3.0, 1.5, "Resolução CMN nº 5.141")]
SGS_METAS = {1999: 8.0, 2003: 4.0, 2024: 3.0, 2025: 3.0}


class TestMetas(unittest.TestCase):
    """A meta de inflação: a tabela versionada contra o SGS e a página."""

    def tabela(self):
        return ler_tabela_metas(PAGINA_METAS)

    def test_a_tabela_versionada_e_valida_e_comeca_em_1999(self):
        ms = carregar_metas()
        self.assertEqual(ms[0].ano, 1999)
        self.assertEqual([m.ano for m in ms], list(range(1999, ms[-1].ano + 1)))

    def test_le_a_pagina_pela_meta_vigente_e_conta_colunas_do_fim(self):
        tabela, texto = self.tabela()
        self.assertEqual(tabela, {2024: (3.0, 1.5, 1.5, 4.5),
                                  2003: (4.0, 2.5, 1.5, 6.5),
                                  1999: (8.0, 2.0, 6.0, 10.0)})
        self.assertIn("±1,5 ponto", texto)

    def test_as_tres_leituras_iguais_passam(self):
        conferir_metas(METAS_PAGINA, SGS_METAS, *self.tabela())

    def test_cada_divergencia_reprova_dizendo_qual(self):
        casos = [
            ("centro", {**SGS_METAS, 2003: 3.25}, METAS_PAGINA,
             "2003: meta 4.0 aqui e 3.25 no SGS"),
            ("ano a mais no SGS", {**SGS_METAS, 2026: 3.0}, METAS_PAGINA,
             r"só no SGS: \[2026\]"),
            ("intervalo", SGS_METAS,
             [m._replace(tolerancia=2.0) if m.ano == 2024 else m
              for m in METAS_PAGINA], "2024: .* na página"),
            ("norma fora do texto", SGS_METAS,
             [m._replace(norma="Resolução CMN nº 9.999") if m.ano == 2025
              else m for m in METAS_PAGINA], "não traz 'Resolução CMN nº 9.999'"),
        ]
        for nome, sgs, ms, erro in casos:
            with self.subTest(nome), self.assertRaisesRegex(ErroBrasil, erro):
                conferir_metas(ms, sgs, *self.tabela())

    def test_ano_no_meio_ausente_da_pagina_reprova(self):
        ms = METAS_PAGINA + [Meta(2010, 4.5, 2.0, "Resolução CMN nº 3.584")]
        with self.assertRaisesRegex(ErroBrasil, "2010: ausente da tabela"):
            conferir_metas(ms, {**SGS_METAS, 2010: 4.5}, *self.tabela())

    def test_coleta_pelas_duas_urls(self):
        t = Transporte({
            brasil.SGS.format(codigo=13521) + "?formato=json": [
                {"data": f"01/01/{a}", "valor": f"{v:.2f}"}
                for a, v in SGS_METAS.items()],
            brasil.API_METAS: PAGINA_METAS})
        r = coletar_metas(t, sem_pausa, METAS_PAGINA)
        self.assertEqual(r.metas, METAS_PAGINA)
        self.assertEqual(len(t.pedidas), 2)

    def test_pagina_sem_tabela_e_erro(self):
        with self.assertRaisesRegex(ErroBrasil, "sem nenhuma linha"):
            ler_tabela_metas({"conteudo": "<p>nada</p>"})


class TestBanco(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.banco = Path(self.tmp.name) / "brasil.db"

    def tearDown(self):
        self.tmp.cleanup()

    def gravar(self, *leituras, **kw):
        with ArmazemBrasil(self.banco) as db:
            db.gravar(list(leituras), **kw)

    def pontos(self, codigo):
        with ArmazemBrasil(self.banco) as db:
            return db.pontos(codigo)

    def test_regravar_substitui_so_a_fatia_da_serie(self):
        self.gravar(leitura(PIB, {"1996T1": 1.0, "1996T2": 2.0}),
                    leitura(IPCA, {"1995-07": 3.0}))
        self.gravar(leitura(PIB, {"1996T1": 1.5, "1996T2": 2.0}))
        self.assertEqual(self.pontos("pib"), {"1996T1": 1.5, "1996T2": 2.0})
        self.assertEqual(self.pontos("ipca"), {"1995-07": 3.0})

    def test_encolher_e_recusado_nas_tres_dimensoes(self):
        self.gravar(leitura(PIB, {"1996T1": 1.0, "1996T2": 2.0, "1996T3": 3.0}))
        for menor, motivo in (
                ({"1996T1": 1.0, "1996T2": 2.0}, "3 pontos para 2"),
                ({"1996T2": 2.0, "1996T3": 3.0, "1996T4": 4.0}, "começo"),
                ({"1995T4": 0.0, "1996T1": 1.0, "1996T2": 2.0}, "fim de")):
            with self.subTest(motivo), self.assertRaisesRegex(ErroBrasil, motivo):
                self.gravar(leitura(PIB, menor))
        self.assertEqual(len(self.pontos("pib")), 3)
        self.gravar(leitura(PIB, {"1996T1": 1.0}), permitir_encolher=True)
        self.assertEqual(self.pontos("pib"), {"1996T1": 1.0})

    def test_uma_serie_recusada_nao_deixa_gravar_nenhuma(self):
        self.gravar(leitura(PIB, {"1996T1": 1.0, "1996T2": 2.0}))
        with self.assertRaises(ErroBrasil):
            self.gravar(leitura(IPCA, {"1995-07": 3.0}),
                        leitura(PIB, {"1996T1": 1.0}))
        self.assertEqual(self.pontos("ipca"), {})

    def test_serie_vazia_e_recusada_mesmo_com_permissao_de_encolher(self):
        self.gravar(leitura(PIB, {"1996T1": 1.0}))
        with self.assertRaisesRegex(ErroBrasil, "sem nenhum ponto"):
            self.gravar(leitura(PIB, {}), permitir_encolher=True)
        self.assertEqual(self.pontos("pib"), {"1996T1": 1.0})

    def test_meta_regravada_inteira_e_que_nao_encolhe(self):
        self.gravar(metas=metas(1999, 2000, 2001))
        self.gravar(metas=metas(1999, 2000, 2001, 2002))
        with ArmazemBrasil(self.banco) as db:
            self.assertEqual([a[0] for a in db.metas()["anos"]],
                             [1999, 2000, 2001, 2002])
        for menor in (metas(1999, 2000, 2001), metas(2000, 2001, 2002, 2003)):
            with self.subTest(menor.metas[0].ano), \
                    self.assertRaisesRegex(ErroBrasil, "meta de inflação encolheria"):
                self.gravar(metas=menor)


class TestMandatos(unittest.TestCase):
    FONTE = "https://www.gov.br/planalto/pt-br/x"

    def m(self, nome, inicio, fim, fonte=None, rotulo=None):
        return Mandato(nome, inicio, fim, "eleito",
                       self.FONTE if fonte is None else fonte,
                       nome if rotulo is None else rotulo)

    def test_a_tabela_versionada_e_valida(self):
        mandatos = carregar_mandatos()
        self.assertGreater(len(mandatos), 1)
        self.assertEqual(mandatos[0].inicio, "1995-01-01")
        # Só o último está em aberto, e quem ocupa hoje está nele.
        self.assertTrue(all(m.fim for m in mandatos[:-1]))
        self.assertIsNone(mandatos[-1].fim)

    def test_sequencia_certa_passa(self):
        validar_mandatos([self.m("A", "1995-01-01", "1999-01-01"),
                          self.m("B", "1999-01-01", None)])

    def test_recusas(self):
        casos = {
            "sem link": [self.m("A", "1995-01-01", None, fonte="")],
            "domínio não oficial": [self.m("A", "1995-01-01", None,
                                           fonte="https://pt.wikipedia.org/x")],
            "domínio parecido": [self.m("A", "1995-01-01", None,
                                        fonte="https://falso-gov.br/x")],
            "http": [self.m("A", "1995-01-01", None,
                            fonte="http://www.gov.br/planalto/x")],
            "sobreposição": [self.m("A", "1995-01-01", "1999-01-02"),
                             self.m("B", "1999-01-01", None)],
            "buraco": [self.m("A", "1995-01-01", "1998-12-31"),
                       self.m("B", "1999-01-01", None)],
            "aberto no meio": [self.m("A", "1995-01-01", None),
                               self.m("B", "1999-01-01", None)],
            "último fechado": [self.m("A", "1995-01-01", "1999-01-01")],
            "data sem hífen": [self.m("A", "19950101", None)],
            "data inválida": [self.m("A", "1995-02-30", None)],
            "termina antes": [self.m("A", "1999-01-01", "1995-01-01")],
            "vazia": [],
            "rótulo vazio": [self.m("A", "1995-01-01", None, rotulo=" ")],
            "rótulo longo": [self.m("A", "1995-01-01", None, rotulo="x" * 21)],
            "dois rótulos": [self.m("A", "1995-01-01", "1999-01-01"),
                             self.m("A", "1999-01-01", None, rotulo="B")],
        }
        for caso, mandatos in casos.items():
            with self.subTest(caso), self.assertRaises(ErroBrasil):
                validar_mandatos(mandatos)


class TestRetrato(unittest.TestCase):
    """O `brasil.json`: o que vai, e a trava contra encolher."""

    MANDATOS = [Mandato("A", "1995-01-01", None, "eleito",
                        "https://www.gov.br/x", "A")]

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.banco = Path(self.tmp.name) / "brasil.db"
        self.saida = Path(self.tmp.name) / "brasil.json"

    def tearDown(self):
        self.tmp.cleanup()

    def retrato(self, *leituras, series=(PIB, IPCA)):
        with ArmazemBrasil(self.banco) as db:
            db.gravar(list(leituras), metas=metas(1999, 2000),
                      permitir_encolher=True)
            return brasil.retrato(db, self.MANDATOS, series)

    def test_series_na_ordem_do_registro_com_procedencia(self):
        r = self.retrato(leitura(IPCA, {"1995-08": 2.0, "1995-07": 1.0}),
                         leitura(PIB, {"1996T1": 3.0}))
        self.assertEqual([s["codigo"] for s in r["series"]], ["pib", "ipca"])
        ipca = r["series"][1]
        self.assertEqual(ipca["pontos"], [["1995-07", 1.0], ["1995-08", 2.0]])
        self.assertEqual((ipca["origem"], ipca["conferida"]),
                         ("https://origem", "https://conferida"))
        self.assertTrue(ipca["coletadoEm"])
        self.assertEqual(r["mandatos"][0]["fim"], None)
        self.assertEqual(r["mandatos"][0]["rotulo"], "A")
        self.assertEqual(r["metaInflacao"]["anos"],
                         [[1999, 4.5, 2.0], [2000, 4.5, 2.0]])
        self.assertEqual(r["metaInflacao"]["fonte"], brasil.PAGINA_METAS)

    def test_meta_ausente_e_erro(self):
        with ArmazemBrasil(self.banco) as db:
            db.gravar([leitura(PIB, {"1996T1": 3.0}),
                       leitura(IPCA, {"1995-07": 1.0})])
            with self.assertRaisesRegex(ErroBrasil, "meta de inflação ausente"):
                brasil.retrato(db, self.MANDATOS, (PIB, IPCA))

    def test_serie_ausente_e_erro_e_nao_serie_a_menos(self):
        with self.assertRaisesRegex(ErroBrasil, "ipca: série ausente"):
            self.retrato(leitura(PIB, {"1996T1": 3.0}))

    def test_encolher_e_recusado_em_cada_dimensao(self):
        base = self.retrato(leitura(PIB, {"1996T1": 1.0, "1996T2": 2.0,
                                          "1996T3": 3.0}),
                            leitura(IPCA, {"1995-07": 1.0}))
        self.assertEqual(brasil.gravar_retrato(base, self.saida), "gravado")
        conteudo = self.saida.read_bytes()

        def com(**muda):
            r = json.loads(json.dumps(base))
            for chave, valor in muda.items():
                if chave == "mandatos":
                    r["mandatos"] = valor
                elif valor is None:
                    r["series"] = [s for s in r["series"] if s["codigo"] != chave]
                else:
                    next(s for s in r["series"] if s["codigo"] == chave)["pontos"] = valor
            return r

        for motivo, r in (
                ("sumiu", com(ipca=None)),
                ("3 pontos para 2", com(pib=[["1996T1", 1.0], ["1996T2", 2.0]])),
                ("começo de", com(pib=[["1996T2", 2.0], ["1996T3", 3.0],
                                       ["1996T4", 4.0]])),
                ("fim de", com(pib=[["1995T4", 0.0], ["1996T1", 1.0],
                                    ["1996T2", 2.0]])),
                ("mandatos 1", com(mandatos=[]))):
            with self.subTest(motivo), self.assertRaisesRegex(ErroBrasil, motivo):
                brasil.gravar_retrato(r, self.saida)
        self.assertEqual(self.saida.read_bytes(), conteudo)
        self.assertEqual(brasil.gravar_retrato(com(ipca=None), self.saida,
                                               permitir_encolher=True), "gravado")

    def test_so_o_carimbo_mudou_nao_reescreve(self):
        r = self.retrato(leitura(PIB, {"1996T1": 1.0}),
                         leitura(IPCA, {"1995-07": 1.0}))
        brasil.gravar_retrato(r, self.saida)
        for s in r["series"]:
            s["coletadoEm"] = "2099-01-01T00:00:00+00:00"
        self.assertEqual(brasil.gravar_retrato(r, self.saida), "inalterado")
        r["series"][0]["pontos"][0][1] = 9.0
        self.assertEqual(brasil.gravar_retrato(r, self.saida), "gravado")


class TestComando(unittest.TestCase):
    """O que `brasil-ingerir` imprime, sem rede: a coleta é trocada por uma
    que devolve uma leitura pronta."""

    ARGS = argparse.Namespace(banco_brasil="nao-usado.db",
                              permitir_encolher=False)

    def rodar(self, ingerir):
        saida, erro = io.StringIO(), io.StringIO()
        with mock.patch.object(brasil, "ingerir", ingerir), \
                redirect_stdout(saida), redirect_stderr(erro):
            codigo = cli.brasil_ingerir(self.ARGS, transporte=object(),
                                        dormir=sem_pausa)
        return codigo, saida.getvalue(), erro.getvalue()

    def test_imprime_cada_serie_o_vao_e_quem_ocupa_hoje(self):
        pontos = {"2019T4": 1.0, "2020T3": 2.0}
        codigo, saida, _ = self.rodar(
            lambda *a, **k: ([leitura(PIB, pontos)], metas(1999, 2000)))
        self.assertEqual(codigo, 0)
        self.assertIn("pib: 2 pontos, 2019T4 a 2020T3, iguais na segunda "
                      "leitura; sem dado na fonte: 2020T1, 2020T2", saida)
        atual = carregar_mandatos()[-1]
        self.assertIn(f"até hoje ({atual.nome}, desde {atual.inicio})", saida)
        self.assertIn("meta de inflação: 2 anos, 1999 a 2000", saida)

    def test_erro_sai_com_1_e_diz_por_que(self):
        def falha(*a, **k):
            raise ErroBrasil("pib: as duas leituras divergem")
        codigo, saida, erro = self.rodar(falha)
        self.assertEqual(codigo, 1)
        self.assertEqual(saida, "")
        self.assertIn("as duas leituras divergem", erro)


class TestRegistro(unittest.TestCase):
    def test_codigos_unicos_e_coordenada_completa(self):
        codigos = [s.codigo for s in brasil.SERIES]
        self.assertEqual(len(codigos), len(set(codigos)))
        for s in brasil.SERIES:
            with self.subTest(s.codigo):
                if s.fonte == "IBGE":
                    self.assertTrue(s.agregado and s.variavel and not s.sgs)
                else:
                    self.assertTrue(s.sgs and not s.agregado)
                self.assertIn(s.conferencia, ("janelas", "ptax", "copom"))
                if s.conferencia != "janelas":
                    # As janelas diárias começam no ano de `desde`.
                    self.assertTrue(s.desde)


if __name__ == "__main__":
    unittest.main()
