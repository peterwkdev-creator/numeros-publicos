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

    def _exportar(self, quantos: int, permitir: bool = False,
                  indicadores: int = 13, ufs: int = 27,
                  carimbo: str = "2026-09-07T00:00:00",
                  com_valor: int | None = None) -> int:
        """Chama `exportar` com um snapshot daquele tamanho, em cada dimensão.

        `carimbo` é o que muda a cada execução do cron sem o dado mudar:
        `geradoEm` e o `coletadoEm` de cada indicador.
        """
        from types import SimpleNamespace
        from unittest.mock import patch

        from observatorio import cli

        falso = {
            "geradoEm": carimbo,
            "fonte": "teste",
            "colunas": ["codigo"],
            "indicadores": [{"codigo": f"i{n}", "periodo": "2022",
                             "unidade": "Pessoas", "totalRegiao": None,
                             "coletadoEm": carimbo}
                            for n in range(indicadores)],
            "ufs": [{"sigla": f"U{n}"} for n in range(ufs)],
            "municipios": [[i] for i in range(quantos)],
        }
        if com_valor is not None:
            # Uma coluna de indicador, com valor só nas `com_valor` primeiras
            # linhas: é a forma de um período novo gravado pela metade.
            falso["colunas"] = ["codigo", "nome", "uf", "populacao-estimada"]
            falso["municipios"] = [[i, "m", "UF", 1000.0 if i < com_valor else None]
                                   for i in range(quantos)]

        class ArmazemFalso:
            def __init__(self, *a, **k) -> None: ...
            def __enter__(self): return self
            def __exit__(self, *a) -> None: ...
            def snapshot(self, nao_somaveis=frozenset()): return falso

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

    def test_encolher_em_INDICADORES_tambem_e_recusado(self) -> None:
        """O que o cron fez em 14/09/2026, com a trava de 07/09 já no lugar.

        A contagem de municípios ficou **idêntica** — 5.571 antes e depois —,
        então a trava não armou. O que encolheu foi outra dimensão: de **13
        indicadores para 3**, porque o runner faz checkout limpo, o banco é
        `gitignore`d, e o workflow ingere só os três que ele nomeia. O
        `conferir` passou, porque confere os três contra o agregado do IBGE e
        os três estavam certos.

        O commit saiu, a Vercel publicou, e a seção "Como se vive" — água,
        esgoto, lixo, internet, alfabetização, instrução superior — sumiu das
        5.571 páginas e das duas planilhas de download. A página seguiu bem
        formada: existe uma guarda que omite a seção quando não há medida, e
        ela foi escrita para **um** município sem dado no Censo.

        A lição de 07/09 estava escrita e foi implementada em uma dimensão só.
        """
        self._exportar(5571, indicadores=13)
        antes = self.destino.read_text(encoding="utf-8")
        with self.assertRaises(SystemExit) as e:
            self._exportar(5571, indicadores=3)
        self.assertIn("13", str(e.exception))
        self.assertIn("3", str(e.exception))
        self.assertIn("indicadores", str(e.exception))
        self.assertEqual(self.destino.read_text(encoding="utf-8"), antes,
                         "recusar tem de deixar o snapshot bom no lugar")

    def test_encolher_em_UFS_tambem_e_recusado(self) -> None:
        # A terceira dimensão, pela mesma razão: perder um estado inteiro é
        # exatamente tão silencioso quanto perder um indicador.
        self._exportar(5571, ufs=27)
        with self.assertRaises(SystemExit) as e:
            self._exportar(5571, ufs=9)
        self.assertIn("UFs", str(e.exception))

    def test_so_os_CARIMBOS_mudarem_nao_reescreve_o_arquivo(self) -> None:
        """O que o cron fez em 07, 14 e 21/09/2026: três execuções, três commits.

        O workflow diz commitar **apenas quando o dado muda**, e o comentário no
        topo dele é explícito: *"a maior parte das execuções não vai produzir
        commit nenhum... commit vazio semanal seria atividade fabricada, que é
        exatamente o que este projeto não faz."*

        Ele nunca cumpriu isso. O guardião é `git diff --quiet` sobre o arquivo,
        e o arquivo **sempre** difere: `geradoEm` e os treze `coletadoEm` são
        carimbos de hora, refeitos a cada execução. Medido em 21/09: o diff
        inteiro eram os catorze carimbos, com os 72.411 valores byte a byte
        idênticos.

        O custo era um deployment por semana num limite sem expiração que já
        bateu 100% — ~1 GB toda segunda, para republicar o mesmo dado.
        """
        self._exportar(5571, carimbo="2026-09-14T09:00:00")
        antes = self.destino.read_text(encoding="utf-8")
        self.assertEqual(self._exportar(5571, carimbo="2026-09-21T09:00:00"), 0)
        self.assertEqual(self.destino.read_text(encoding="utf-8"), antes,
                         "carimbo novo sobre dado igual não pode reescrever")

    def test_dado_diferente_reescreve_mesmo_com_o_mesmo_carimbo(self) -> None:
        # O outro lado, e é o que impede a trava de virar um mudo: quando o
        # valor muda de verdade, o arquivo tem de ser reescrito.
        self._exportar(5571, carimbo="2026-09-14T09:00:00")
        antes = self.destino.read_text(encoding="utf-8")
        self.assertEqual(self._exportar(5572, carimbo="2026-09-14T09:00:00"), 0)
        self.assertNotEqual(self.destino.read_text(encoding="utf-8"), antes)

    def test_crescer_numa_dimensao_e_encolher_noutra_e_RECUSADO(self) -> None:
        # O caso que uma trava por dimensão única nunca pega: a soma "melhorou"
        # e uma parte sumiu. Nenhum total agregado denunciaria.
        self._exportar(1794, indicadores=13)
        with self.assertRaises(SystemExit):
            self._exportar(5571, indicadores=3)

    def test_coluna_que_perde_VALORES_e_RECUSADA_mesmo_com_as_contagens_iguais(self) -> None:
        # 24/09/2026: com o período vindo da fonte, um período novo gravado
        # pela metade vira o vigente. Municípios, indicadores e UFs ficam
        # iguais; o que encolhe é quantos municípios têm valor na coluna.
        self._exportar(5571, com_valor=5571)
        with self.assertRaises(SystemExit) as ctx:
            self._exportar(5571, com_valor=75)
        self.assertIn("com valor em populacao-estimada", str(ctx.exception))
        self.assertIn("de 5571 para 75", str(ctx.exception))

    def test_coluna_com_os_mesmos_valores_ou_mais_passa(self) -> None:
        self._exportar(5571, com_valor=5570)
        self.assertEqual(self._exportar(5571, com_valor=5571), 0)


class TestPeriodoVigente(unittest.TestCase):
    """Um período por indicador, e tudo dele sai desse período.

    Escrito em 24/09/2026, quando a estimativa e o PIB passaram a buscar o
    período mais recente da fonte. Até então cada indicador tinha um período
    só no banco, e o snapshot dependia disso sem dizer: o valor vinha da coleta
    mais recente de QUALQUER período, e o total da UF somava TODAS as
    observações. Com 2024 e 2026 lado a lado, a coluna misturaria anos e o
    total do estado dobraria.
    """

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Armazem(Path(self.tmp.name) / "obs.db")
        self.db.gravar_municipios(
            [Municipio.de_json(b) for b in json.loads(SERGIPE)])
        self.db.registrar_indicador("pib-municipal", "PIB a preços correntes",
                                    "Mil Reais", 5938, 37)
        self.antigo = list(serie(lambda u: Resposta(200, PIB_SE), 5938, "2021",
                                 37, ufs=[28], dormir=lambda _: None))
        self.db.gravar_observacoes("pib-municipal", self.antigo)
        # O período novo: o dobro do valor, para os números não se confundirem,
        # e SEM o primeiro município (que na vida real seria um ausente).
        self.novo = [Observacao(o.municipio, "2023",
                                None if o.valor is None else o.valor * 2, o.origem)
                     for o in self.antigo[1:]]
        self.db.gravar_observacoes("pib-municipal", self.novo)

    def tearDown(self) -> None:
        self.db.fechar()
        self.tmp.cleanup()

    def _coluna(self, snap):
        i = snap["colunas"].index("pib-municipal")
        return {l[0]: l[i] for l in snap["municipios"]}

    def test_o_periodo_publicado_e_o_mais_novo_comparado_como_numero(self) -> None:
        self.assertEqual(self.db.periodo_vigente("pib-municipal"), "2023")
        snap = self.db.snapshot()
        self.assertEqual(snap["indicadores"][0]["periodo"], "2023")

    def test_os_valores_sao_todos_do_periodo_vigente(self) -> None:
        coluna = self._coluna(self.db.snapshot())
        for o in self.novo:
            self.assertEqual(coluna[o.municipio], o.valor)

    def test_quem_falta_no_periodo_novo_fica_SEM_valor_e_nao_com_o_antigo(self) -> None:
        # O defeito calado: a coluna diria "2023" e mostraria o 2021 dele.
        faltante = self.antigo[0].municipio
        self.assertIsNone(self._coluna(self.db.snapshot())[faltante])

    def test_o_total_da_uf_nao_soma_os_dois_periodos(self) -> None:
        snap = self.db.snapshot()
        esperado = sum(o.valor for o in self.novo if o.valor is not None)
        self.assertAlmostEqual(snap["ufs"][0]["totais"]["pib-municipal"],
                               esperado, places=2)
        self.assertAlmostEqual(snap["indicadores"][0]["totalRegiao"],
                               esperado, places=2)

    def test_revisao_no_mesmo_periodo_conta_uma_vez_so(self) -> None:
        # O IBGE revisa: o valor anterior fica no banco como história, e só o
        # último entra no retrato e no total.
        alvo = self.novo[0]
        revisado = Observacao(alvo.municipio, "2023", alvo.valor + 1000, alvo.origem)
        self.db.gravar_observacoes("pib-municipal", [revisado])
        snap = self.db.snapshot()
        self.assertEqual(self._coluna(snap)[alvo.municipio], alvo.valor + 1000)
        esperado = sum(o.valor for o in self.novo if o.valor is not None) + 1000
        self.assertAlmostEqual(snap["ufs"][0]["totais"]["pib-municipal"],
                               esperado, places=2)


class TestPeriodoMaisRecente(unittest.TestCase):
    def _resolver(self, corpo):
        from observatorio.ibge import periodo_mais_recente
        return periodo_mais_recente(lambda u: Resposta(200, corpo), 6579,
                                    dormir=lambda _: None)

    def test_escolhe_pelo_numero_e_nao_pela_ordem(self) -> None:
        self.assertEqual(
            self._resolver('[{"id":"2026"},{"id":"2020"},{"id":"2025"}]'), "2026")

    def test_periodo_que_nao_e_ano_e_recusado(self) -> None:
        from observatorio.ibge import ErroIBGE
        with self.assertRaises(ErroIBGE):
            self._resolver('[{"id":"2024"},{"id":"202403"},{"id":"2024-T1"}]')

    def test_lista_vazia_e_recusada(self) -> None:
        from observatorio.ibge import ErroIBGE
        with self.assertRaises(ErroIBGE):
            self._resolver("[]")


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
