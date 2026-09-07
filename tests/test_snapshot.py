"""O contrato entre as duas linguagens.

O painel em TypeScript lê este JSON no build. Se o Python mudar a forma do
snapshot, **o painel quebra em outro repositório, em outra linguagem, e o
Python não fica sabendo**. Este teste é o que impede isso: ele afirma a forma
que `painel/lib/dados.ts` declara em `type Snapshot`.

Ao mudar o formato aqui, mudar o tipo lá — e vice-versa.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from observatorio.armazem import Armazem
from observatorio.ibge import Municipio, Observacao, Resposta, serie

FIXTURES = Path(__file__).parent / "fixtures"
SERGIPE = (FIXTURES / "municipios_se.json").read_text(encoding="utf-8")
PIB_SE = (FIXTURES / "pib2021_se.json").read_text(encoding="utf-8")


class TestFormaDoSnapshot(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Armazem(Path(self.tmp.name) / "obs.db")
        self.db.gravar_municipios(
            [Municipio.de_json(b) for b in json.loads(SERGIPE)])
        self.db.registrar_indicador("pib-municipal", "PIB a preços correntes",
                                    "Mil Reais", 5938, 37)
        obs = list(serie(lambda u: Resposta(200, PIB_SE), 5938, "2021", 37,
                         ufs=[28], dormir=lambda _: None))
        self.db.gravar_observacoes("pib-municipal", obs)
        self.snap = self.db.snapshot()

    def tearDown(self) -> None:
        self.db.fechar()
        self.tmp.cleanup()

    def test_chaves_de_topo(self):
        # Exatamente as que `type Snapshot` declara no painel.
        self.assertEqual(
            set(self.snap),
            {"geradoEm", "fonte", "colunas", "indicadores", "ufs", "municipios"})

    def test_indicador_carrega_a_procedencia(self):
        ind = self.snap["indicadores"][0]
        self.assertEqual(
            set(ind),
            {"codigo", "nome", "unidade", "agregado", "variavel", "periodo",
             "origem", "coletadoEm", "totalRegiao"})
        # O painel não pode exibir número sem poder dizer de onde veio.
        self.assertIn("servicodados.ibge.gov.br", ind["origem"])
        self.assertEqual(ind["periodo"], "2021")

    def test_municipio_e_lista_compacta_na_ordem_das_colunas(self):
        colunas = self.snap["colunas"]
        self.assertEqual(colunas[:3], ["codigo", "nome", "uf"])
        linha = self.snap["municipios"][0]
        self.assertEqual(len(linha), len(colunas))
        self.assertIsInstance(linha[0], int)     # código IBGE
        self.assertIsInstance(linha[1], str)     # nome
        self.assertIsInstance(linha[2], str)     # UF

    def test_uf_traz_totais_por_indicador(self):
        uf = self.snap["ufs"][0]
        # `regiao` entrou com a expansão nacional: 27 UFs numa lista plana
        # obrigam o leitor a varrer a tabela; agrupadas por região, não.
        self.assertEqual(set(uf),
                         {"sigla", "nome", "regiao", "municipios", "totais"})
        self.assertEqual(uf["sigla"], "SE")
        self.assertEqual(uf["regiao"], "Nordeste")
        self.assertEqual(uf["municipios"], 75)
        self.assertIn("pib-municipal", uf["totais"])

    def test_total_da_uf_bate_com_a_soma_das_linhas(self):
        # Se o agregado por UF divergir das linhas, o painel mostra dois
        # números diferentes para a mesma coisa — e quem lê perde a confiança.
        i = self.snap["colunas"].index("pib-municipal")
        soma = sum(l[i] for l in self.snap["municipios"] if l[i] is not None)
        self.assertAlmostEqual(self.snap["ufs"][0]["totais"]["pib-municipal"],
                               soma, places=2)

    def test_valor_ausente_vira_null_e_nao_zero(self):
        self.db.gravar_observacoes(
            "pib-municipal",
            [Observacao(2800100, "2099", None, "https://exemplo")])
        snap = self.db.snapshot()
        i = snap["colunas"].index("pib-municipal")
        # A linha existe; o valor pode ser None — nunca 0 vindo de ausência.
        valores = [l[i] for l in snap["municipios"]]
        self.assertNotIn(0, [v for v in valores if v is not None])

    def test_serializa_em_json_sem_perder_nada(self):
        texto = json.dumps(self.snap, ensure_ascii=False)
        self.assertEqual(json.loads(texto)["colunas"], self.snap["colunas"])


if __name__ == "__main__":
    unittest.main()


class TestTravaDoEncolhimento(unittest.TestCase):
    """A trava que faltava em 07/09/2026.

    Naquele dia o cron semanal reingeriu 1.794 municípios por cima de 5.571 e
    publicou. **Nada acusou**: o JSON era válido, completo e coerente consigo
    mesmo — a página de 404 anunciava "a lista dos 1.794 municípios" com toda a
    convicção. Um retrato menor não é um retrato quebrado, e é por isso que
    nenhuma verificação de forma o pega.

    O `conferir`, que existe para falhar antes de publicar número errado,
    liberou: herdava a mesma bandeira, somou o Nordeste e comparou com o total
    do Nordeste.
    """

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.destino = Path(self.tmp.name) / "snapshot.json"

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def _exportar(self, quantos: int, permitir: bool = False) -> int:
        """Chama `exportar` com um snapshot de `quantos` municípios."""
        from types import SimpleNamespace
        from unittest.mock import patch

        from observatorio import cli

        falso = {
            "geradoEm": "2026-09-07T00:00:00",
            "fonte": "teste",
            "colunas": ["codigo"],
            "indicadores": [],
            "ufs": [],
            "municipios": [[i] for i in range(quantos)],
        }

        class ArmazemFalso:
            def __init__(self, *a, **k) -> None: ...
            def __enter__(self): return self
            def __exit__(self, *a) -> None: ...
            def snapshot(self): return falso

        args = SimpleNamespace(banco=":memory:", saida=str(self.destino),
                               permitir_encolher=permitir, regiao="NE")
        with patch.object(cli, "Armazem", ArmazemFalso):
            return cli.exportar(args)

    def test_primeira_exportacao_passa(self) -> None:
        # Sem snapshot anterior não há cobertura conhecida: a trava não arma.
        self.assertEqual(self._exportar(5571), 0)
        self.assertTrue(self.destino.exists())

    def test_crescer_e_manter_passam(self) -> None:
        self._exportar(1794)
        self.assertEqual(self._exportar(5571), 0)   # cresceu
        self.assertEqual(self._exportar(5571), 0)   # igual

    def test_encolher_e_RECUSADO_e_o_arquivo_nao_e_tocado(self) -> None:
        self._exportar(5571)
        antes = self.destino.read_text(encoding="utf-8")
        with self.assertRaises(SystemExit) as e:
            self._exportar(1794)
        # A mensagem tem de apontar para a bandeira, que é a causa real: um
        # diagnóstico que aponta para o lugar errado custa mais que nenhum.
        self.assertIn("5571", str(e.exception))
        self.assertIn("1794", str(e.exception))
        self.assertIn("--regiao", str(e.exception))
        self.assertEqual(self.destino.read_text(encoding="utf-8"), antes,
                         "recusar tem de deixar o snapshot bom no lugar")

    def test_permitir_encolher_e_a_saida_deliberada(self) -> None:
        self._exportar(5571)
        self.assertEqual(self._exportar(1794, permitir=True), 0)


class TestPadraoDoRecorte(unittest.TestCase):
    def test_o_padrao_e_o_pais(self) -> None:
        """O padrão é BR desde 07/09/2026, e a troca custou o site por horas.

        A expansão nacional foi feita passando `--regiao BR` à mão; o padrão
        continuou NE. Ninguém percebeu porque ninguém mais digitava o comando —
        até o cron semanal digitá-lo, sem bandeira.
        """
        from observatorio import cli
        self.assertEqual(cli.PADRAO_RECORTE, "BR")
        ufs, nivel = cli.recorte_de(object())
        self.assertEqual(len(ufs), 27, "sem bandeira, o recorte é o país")
        self.assertIsNone(nivel, "e a conferência compara com o total do BRASIL")
