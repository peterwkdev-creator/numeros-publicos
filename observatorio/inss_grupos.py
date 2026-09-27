"""Os grupos do INSS: a unidade de página, e a ponte entre serviço e espécie.

A fila (pendentes) usa código de SERVIÇO; os negados usam código de ESPÉCIE.
Não há código comum entre os dois arquivos, então esta tabela é nossa, e
cada linha foi conferida contra os dados de 2026 (ver `especs/`, §10 e §11,
no repositório da raiz). A espécie não separa pessoa com deficiência nem
acordo internacional, por isso a página é por GRUPO, e não por serviço.

Todo código que aparece no banco tem de cair em exatamente um grupo ou em
`SEM_PAGINA_*`. Um código novo reprova a ingestão (`codigos_desconhecidos`):
serviço que surge num mês e some calado de todas as páginas é o defeito que
esta lista existe para impedir.
"""

from __future__ import annotations

from dataclasses import dataclass

# Mínimo de pedidos num recorte (grupo, serviço ou clientela) para publicar a
# mediana. Medido em 26/09/2026 comparando junho × julho (fila) e julho ×
# agosto (negados): de 1.000 para cima, a mediana se move junto com a fila
# inteira (que encolheu 15% no mês); abaixo de ~500, oscila de 25% a 100%
# para os dois lados (pecúlio +31%, aposentadoria especial negada -53%).
MINIMO_PEDIDOS = 1000


@dataclass(frozen=True)
class Grupo:
    chave: str                 # vira o endereço da página
    nome: str                  # o nome oficial, como o INSS escreve
    nome_popular: str          # o que as pessoas buscam ("BPC LOAS")
    servicos: frozenset[int]   # códigos da fila
    especies: frozenset[int]   # códigos dos negados
    # Prazo do acordo no STF (RE 1.171.152, Tema 1066), em dias, ou None se o
    # grupo não está na tabela do acordo. O acordo valia 24 meses: a página o
    # cita como referência datada, nunca como obrigação vigente (§11).
    prazo_acordo: int | None
    # O prazo do acordo conta do PEDIDO? Nos benefícios com perícia médica ou
    # avaliação social ele só começa depois delas (Cláusula 2.2), e a idade da
    # fila não é comparável com ele. None quando não há prazo.
    prazo_conta_do_pedido: bool | None


GRUPOS: tuple[Grupo, ...] = (
    Grupo("auxilio-doenca", "Auxílio por incapacidade temporária", "auxílio-doença",
          frozenset({17437, 5474, 5473, 13995, 6266, 4612, 5832, 5852}),
          frozenset({31, 91, 32, 92}), 45, False),
    Grupo("bpc-deficiencia", "Benefício assistencial à pessoa com deficiência",
          "BPC LOAS", frozenset({1655}), frozenset({87}), 90, False),
    Grupo("bpc-idoso", "Benefício assistencial ao idoso", "BPC LOAS do idoso",
          frozenset({1657}), frozenset({88}), 90, False),
    Grupo("auxilio-acidente", "Auxílio-acidente", "auxílio-acidente",
          frozenset({4852}), frozenset({36, 94}), 60, False),
    Grupo("aposentadoria-por-idade", "Aposentadoria por idade", "aposentadoria por idade",
          frozenset({2772, 1671, 2812, 3653, 3742, 6492}), frozenset({41}), 90, True),
    Grupo("aposentadoria-por-tempo-de-contribuicao", "Aposentadoria por tempo de contribuição",
          "aposentadoria por tempo de contribuição",
          frozenset({3372, 2773, 3743, 6452}), frozenset({42, 57, 46}), 90, True),
    Grupo("pensao-por-morte", "Pensão por morte", "pensão por morte",
          frozenset({1659, 1658, 3770, 3769}), frozenset({21, 93}), 60, True),
    Grupo("salario-maternidade", "Salário-maternidade", "salário-maternidade",
          frozenset({1675, 1674, 3746}), frozenset({80}), 30, True),
    Grupo("auxilio-reclusao", "Auxílio-reclusão", "auxílio-reclusão",
          frozenset({4613, 4632}), frozenset({25}), 60, True),
    Grupo("auxilio-inclusao", "Auxílio-inclusão à pessoa com deficiência",
          "auxílio-inclusão", frozenset({14835, 14836}), frozenset({18}), None, None),
)

# Conhecidos e sem página: volume pequeno demais para mediana, ou sem par do
# outro lado. Estão aqui para que não reprovem a ingestão — e para que a
# decisão de não publicá-los fique escrita, e não implícita.
SEM_PAGINA_SERVICOS = frozenset({
    5412,    # pensão especial — talidomida
    15255,   # pensão vitalícia — dependentes de seringueiro
    15235,   # pensão vitalícia — seringueiro
    15256,   # pensão especial — hemodiálise de Caruaru (Lei 9.793/99)
    5332,    # pensão especial — síndrome congênita do zika
    4614,    # assistencial ao trabalhador portuário avulso
    4633,    # pecúlio
})
SEM_PAGINA_ESPECIES = frozenset({
    56,      # pensão vitalícia — talidomida
    86,      # pensão vitalícia — dependentes de seringueiro
    85,      # pensão vitalícia — seringueiros
    54,      # pensão especial vitalícia — Lei 9.793/99
    98,      # assistencial ao trabalhador portuário avulso
    67,      # pecúlio obrigatório ex-Ipase
    60,      # benefício indenizatório a cargo da União (sem serviço na fila)
    16,      # auxílio União (sem serviço na fila)
})

_POR_SERVICO = {s: g for g in GRUPOS for s in g.servicos}
_POR_ESPECIE = {e: g for g in GRUPOS for e in g.especies}


def grupo_do_servico(codigo: int) -> Grupo | None:
    return _POR_SERVICO.get(codigo)


def grupo_da_especie(codigo: int) -> Grupo | None:
    return _POR_ESPECIE.get(codigo)


def codigos_desconhecidos(servicos=(), especies=()) -> tuple[set[int], set[int]]:
    """Os códigos que não estão em grupo nenhum nem na lista sem página."""
    return ({s for s in servicos if s not in _POR_SERVICO and s not in SEM_PAGINA_SERVICOS},
            {e for e in especies if e not in _POR_ESPECIE and e not in SEM_PAGINA_ESPECIES})


def publicavel(n: int) -> bool:
    return n >= MINIMO_PEDIDOS
