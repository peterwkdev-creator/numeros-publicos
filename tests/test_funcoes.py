"""Despesa por função: o que o município gasta em saúde, educação, urbanismo.

A armadilha desta parte da API não estoura — ela publica um número **vinte
vezes menor** e fica quieta. Cada função aparece duas vezes no anexo, e a
segunda são transferências internas entre órgãos do mesmo governo.
"""

import json
import unittest
from pathlib import Path

from fiscal.siconfi import FUNCOES, Funcoes, Resposta, funcoes, url_rreo

FIX = Path(__file__).parent / "fixtures"
CORPUS = json.loads((FIX / "rreo_salvador.json").read_text(encoding="utf-8"))


def transporte_fixo(corpo: dict):
    def t(url: str) -> Resposta:
        return Resposta(200, json.dumps(corpo))
    return t


def transporte_seq(*corpos: dict):
    """Uma resposta por pedido, na ordem, e guarda as URLs pedidas."""
    fila = list(corpos)

    def t(url: str) -> Resposta:
        t.pedidas.append(url)
        return Resposta(200, json.dumps(fila.pop(0)))
    t.pedidas = []
    return t


VAZIO = {"items": [], "hasMore": False, "count": 0}


def ler():
    return funcoes(2927408, 2024, 6, transporte_fixo(CORPUS["resposta"]),
                   dormir=lambda _: None)


class TestIntraOrcamentariaNaoPodeSerLida(unittest.TestCase):
    """O defeito que teria publicado número errado sem avisar ninguém.

    Salvador/BA declarou **R$ 2,86 bilhões** em Saúde no total, e
    **R$ 137 milhões** na linha "Intra-Orçamentárias" — transferências entre
    órgãos do próprio município. As duas linhas têm a mesma conta, a mesma
    coluna, e só se distinguem pelo rótulo.
    """

    def test_saude_e_o_valor_total_nao_o_intra(self):
        f = ler()
        self.assertEqual(f.valores["Saúde"], CORPUS["_saude_correta"])

    def test_e_NAO_e_o_valor_intra(self):
        f = ler()
        self.assertNotEqual(f.valores["Saúde"], CORPUS["_saude_se_ler_errado"])

    def test_a_diferenca_entre_os_dois_e_de_vinte_vezes(self):
        # Deixa registrado o tamanho do erro que este filtro evita: não é
        # arredondamento, é uma ordem de grandeza.
        razao = CORPUS["_saude_correta"] / CORPUS["_saude_se_ler_errado"]
        self.assertGreater(razao, 15)


class TestASomaFechaComOTotal(unittest.TestCase):
    """A integridade que a própria fonte oferece: o anexo publica o total ao
    lado das partes, então a soma das funções tem de fechar com ele.

    É verificação mais forte que a do RGF — lá se compara razão contra razão,
    aqui se compara parte contra todo. Função esquecida, lida duas vezes ou
    somada com subfunção aparece na hora.
    """

    def test_fecha(self):
        f = ler()
        self.assertIs(f.fecha, True)

    def test_sem_total_a_resposta_e_desconhecido(self):
        # Ausência de régua não é aprovação.
        f = Funcoes(1, 2024, 6, total=None, valores={"Saúde": 10.0})
        self.assertIsNone(f.fecha)

    def test_funcao_faltando_quebra_o_fechamento(self):
        f = ler()
        parcial = Funcoes(f.codigo_ibge, f.exercicio, f.periodo, f.total,
                          {k: v for k, v in f.valores.items() if k != "Saúde"})
        self.assertIs(parcial.fecha, False)


class TestSubfuncaoNaoEntra(unittest.TestCase):
    """`cod_conta` tem **dois** valores para 1.464 linhas, então não serve de
    hierarquia. O que separa função de subfunção é a lista fechada da Portaria
    MOG 42/1999 — e somar subfunção duplicaria o gasto da função que a contém."""

    def test_so_entram_nomes_da_lista_oficial(self):
        f = ler()
        self.assertTrue(set(f.valores) <= set(FUNCOES))

    def test_subfuncao_de_saude_ficou_de_fora(self):
        f = ler()
        self.assertNotIn("Assistência Hospitalar e Ambulatorial", f.valores)

    def test_administracao_geral_prefixada_ficou_de_fora(self):
        f = ler()
        self.assertFalse(any(k.startswith("FU") for k in f.valores))


class TestColunaLiquidada(unittest.TestCase):
    """Liquidada, não dotação: uma é o que se gastou, a outra é o que se
    pretendia gastar. A fixture traz as duas para a mesma conta."""

    def test_nao_pega_a_dotacao_inicial(self):
        f = ler()
        dotacao = next(
            x["valor"] for x in CORPUS["resposta"]["items"]
            if x["coluna"] == "DOTAÇÃO INICIAL"
            and (x.get("conta") or "").strip() == "Saúde")
        self.assertNotEqual(f.valores["Saúde"], dotacao)


class TestVazioEAusencia(unittest.TestCase):
    def test_items_vazio_devolve_none(self):
        vazio = {"items": [], "hasMore": False}
        self.assertIsNone(funcoes(1, 2024, 6, transporte_fixo(vazio),
                                  dormir=lambda _: None))


class TestUrl(unittest.TestCase):
    def test_o_rreo_e_BIMESTRAL_nao_quadrimestral(self):
        """O RGF vai de 1 a 3, o RREO de 1 a 6. Passar 6 no RGF ou 3 achando
        que é o último bimestre devolve vazio sem dizer por quê."""
        self.assertIn("nr_periodo=6", url_rreo(2024, 6, 2927408))
        with self.assertRaises(ValueError):
            url_rreo(2024, 7, 2927408)

    def test_pede_o_anexo_02(self):
        u = url_rreo(2024, 6, 2927408)
        self.assertIn("RREO", u)
        self.assertIn("Anexo+02", u.replace("%20", "+"))



class TestRreoSimplificado(unittest.TestCase):
    """Quem optou pelo semestral (art. 63 da LRF) entrega o RREO Simplificado,
    bimestral como o outro. Até 11/10/2026 o motor só perguntava o RREO e
    gravava "não publicou" para uns 2.300 municípios. A fixture é a resposta
    real de Alvinlândia/SP, 2025, 6º bimestre."""

    def setUp(self):
        a02 = json.loads((FIX / "rreo_simplificado_a02.json").read_text(encoding="utf-8"))
        self.t = transporte_seq(VAZIO, a02["resposta"])
        self.f = funcoes(3501509, 2025, 6, self.t, dormir=lambda _: None)

    def test_le_o_simplificado_quando_falta_o_rreo(self):
        self.assertTrue(self.f.simplificado)
        self.assertEqual(self.f.valores["Saúde"], 8262823.8)
        self.assertEqual(self.f.valores["Educação"], 9068346.86)
        self.assertTrue(self.f.fecha)

    def test_pede_o_mesmo_bimestre_no_simplificado(self):
        self.assertEqual(len(self.t.pedidas), 2)
        self.assertIn("co_tipo_demonstrativo=RREO&", self.t.pedidas[0])
        self.assertIn("co_tipo_demonstrativo=RREO+Simplificado&", self.t.pedidas[1])
        self.assertIn("nr_periodo=6", self.t.pedidas[1])
        self.assertIn("no_anexo=RREO-Anexo+02", self.t.pedidas[1])

    def test_rreo_presente_nao_pergunta_o_simplificado(self):
        t = transporte_seq(CORPUS["resposta"])
        f = funcoes(2927408, 2024, 6, t, dormir=lambda _: None)
        self.assertFalse(f.simplificado)
        self.assertEqual(len(t.pedidas), 1)

    def test_os_dois_vazios_e_nao_publicou(self):
        t = transporte_seq(VAZIO, VAZIO)
        self.assertIsNone(funcoes(1, 2025, 6, t, dormir=lambda _: None))
        self.assertEqual(len(t.pedidas), 2)


if __name__ == "__main__":
    unittest.main()
