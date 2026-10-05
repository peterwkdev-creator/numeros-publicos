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
    ArmazemBrasil, ErroBrasil, Leitura, Mandato, SerieBrasil, buracos,
    carregar_mandatos, coletar, periodo_ibge, periodo_sgs, validar_mandatos,
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


def leitura(s: SerieBrasil, pontos: dict[str, float]) -> Leitura:
    return Leitura(s, pontos, "https://origem", "https://conferida")


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


class TestMandatos(unittest.TestCase):
    FONTE = "https://www.gov.br/planalto/pt-br/x"

    def m(self, nome, inicio, fim, fonte=None):
        return Mandato(nome, inicio, fim, "eleito",
                       self.FONTE if fonte is None else fonte)

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
        }
        for caso, mandatos in casos.items():
            with self.subTest(caso), self.assertRaises(ErroBrasil):
                validar_mandatos(mandatos)


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
        codigo, saida, _ = self.rodar(lambda *a, **k: [leitura(PIB, pontos)])
        self.assertEqual(codigo, 0)
        self.assertIn("pib: 2 pontos, 2019T4 a 2020T3, iguais na segunda "
                      "leitura; sem dado na fonte: 2020T1, 2020T2", saida)
        atual = carregar_mandatos()[-1]
        self.assertIn(f"até hoje ({atual.nome}, desde {atual.inicio})", saida)

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


if __name__ == "__main__":
    unittest.main()
