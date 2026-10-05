"""Trabalho e renda: a média que não se soma, e a amostra que arredonda.

Entraram em 29/09/2026 com a seção "Trabalho e renda". Os números dos casos
vêm da fonte, medidos naquele dia:

- a renda média de 1100015 é R$ 2.154,81, sobre 8.962 pessoas e uma massa de
  R$ 19.310.453,29 -- a divisão dá 2.154,70, e a diferença é arredondamento;
- a mediana do mesmo município é bem menor que a média, e trocá-las é o erro
  que a conferência tem de pegar;
- os desocupados somam 44 a menos que o total nacional, em 5.570 municípios.
"""

from __future__ import annotations

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from numeros_publicos.armazem import Armazem
from numeros_publicos.cli import (
    INDICADORES,
    MAIS_RECENTE,
    NAO_SOMAVEIS,
    conferir,
    conferir_media,
    construir_parser,
)
from numeros_publicos.ibge import Media, Municipio, Observacao, Resposta, Serie

FIXTURES = Path(__file__).parent / "fixtures"
SERGIPE = json.loads((FIXTURES / "municipios_se.json").read_text(encoding="utf-8"))
ARACAJU, ESTANCIA = 2800308, 2802106

RENDA = Media("massa", "pessoas")


def _banco(tmp: str) -> Armazem:
    db = Armazem(str(Path(tmp) / "t.db"))
    db.gravar_municipios([Municipio.de_json(b) for b in SERGIPE])
    return db


def _gravar(db: Armazem, codigo: str, valores: dict[int, float | None],
            periodo: str = "2022") -> None:
    db.registrar_indicador(codigo, codigo, "x", 1, 1)
    db.gravar_observacoes(codigo, [Observacao(m, periodo, v, "teste")
                                   for m, v in valores.items()])


class TestConferirMedia(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = _banco(self.tmp.name)
        _gravar(self.db, "massa", {ARACAJU: 19_310_453.29, ESTANCIA: 5_216_406.20})
        _gravar(self.db, "pessoas", {ARACAJU: 8962, ESTANCIA: 2286})

    def tearDown(self) -> None:
        self.db.fechar()
        self.tmp.cleanup()

    def test_a_media_real_da_fonte_confere_apesar_do_arredondamento(self):
        # 19.310.453,29 / 8.962 = 2.154,70, e o IBGE publica 2.154,81.
        _gravar(self.db, "media", {ARACAJU: 2154.81, ESTANCIA: 2281.93})
        ok, texto = conferir_media(self.db, "media", RENDA, "2022")
        self.assertTrue(ok, texto)
        self.assertIn("2 municípios", texto)

    def test_a_MEDIANA_no_lugar_da_media_diverge(self):
        """O canário. Uma variável vizinha lida por engano (a mediana, 13537,
        mora ao lado da média, 13536) é o erro plausível, e ele tem de gritar."""
        _gravar(self.db, "media", {ARACAJU: 1500.00, ESTANCIA: 2281.93})
        ok, texto = conferir_media(self.db, "media", RENDA, "2022")
        self.assertFalse(ok)
        self.assertIn("1 fora do limite", texto)

    def test_media_sem_o_par_diverge(self):
        # A média existe onde a contagem existe, e vice-versa.
        _gravar(self.db, "media", {ARACAJU: 2154.81})
        ok, texto = conferir_media(self.db, "media", RENDA, "2022")
        self.assertFalse(ok)
        self.assertIn("1 sem o par", texto)

    def test_periodos_diferentes_nao_se_conferem(self):
        _gravar(self.db, "media", {ARACAJU: 2154.81, ESTANCIA: 2281.93}, "2023")
        ok, texto = conferir_media(self.db, "media", RENDA, "2023")
        self.assertFalse(ok)
        self.assertIn("períodos diferentes", texto)

    def test_o_fator_do_salario_mil_reais_e_treze_salarios(self):
        # 1100015 em 2024, lido do agregado 9509: salários 106.617 mil,
        # assalariado médio 3.009,38, média publicada 2.725,24. A conta dá
        # 2.725,25 -- o total vem arredondado em mil reais.
        _gravar(self.db, "sal", {ARACAJU: 106_617})
        _gravar(self.db, "asm", {ARACAJU: 3009.38})
        _gravar(self.db, "smm", {ARACAJU: 2725.24})
        ok, texto = conferir_media(self.db, "smm",
                                   Media("sal", "asm", 1000 / 13), "2022")
        self.assertTrue(ok, texto)


class TestAmostraArredonda(unittest.TestCase):
    """A soma dos municípios de uma amostra expandida pode se afastar do total
    em até meio por município. Só quem DECLARA `amostra` ganha essa folga."""

    def _conferir(self, amostra: bool, oficial: float) -> tuple[int, str]:
        with tempfile.TemporaryDirectory() as tmp:
            db = _banco(tmp)
            valores = {m["id"]: 1000.0 for m in SERGIPE}
            _gravar(db, "desoc", valores)
            db.fechar()
            args = construir_parser().parse_args(
                ["--banco", str(Path(tmp) / "t.db"), "conferir"])
            resposta = Resposta(200, json.dumps([{"resultados": [{"series": [
                {"serie": {"2022": str(oficial)}}]}]}]))
            saida = io.StringIO()
            with patch.dict(INDICADORES,
                            {"desoc": Serie(9517, "2022", 1641, amostra=amostra)}):
                with redirect_stdout(saida):
                    codigo = conferir(args, transporte=lambda u: resposta)
            return codigo, saida.getvalue()

    def test_diferenca_menor_que_meio_por_municipio_confere_se_for_amostra(self):
        n = len(SERGIPE)                      # 75 municípios de 1.000
        codigo, saida = self._conferir(True, n * 1000 + 30)
        self.assertEqual(codigo, 0, saida)
        self.assertIn("arredondamento da amostra", saida)

    def test_a_mesma_diferenca_DIVERGE_sem_a_declaracao(self):
        n = len(SERGIPE)
        codigo, saida = self._conferir(False, n * 1000 + 30)
        self.assertEqual(codigo, 1, saida)

    def test_um_municipio_inteiro_faltando_diverge_mesmo_sendo_amostra(self):
        n = len(SERGIPE)
        codigo, saida = self._conferir(True, n * 1000 + 1000)
        self.assertEqual(codigo, 1, saida)


class TestRegistroDeTrabalho(unittest.TestCase):
    def test_toda_media_aponta_para_indicadores_do_registro(self):
        for codigo, s in INDICADORES.items():
            if s.media is None:
                continue
            with self.subTest(codigo=codigo):
                self.assertIn(s.media.total, INDICADORES)
                self.assertIn(s.media.contagem, INDICADORES)

    def test_media_e_os_seus_pares_tem_o_mesmo_periodo(self):
        # Com `MAIS_RECENTE`, a média e o par só pedem o mesmo ano se vierem do
        # mesmo agregado; senão um ano novo publicado num e não no outro poria
        # 2025 contra 2024. O `conferir` recusa, mas aqui a falha é mais cedo.
        for codigo, s in INDICADORES.items():
            if s.media is None:
                continue
            for par in (s.media.total, s.media.contagem):
                p = INDICADORES[par]
                with self.subTest(codigo=codigo, par=par):
                    self.assertEqual(p.periodo, s.periodo)
                    if s.periodo == MAIS_RECENTE:
                        self.assertEqual(p.agregado, s.agregado)

    def test_as_medias_nao_sao_somadas_no_snapshot(self):
        self.assertEqual(NAO_SOMAVEIS, {"rendimento-medio-trabalho",
                                        "salario-medio-empresas"})
        with tempfile.TemporaryDirectory() as tmp:
            db = _banco(tmp)
            _gravar(db, "salario-medio-empresas", {ARACAJU: 3000, ESTANCIA: 2000})
            _gravar(db, "empresas-atuantes", {ARACAJU: 10, ESTANCIA: 5})
            dados = db.snapshot(nao_somaveis=NAO_SOMAVEIS)
            db.fechar()
        por = {i["codigo"]: i for i in dados["indicadores"]}
        self.assertIsNone(por["salario-medio-empresas"]["totalRegiao"])
        self.assertEqual(por["empresas-atuantes"]["totalRegiao"], 15)
        se = dados["ufs"][0]["totais"]
        self.assertIsNone(se["salario-medio-empresas"])
        self.assertEqual(se["empresas-atuantes"], 15)
        # O valor de cada município continua lá: só a SOMA é que não existe.
        col = dados["colunas"].index("salario-medio-empresas")
        linha = next(l for l in dados["municipios"] if l[0] == ARACAJU)
        self.assertEqual(linha[col], 3000)


if __name__ == "__main__":
    unittest.main()
