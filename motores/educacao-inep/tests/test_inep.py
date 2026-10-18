"""As quatro armadilhas do INEP, uma classe cada.

Cada uma foi medida contra o arquivo real em 03/09/2026 e nenhuma estoura
sozinha: todas publicam número errado e ficam quietas. Um teste por armadilha é
o que impede a próxima sessão de reintroduzi-las sem perceber.
"""

import unittest

from educacao import inep
from tests import fixtures


class RedeNaoEhAtributo(unittest.TestCase):
    """Armadilha 1: `CO_MUNICIPIO` não é chave; `REDE` é a outra metade."""

    def test_o_mesmo_municipio_aparece_em_varias_redes(self):
        xlsx = fixtures.planilha_bytes()
        todas = list(inep.ler(xlsx, "anos_iniciais",
                              redes=("Municipal", "Estadual", "Federal")))
        saoluis = {l.rede for l in todas if l.codigo_ibge == 2111300}
        self.assertEqual(saoluis, {"Municipal", "Estadual", "Federal"},
                         "o município colapsou numa linha só")

    def test_o_padrao_le_apenas_a_rede_municipal(self):
        """É o gasto do município que aparece ao lado no painel; um índice que
        inclui escola estadual creditaria à prefeitura o que ela não administra."""
        xlsx = fixtures.planilha_bytes()
        redes = {l.rede for l in inep.ler(xlsx, "anos_iniciais")}
        self.assertEqual(redes, {"Municipal"})

    def test_a_rede_agregada_nao_pode_ser_lida_junto_com_as_partes(self):
        """`Pública` é o AGREGADO das outras. Lida junto, conta o mesmo aluno
        duas vezes — e a soma não denunciaria, porque ela não é soma
        aritmética das outras: é um índice próprio."""
        xlsx = fixtures.planilha_bytes()
        with self.assertRaises(ValueError) as erro:
            list(inep.ler(xlsx, "anos_iniciais",
                          redes=("Municipal", inep.REDE_AGREGADA)))
        self.assertIn("agregado", str(erro.exception).lower())

    def test_a_rede_agregada_sozinha_e_permitida(self):
        """Ler só o agregado é legítimo — é outra pergunta, não um erro."""
        xlsx = fixtures.planilha_bytes()
        linhas = list(inep.ler(xlsx, "anos_iniciais",
                               redes=(inep.REDE_AGREGADA,)))
        self.assertTrue(linhas)
        self.assertEqual({l.rede for l in linhas}, {inep.REDE_AGREGADA})

    def test_rede_desconhecida_falha_alto(self):
        with self.assertRaises(ValueError):
            list(inep.ler(fixtures.planilha_bytes(), "anos_iniciais",
                          redes=("Particular",)))


class AusenciaEhTraco(unittest.TestCase):
    """Armadilha 2: a fonte escreve `"-"`, não célula vazia."""

    def test_o_traco_vira_none_e_nunca_zero(self):
        self.assertIsNone(inep._numero("-"))
        self.assertIsNone(inep._numero(" - "))
        self.assertIsNone(inep._numero(None))

    def test_zero_de_verdade_sobrevive(self):
        """Zero é um resultado; ausência não é. Colapsá-los perde a diferença
        para sempre."""
        self.assertEqual(inep._numero(0), 0.0)
        self.assertEqual(inep._numero("0"), 0.0)

    def test_valor_estranho_falha_em_vez_de_virar_zero(self):
        """Se o INEP passar a usar outra marca de ausência, é para estourar —
        um `errors="coerce"` silencioso transformaria a marca nova em NaN, que
        vira zero na primeira agregação."""
        with self.assertRaises(ValueError):
            inep._numero("aproximadamente 5")

    def test_edicao_sem_nenhum_indicador_nao_vira_linha(self):
        """Imperatriz não tem observado em 2021, mas tem projeção — então a
        linha existe. Uma edição inteiramente vazia não vira observação."""
        linhas = list(inep.ler(fixtures.planilha_bytes(), "anos_iniciais"))
        imp2021 = [l for l in linhas
                   if l.codigo_ibge == 2105302 and l.edicao == 2021]
        self.assertEqual(len(imp2021), 1)
        self.assertIsNone(imp2021[0].observado, "o traço virou número")
        self.assertEqual(imp2021[0].projecao, 5.2)


class CabecalhoNaLinhaDez(unittest.TestCase):
    """Armadilha 3: as seis primeiras linhas são timbre do Ministério."""

    def test_le_os_nomes_de_maquina_e_nao_o_timbre(self):
        linhas = list(inep.ler(fixtures.planilha_bytes(), "anos_iniciais"))
        self.assertTrue(linhas)
        self.assertEqual(linhas[0].uf, "MA")
        self.assertIn(linhas[0].nome, {"São Luís", "Imperatriz"})

    def test_planilha_reformatada_falha_alto_em_vez_de_ler_lixo(self):
        """O canário do sistema. O INEP reformata entre divulgações, e ler o
        timbre como cabeçalho não estoura — só produz colunas chamadas `None`
        e uma primeira linha de dados que é o nome do Ministério."""
        deslocada = fixtures.planilha_bytes(cabecalho_na_linha=8)
        with self.assertRaises(ValueError) as erro:
            list(inep.ler(deslocada, "anos_iniciais"))
        self.assertIn("SG_UF", str(erro.exception))

    def test_a_ultima_edicao_nao_tem_meta_como_no_arquivo_real(self):
        """2023 nao tem meta publicada: o primeiro ciclo do IDEB encerrou em
        2021. A fixture reproduz isso para que o caso seja testavel."""
        linhas = list(inep.ler(fixtures.planilha_bytes(), "anos_iniciais"))
        ultima = fixtures.EDICOES[-1]
        metas = [l.projecao for l in linhas if l.edicao == ultima]
        self.assertTrue(metas, "a fixture perdeu a última edição")
        self.assertTrue(all(m is None for m in metas),
                        "a última edição tem meta, e o real não tem")

    def test_as_edicoes_saem_dos_nomes_de_coluna(self):
        """Não de uma lista fixa: uma divulgação nova acrescenta
        `VL_OBSERVADO_2025` e o leitor tem de encontrá-la sozinho."""
        linhas = list(inep.ler(fixtures.planilha_bytes(), "anos_iniciais"))
        self.assertEqual(sorted({l.edicao for l in linhas}), [2021, 2023])


class DownloadVazioEhErro(unittest.TestCase):
    """Armadilha 4: sem `User-Agent`, o INEP devolve 200 com corpo vazio."""

    def test_corpo_vazio_estoura_em_vez_de_gravar_arquivo_vazio(self):
        with self.assertRaises(inep.ArquivoVazio) as erro:
            inep.baixar("http://exemplo/x.zip", lambda url, cab: b"")
        self.assertIn("User-Agent", str(erro.exception))

    def test_o_user_agent_e_enviado(self):
        vistos = {}

        def transporte(url, cabecalhos):
            vistos.update(cabecalhos)
            return b"conteudo"

        inep.baixar("http://exemplo/x.zip", transporte)
        self.assertIn("User-Agent", vistos)


class RetentativaDeDownload(unittest.TestCase):
    """23 MB pela conexão do INEP caem no meio. Medido em 03/09/2026:
    `WinError 10054` na primeira tentativa, três seguintes passando."""

    def test_falha_de_rede_e_retentada(self):
        chamadas = []
        esperas = []

        def transporte(url, cab):
            chamadas.append(url)
            if len(chamadas) < 3:
                raise ConnectionResetError("conexão resetada pelo host remoto")
            return b"conteudo"

        dados = inep.baixar("http://exemplo/x.zip", transporte, esperas.append)
        self.assertEqual(dados, b"conteudo")
        self.assertEqual(len(chamadas), 3)
        self.assertEqual(esperas, [2.0, 4.0], "a espera tem de dobrar")

    def test_desiste_depois_do_limite_e_diz_qual_foi_a_ultima_falha(self):
        def sempre_falha(url, cab):
            raise ConnectionResetError("caiu de novo")

        with self.assertRaises(RuntimeError) as erro:
            inep.baixar("http://exemplo/x.zip", sempre_falha, lambda s: None)
        self.assertIn("ConnectionResetError", str(erro.exception))
        self.assertIn("caiu de novo", str(erro.exception))

    def test_corpo_vazio_NAO_e_retentado(self):
        """Não é falha de rede: é a resposta a um pedido errado. Repetir daria
        quatro respostas vazias idênticas e uma mensagem de erro pior."""
        chamadas = []

        def vazio(url, cab):
            chamadas.append(url)
            return b""

        with self.assertRaises(inep.ArquivoVazio):
            inep.baixar("http://exemplo/x.zip", vazio, lambda s: None)
        self.assertEqual(len(chamadas), 1, "retentou uma resposta vazia")


class Md5DoProprioInep(unittest.TestCase):
    """A régua que a fonte dá de graça — e o que transforma a armadilha 4 de
    falha silenciosa em falha alta."""

    def test_confere_e_devolve_o_nome_do_xlsx(self):
        nome = inep.conferir_md5(fixtures.zip_bytes())
        self.assertTrue(nome.endswith(".xlsx"))

    def test_md5_divergente_estoura(self):
        with self.assertRaises(inep.Md5NaoConfere) as erro:
            inep.conferir_md5(fixtures.zip_bytes(md5_correto=False))
        self.assertIn("md5", str(erro.exception).lower())

    def test_zip_sem_md5_estoura_em_vez_de_seguir_confiando(self):
        """Ausência de régua não é aprovação — a mesma regra do `fecha` do
        painel fiscal."""
        with self.assertRaises(inep.Md5NaoConfere):
            inep.conferir_md5(fixtures.zip_bytes(com_md5=False))

    def test_extrair_confere_antes_de_devolver(self):
        with self.assertRaises(inep.Md5NaoConfere):
            inep.extrair_xlsx(fixtures.zip_bytes(md5_correto=False))
        dados = inep.extrair_xlsx(fixtures.zip_bytes())
        self.assertTrue(list(inep.ler(dados, "anos_iniciais")))


class UrlDaFonte(unittest.TestCase):
    def test_monta_a_url_da_etapa(self):
        self.assertEqual(
            inep.url_de("anos_finais"),
            f"{inep.BASE}/divulgacao_anos_finais_municipios_2025.zip")

    def test_etapa_desconhecida_falha(self):
        with self.assertRaises(ValueError):
            inep.url_de("ensino_medio")


if __name__ == "__main__":
    unittest.main()
