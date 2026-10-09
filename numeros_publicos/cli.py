"""Linha de comando do Observatório NE.

    python -m numeros_publicos ingerir-municipios
    python -m numeros_publicos municipios --uf SE
    python -m numeros_publicos coletas
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path as Path_

from .armazem import Armazem
from .ibge import (
    MAIS_RECENTE,
    PAUSA_PADRAO,
    ErroIBGE,
    buscar_json,
    periodo_mais_recente,
    metadados_da_serie,
    total_da_regiao,
    url_serie_regiao,
    REGIAO_NORDESTE,
    municipios as buscar_municipios,
    Media,
    Serie,
    serie as buscar_serie,
    transporte_http,
    url_serie,
)

#: Os nove estados do Nordeste, por código IBGE. Explícito e não derivado:
#: a lista é estável desde 1988 e vale mais legível que calculada.
UFS_NORDESTE = {
    21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB",
    26: "PE", 27: "AL", 28: "SE", 29: "BA",
}

UFS_BRASIL = {
    11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
    **UFS_NORDESTE,
    31: "MG", 32: "ES", 33: "RJ", 35: "SP",
    41: "PR", 42: "SC", 43: "RS",
    50: "MS", 51: "MT", 52: "GO", 53: "DF",
}

#: O recorte é **bandeira, não pressuposto** — o mesmo desenho do
#: `sys-educacao-inep`. Cravar o Nordeste no código transformaria a expansão
#: numa refatoração; sendo parâmetro, ela é um comando.
#:
#: O segundo item é o nível em que o IBGE publica o total de conferência:
#: `2` é a região Nordeste (N2), `None` é o Brasil (N1). Sem isso, a ingestão
#: nacional somaria 5.571 municípios e compararia com o total do Nordeste,
#: batendo de frente com a única verificação que este sistema tem.
RECORTES = {
    "NE": (UFS_NORDESTE, REGIAO_NORDESTE),
    "BR": (UFS_BRASIL, None),
}

#: O padrão é **BR desde 07/09/2026**, e a troca custou o site inteiro por
#: algumas horas.
#:
#: A expansão nacional de 03/09 foi feita passando `--regiao BR` à mão. O padrão
#: continuou `NE`, e ninguém notou porque ninguém mais digitava o comando — até
#: a segunda-feira seguinte, quando o cron semanal do workflow o digitou. Ele
#: chama `ingerir-*` e `exportar` **sem bandeira**, reingeriu 1.794 municípios
#: por cima de 5.571, commitou e a Vercel publicou. O site passou a devolver 404
#: em 3.777 páginas de município e 18 de estado, várias já indexadas.
#:
#: E o `conferir`, que existe para falhar ANTES de publicar número errado,
#: **liberou**: com o mesmo padrão, ele somou o Nordeste e comparou com o total
#: do Nordeste. Bateu. Uma verificação que herda o parâmetro do que ela deveria
#: verificar não verifica nada.
#:
#: A lição que fica é a do recorte como bandeira, levada até o fim: **o padrão
#: de uma bandeira é uma decisão, e ele envelhece.** Quem passa a bandeira à mão
#: não percebe o padrão apodrecer; quem percebe é o processo automático, no pior
#: momento possível.
PADRAO_RECORTE = "BR"


def recorte_de(args) -> tuple[dict[int, str], int | None]:
    """As UFs e o nível de conferência do recorte pedido."""
    return RECORTES[getattr(args, "regiao", PADRAO_RECORTE)]


def br(valor: float | None, casas: int = 0) -> str:
    """Número no formato brasileiro: milhar com ponto, decimal com vírgula.

    O `.replace(",", ".")` ingênuo produzia `30.663.6` — dois separadores de
    milhar e nenhum decimal. Trocar os dois exige um marcador temporário.
    """
    if valor is None:
        return "—"
    texto = f"{valor:,.{casas}f}"
    # str.translate troca os dois separadores numa passada so, sem
    # marcador temporario -- que foi como a primeira tentativa produziu
    # 30.663.6: dois separadores de milhar e nenhum decimal.
    return texto.translate(str.maketrans(",.", ".,"))


#: Acima disto, a diferença deixa de ser arredondamento e vira problema.
#: 1e-6 = um milionésimo: no PIB do Nordeste (R$ 1,24 trilhão em mil reais)
#: tolera ~1.243 de diferença, e um único município faltando pesaria milhares
#: de vezes mais que isso.
TOLERANCIA_RELATIVA = 1e-6


def _com_valor(db: Armazem, codigo: str, periodo: str | None) -> int:
    return sum(1 for v in db.valores_vigentes(codigo, periodo).values()
               if v is not None)


def conferir_media(db: Armazem, codigo: str, media: Media,
                   periodo: str | None) -> tuple[bool, str]:
    """A média publicada contra `total × fator ÷ contagem`, município a
    município. Devolve `(confere?, texto)`. Ver `Media` para o porquê.

    O limite de cada município é o erro que o arredondamento DA FONTE permite,
    e nada mais: meio na contagem (`média × 0,5 / n`), meio na unidade do total
    (`0,5 × fator / n`) e meio centavo na própria média.
    """
    medias = db.valores_vigentes(codigo, periodo)
    p_total = db.periodo_vigente(media.total)
    p_contagem = db.periodo_vigente(media.contagem)
    if not medias:
        return False, "DIVERGE: nenhuma média gravada"
    if p_total != periodo or p_contagem != periodo:
        # Média de 2024 contra total de 2023 não confere nada, e passaria.
        return False, (f"DIVERGE: períodos diferentes -- média {periodo}, "
                       f"{media.total} {p_total}, {media.contagem} {p_contagem}")
    totais = db.valores_vigentes(media.total, periodo)
    contagens = db.valores_vigentes(media.contagem, periodo)

    fora: list[int] = []
    sem_par: list[int] = []
    pior = 0.0
    conferidos = 0
    for municipio in sorted(set(medias) | set(contagens)):
        o = medias.get(municipio)
        t = totais.get(municipio)
        n = contagens.get(municipio)
        if not n:
            # Sem ninguém para dividir, não há média a cobrar -- mas também não
            # pode haver uma média positiva inventada.
            if o:
                sem_par.append(municipio)
            continue
        if o is None or t is None:
            sem_par.append(municipio)
            continue
        derivada = t * media.fator / n
        limite = o * 0.5 / n + 0.5 * media.fator / n + 0.005
        pior = max(pior, abs(derivada - o) / limite)
        conferidos += 1
        if abs(derivada - o) > limite:
            fora.append(municipio)

    base = (f"média contra {media.total} ÷ {media.contagem} em "
            f"{br(conferidos)} municípios, pior caso {pior:.0%} do limite")
    if fora or sem_par:
        amostra = ", ".join(str(c) for c in (fora + sem_par)[:5])
        return False, (f"DIVERGE: {len(fora)} fora do limite, {len(sem_par)} "
                       f"sem o par ({amostra}) · {base}")
    return True, f"confere ({base})"


def conferir(args, transporte=None) -> int:
    """Soma dos municípios × total regional publicado pelo IBGE.

    É a prova de integridade da ingestão: pega município faltando, duplicado ou
    mal somado numa comparação só, contra a própria fonte.

    **Igualdade exata é o teste errado**, e a primeira execução real mostrou por
    quê: o PIB fechou com diferença de 5 em 1.243.103.280. O IBGE publica o PIB
    municipal em *Mil Reais* já arredondado, e calcula o agregado regional antes
    de arredondar — soma de partes arredondadas não bate com o total arredondado.
    Esconder isso alargando a tolerância seria mentir; o certo é **classificar**:
    arredondamento é uma coisa, município faltando é outra, e a diferença
    relativa separa as duas com folga de várias ordens de grandeza.
    """
    transporte = transporte or transporte_http()
    with Armazem(args.banco) as db:
        indicadores = db.indicadores()
        if not indicadores:
            print("Nenhum indicador ingerido ainda.")
            return 0
        divergiu = False
        for ind in indicadores:
            s = INDICADORES[ind["codigo"]]
            # O período que o SITE publica (o vigente no banco), e não o do
            # registro: com `MAIS_RECENTE` o registro nem tem ano, e conferir
            # outro período aprovaria um número que não é o exibido.
            periodo = db.periodo_vigente(ind["codigo"])
            if s.media is not None:
                ok, texto = conferir_media(db, ind["codigo"], s.media, periodo)
                divergiu = divergiu or not ok
                print(f"  {ind['codigo']:<24} {periodo}  {texto}")
                continue
            _, nivel = recorte_de(args)
            # A classificação vai junto, e não é detalhe: sem ela a soma dos
            # municípios (só "Superior completo") seria comparada com o total
            # regional de TODOS os níveis de instrução, e o indicador nasceria
            # divergindo em centenas de por cento -- um alarme falso que ensina
            # a ignorar o único verificador de completude que o sistema tem.
            url = url_serie_regiao(ind["agregado"], periodo, ind["variavel"],
                                   nivel, s.classificacao)
            oficial = total_da_regiao(buscar_json(transporte, url))
            nossa = db.con.execute(
                "SELECT SUM(valor) FROM observacao WHERE indicador = ?"
                " AND periodo = ?", (ind["codigo"], periodo)).fetchone()[0]

            if nossa is None:
                print(f"  {ind['codigo']:<24} sem observações gravadas")
                continue
            if oficial is None:
                print(f"  {ind['codigo']:<24} IBGE não publicou o total regional")
                continue
            diferenca = oficial - nossa
            relativa = abs(diferenca) / oficial if oficial else 0.0
            if abs(diferenca) < 0.5:
                veredito = "confere"
            elif relativa < TOLERANCIA_RELATIVA:
                veredito = (f"confere (arredondamento: {br(diferenca)} em "
                            f"{br(oficial)}, {relativa:.1e})")
            elif s.amostra and abs(diferenca) <= 0.5 * (n := _com_valor(
                    db, ind["codigo"], periodo)):
                # Só para quem DECLARA ser amostra expandida: cada município
                # arredondado por conta própria pode afastar a soma do total
                # em meio por município. Um município inteiro faltando, com
                # menos de 0,5 × n, passaria aqui -- e é o preço, pago só por
                # esses indicadores e dito na saída. A falta de município é
                # também o que a trava do encolhimento mede, por outro lado.
                veredito = (f"confere (arredondamento da amostra: "
                            f"{br(diferenca)} ≤ 0,5 × {br(n)} municípios)")
            else:
                veredito = f"DIVERGE em {br(diferenca)} ({relativa:.2%})"
                divergiu = True
            print(f"  {ind['codigo']:<24} {periodo}  municípios {br(nossa)} · "
                  f"IBGE (região) {br(oficial)} · {veredito}")
    return 1 if divergiu else 0


def ingerir_municipios(args, transporte=None, dormir=None) -> int:
    """`transporte` e `dormir` são injetados pelo teste ponta a ponta."""
    extra = {} if dormir is None else {"dormir": dormir}
    todas, _ = recorte_de(args)
    ufs = [args.uf] if args.uf else list(todas)
    print(f"Ingerindo municípios de {len(ufs)} UF(s) "
          f"[{getattr(args, 'regiao', PADRAO_RECORTE)}], pausa {args.pausa}s.")

    lidos = novos = inalterados = 0
    erro = None
    with Armazem(args.banco) as db:
        try:
            achados = list(buscar_municipios(
                transporte or transporte_http(), ufs=ufs,
                pausa=args.pausa, **extra))
            lidos = len(achados)
            novos, inalterados = db.gravar_municipios(achados)
        except (Exception, KeyboardInterrupt) as e:
            # Qualquer interrupção, não só a prevista: o que já veio vale, e a
            # lição de capturar só o erro esperado já foi paga no radar.
            erro = f"{type(e).__name__}: {e}"
            print(f"\n[!] interrompido: {erro}", file=sys.stderr)
        db.anotar_coleta("municipios", lidos, novos, inalterados, erro)
        contagem = db.contagem_por_uf()

    print(f"\n{lidos} lidos · {novos} novos · {inalterados} já conhecidos")
    if contagem:
        print("  " + " · ".join(f"{uf} {n}" for uf, n in contagem.items()))
        print(f"  total no banco: {sum(contagem.values())}")
    return 1 if erro else 0


#: Só entra aqui combinação de agregado/variável/período **verificada contra a
#: API**. Duas outras (densidade demográfica e o agregado 4709) devolveram
#: HTTP 500 e ficaram de fora — escrevê-las pelo catálogo seria promessa falsa.
INDICADORES: dict[str, Serie] = {
    "populacao-censo-2022": Serie(4714, "2022", 93),
    # Estas duas a fonte ATUALIZA todo ano: a estimativa sai em agosto, o PIB
    # municipal em dezembro. `MAIS_RECENTE` pergunta à API qual é o último
    # período na hora de ingerir, e o cron passa a trazer o ano novo sozinho.
    # O Censo e os pares abaixo ficam com o ano escrito: são de uma edição só.
    "populacao-estimada":   Serie(6579, MAIS_RECENTE, 9324),
    "pib-municipal":        Serie(5938, MAIS_RECENTE, 37),

    # --- Censo 2022: pares numerador/denominador ---------------------------
    #
    # **Sempre o ABSOLUTO, nunca a variável de percentual do IBGE**, e não é
    # preferência: `conferir` soma os municípios e compara com o total que a
    # fonte publica. Somar 5.570 percentuais dá ~504.000 contra um N1 de 93 --
    # reprovaria sempre, e a "correção" tentadora seria afrouxar a tolerância,
    # o que desligaria a verificação para o PIB e a população junto.
    #
    # O percentual é derivado do par, e a derivação foi conferida contra a
    # própria fonte: dá 93,0% de alfabetização e 89,2% de internet, batendo
    # com as variáveis de taxa que o IBGE publica (93,00 e 89,16).
    #
    # Os três indicadores de saneamento dividem UM denominador: os "Total" dos
    # agregados 6803, 6805 e 6892 são o mesmo número (72.456.368), conferido.

    "domicilios-total":       Serie(6803,  "2022",   381, "1821[72129]"),
    "agua-rede-geral":        Serie(6803,  "2022",   381, "1821[72144]"),
    # 46290 é o composto (rede geral + pluvial + fossa ligada à rede), e não o
    # 72110, que conta só "rede geral ou pluvial". O composto é o agrupamento
    # que o próprio IBGE publica acima dos seus componentes.
    "esgoto-rede":            Serie(6805,  "2022",   381, "11558[46290]"),
    "lixo-coletado":          Serie(6892,  "2022",   381, "67[2520]"),

    "moradores-10-mais":      Serie(10201, "2022", 13436, "2072[77584]|133[95278]"),
    "internet-domicilio":     Serie(10201, "2022", 13436, "2072[77585]|133[95278]"),

    "pessoas-18-mais":        Serie(10061, "2022",  2667,
                                    "1568[120704]|58[95253]|2[6794]|86[95251]"),
    "superior-completo":      Serie(10061, "2022",  2667,
                                    "1568[99713]|58[95253]|2[6794]|86[95251]"),

    # Alfabetização entra pelo 9542 e NÃO pelo 9543: o 9543 publica só a taxa,
    # sem absoluto, e seria o único indicador do site fora do alcance do
    # `conferir`.
    "pessoas-15-mais":        Serie(9542,  "2022",   950,
                                    "59[93024]|2[6794]|86[95251]|287[100362]"),
    "alfabetizados-15-mais":  Serie(9542,  "2022",   950,
                                    "59[1023]|2[6794]|86[95251]|287[100362]"),

    # --- Trabalho e renda (29/09/2026) ------------------------------------
    #
    # Do Censo 2022, onde a pessoa MORA. É a única taxa de desocupação oficial
    # para os 5.570 municípios: a PNAD Contínua, que é a atual, só vai até
    # estados e capitais. Os três agregados são da amostra -- ver `amostra`.
    # Os totais "Total" das outras classificações vão explícitos pela mesma
    # razão de sempre: sem eles a resposta cruza sexo, cor e instrução.
    "forca-de-trabalho-14-mais": Serie(
        9517, "2022", 1641, "629[32386]|2[6794]|86[95251]|1568[120704]",
        amostra=True),
    # `-` aqui é zero, e é real: em 29 municípios pequenos ninguém procurava
    # trabalho (Aroeiras do Itaim/PI: força de trabalho 617, ocupados 617).
    "desocupados-14-mais":       Serie(
        9517, "2022", 1641, "629[32446]|2[6794]|86[95251]|1568[120704]",
        amostra=True),
    "ocupados-14-mais":          Serie(
        10264, "2022", 4090, "526[15349]|2[6794]|86[95251]|12064[100971]",
        amostra=True),
    "ocupados-contribuintes":    Serie(
        10264, "2022", 4090, "526[15350]|2[6794]|86[95251]|12064[100971]",
        amostra=True),
    # O denominador da renda NÃO é o de ocupados: é quem tem rendimento de
    # trabalho (87,8 milhões contra 88,7), e é sobre ele que o IBGE calcula.
    "ocupados-com-rendimento":   Serie(
        10281, "2022", 13535, "2[6794]|86[95251]|1568[120704]|526[15349]",
        amostra=True),
    "massa-rendimento-trabalho": Serie(
        10289, "2022", 13424, "2[6794]|86[95251]", amostra=True),
    "rendimento-medio-trabalho": Serie(
        10281, "2022", 13536, "2[6794]|86[95251]|1568[120704]|526[15349]",
        amostra=True,
        media=Media("massa-rendimento-trabalho", "ocupados-com-rendimento")),

    # Do Cadastro Central de Empresas, onde a EMPRESA está -- numa cidade-
    # dormitório os dois recortes divergem, e a página diz por quê. O 9509 é a
    # tabela de todos os municípios; o 9510, vizinho no catálogo, cobre só os
    # 711 com 50 mil habitantes ou mais. O IBGE publica um ano novo por ano, e
    # `MAIS_RECENTE` o traz sozinho.
    "empresas-atuantes":         Serie(9509, MAIS_RECENTE, 367),
    "pessoal-ocupado-empresas":  Serie(9509, MAIS_RECENTE, 707),
    "assalariados-empresas":     Serie(9509, MAIS_RECENTE, 708),
    "assalariado-medio-empresas": Serie(9509, MAIS_RECENTE, 5944),
    "salarios-empresas":         Serie(9509, MAIS_RECENTE, 662),
    "salario-medio-empresas":    Serie(
        9509, MAIS_RECENTE, 10143,
        media=Media("salarios-empresas", "assalariado-medio-empresas",
                    1000 / 13)),
}


#: Os indicadores que são MÉDIA: o snapshot não os soma. Derivado do
#: registro, para não haver uma segunda lista que envelheça.
NAO_SOMAVEIS = frozenset(c for c, s in INDICADORES.items() if s.media)

TODOS = "todos"


def ingerir_indicador(args, transporte=None, dormir=None) -> int:
    """Um indicador, ou **todos** — e `todos` sai do registro, nunca de uma
    lista escrita ao lado.

    ## Por que isto existe

    Escrito em 15/09/2026. O cron semanal nomeava **três** indicadores,
    copiados à mão quando o site tinha três. Em 04 e 05/09 entraram mais dez,
    do Censo 2022, e ninguém voltou ao workflow: ele seguiu correto na forma e
    incompleto no alcance.

    Em 14/09 isso foi ao ar. O runner faz checkout limpo, o banco está no
    `.gitignore`, e o `exportar` retratou fielmente um banco que só tinha os
    três — a seção "Como se vive" saiu das 5.571 páginas e as duas planilhas
    de download perderam dez colunas.

    **Lista copiada para dentro de processo automático envelhece sem avisar**,
    porque quem a copiou não a executa e quem a executa não a lê. É a irmã da
    lição de 07/09 sobre o padrão da bandeira: lá o automático herdava um valor
    velho, aqui ele carrega uma cópia velha. `INDICADORES` é o único lugar onde
    os treze existem; derivar dele não pode ficar para trás.
    """
    if args.indicador != TODOS:
        return _ingerir_um(args, transporte, dormir)

    from copy import copy
    falhou = []
    codigos = sorted(INDICADORES)
    for n, codigo in enumerate(codigos, 1):
        print(f"\n── {n}/{len(codigos)}  {codigo} " + "─" * 40)
        um = copy(args)
        um.indicador = codigo
        if _ingerir_um(um, transporte, dormir) != 0:
            falhou.append(codigo)

    # Parar no primeiro erro deixaria o banco pela metade e o `exportar`
    # seguinte publicaria um retrato encolhido — que é exatamente o defeito que
    # este comando existe para não repetir. Vai até o fim e **sai com erro**,
    # nomeando quem falhou.
    print("\n" + "═" * 60)
    if falhou:
        print(f"{len(falhou)} de {len(codigos)} FALHARAM: {', '.join(falhou)}")
        return 1
    print(f"os {len(codigos)} indicadores do registro foram ingeridos")
    return 0


def _ingerir_um(args, transporte=None, dormir=None) -> int:
    extra = {} if dormir is None else {"dormir": dormir}
    s = INDICADORES[args.indicador]
    agregado, periodo, variavel = s.agregado, s.periodo, s.variavel
    todas, _ = recorte_de(args)
    ufs = [args.uf] if args.uf else list(todas)
    transporte = transporte or transporte_http()

    lidas = novas = inalteradas = 0
    erro = None
    with Armazem(args.banco) as db:
        try:
            # Dentro do `try`: a consulta dos períodos é uma requisição como as
            # outras, e falhar nela tem de ficar registrado na coleta.
            if periodo == MAIS_RECENTE:
                periodo = periodo_mais_recente(
                    transporte, agregado,
                    **({} if dormir is None else {"dormir": dormir}))
            print(f"Ingerindo '{args.indicador}' (agregado {agregado}, período "
                  f"{periodo}, variável {variavel}) em {len(ufs)} UF(s).")
            # O rótulo e a unidade vêm da própria resposta: assim não divergem
            # da fonte nem dependem de alguém digitar certo.
            amostra = buscar_json(transporte, url_serie(agregado, periodo,
                                                        variavel, ufs[0],
                                                        s.classificacao),
                                  **({} if dormir is None else {"dormir": dormir}))
            nome, unidade = metadados_da_serie(amostra)
            db.registrar_indicador(args.indicador, nome, unidade, agregado,
                                   variavel)

            observacoes = list(buscar_serie(transporte, agregado, periodo,
                                            variavel, ufs, pausa=args.pausa,
                                            classificacao=s.classificacao,
                                            **extra))
            lidas = len(observacoes)
            # Período anunciado e ainda vazio (todos os valores ausentes) não
            # se grava: o snapshot escolhe o período MAIS NOVO do banco, e
            # gravá-lo trocaria o número de 5.571 páginas por travessão -- sem
            # mudar nenhuma contagem que a trava do encolhimento lê.
            if observacoes and all(o.valor is None for o in observacoes):
                raise ErroIBGE(
                    f"período {periodo} do agregado {agregado} veio sem nenhum "
                    f"valor em {len(observacoes)} municípios; nada foi gravado")
            novas, inalteradas = db.gravar_observacoes(args.indicador,
                                                       observacoes)
        except (Exception, KeyboardInterrupt) as e:
            erro = f"{type(e).__name__}: {e}"
            print(f"\n[!] interrompido: {erro}", file=sys.stderr)
        db.anotar_coleta(args.indicador, lidas, novas, inalteradas, erro)
        resumo = db.resumo_indicador(args.indicador)

    print(f"\n{lidas} lidas · {novas} novas · {inalteradas} já conhecidas")
    if resumo:
        print(f"\n{'UF':<4}{'munic.':>8}{'c/ valor':>10}{'média':>16}")
        for l in resumo:
            print(f"{l['uf_sigla']:<4}{l['municipios']:>8}{l['com_valor']:>10}"
                  f"{br(l['media'], 1):>16}")
    return 1 if erro else 0


def listar_observacoes(args) -> int:
    with Armazem(args.banco) as db:
        linhas = db.observacoes(args.indicador, args.uf_filtro, args.limite)
        indicadores = {l["codigo"]: l for l in db.indicadores()}
    if not linhas:
        print("Nada gravado para esse indicador — rodar `ingerir-indicador`.")
        return 0
    ind = indicadores.get(args.indicador)
    if ind:
        print(f"{ind['nome']} ({ind['unidade']}) — agregado {ind['agregado']}, "
              f"variável {ind['variavel']}")
    for l in linhas:
        valor = "sem valor" if l["valor"] is None else br(l["valor"])
        print(f"  {l['nome']:<32}{l['uf_sigla']}  {l['periodo']}  {valor:>14}")
    print(f"\n  fonte: {linhas[0]['origem']}")
    print(f"  coletado em: {linhas[0]['coletado_em']}")
    return 0


def exportar(args) -> int:
    """Escreve o snapshot JSON que o painel lê no build.

    A costura entre as duas linguagens é este arquivo — e ela existe para que a
    coleta e a procedência fiquem do lado testável sem rede, e o front não tenha
    responsabilidade nenhuma de buscar dado.
    """
    import json
    from pathlib import Path as _P

    with Armazem(args.banco) as db:
        dados = db.snapshot(nao_somaveis=NAO_SOMAVEIS)

    destino = _P(args.saida)
    destino.parent.mkdir(parents=True, exist_ok=True)

    # ── A trava do ENCOLHIMENTO ────────────────────────────────────────────
    #
    # Escrita em 07/09/2026, depois de um snapshot de 1.794 municípios cair por
    # cima de um de 5.571 e ir ao ar. Nada acusou: o arquivo era JSON válido,
    # completo e internamente coerente; a página de 404 dizia "a lista dos 1.794
    # municípios" com toda a convicção. **Um retrato menor não é um retrato
    # quebrado — e é por isso que nenhuma verificação de forma o pega.**
    #
    # O `conferir` não pegou porque herdava a mesma bandeira: somou o Nordeste,
    # comparou com o total do Nordeste, e concordou.
    #
    # Cobertura não encolhe sozinha. Se encolheu, ou a fonte mudou (e aí é
    # notícia, não rotina) ou o comando foi chamado errado — e nos dois casos o
    # certo é parar. `--permitir-encolher` existe para o dia em que encolher for
    # a intenção, e obriga a dizê-lo.
    #
    # ── E a cobertura tem MAIS DE UMA DIMENSÃO ─────────────────────────────
    #
    # A primeira versão desta trava lia só `municipios`, e em **14/09/2026** o
    # mesmo cron passou por ela: a contagem de municípios ficou idêntica (5.571
    # antes e depois) e o que encolheu foi outra dimensão — de **13 indicadores
    # para 3**. O runner faz checkout limpo, o banco está no `.gitignore`, e o
    # workflow ingere só os três que ele nomeia; o `exportar` então retratou
    # fielmente um banco que só tinha aqueles três.
    #
    # O `conferir` liberou de novo, e desta vez sem herdar bandeira nenhuma:
    # ele soma os indicadores que EXISTEM contra o agregado do IBGE, e os três
    # estavam certos. **Verificação que só olha o que está presente não vê o
    # que falta.**
    #
    # Foi ao ar: a seção "Como se vive" saiu das 5.571 páginas e as duas
    # planilhas de download perderam dez colunas. A página continuou bem
    # formada porque existe uma guarda que omite a seção quando não há medida
    # — escrita para **um** município novo demais para o Censo, e que passou a
    # cobrir o país inteiro sem nada acusar.
    #
    # Por isso a trava percorre as dimensões em vez de uma delas. Acrescentar
    # uma lista aqui custa uma linha; descobrir a que faltava custou o Censo
    # inteiro fora do ar por um dia.
    DIMENSOES = (("municipios", "municípios"),
                 ("indicadores", "indicadores"),
                 ("ufs", "UFs"))

    anterior: dict[str, int] = {}
    velho: dict | None = None
    if destino.exists():
        try:
            velho = json.loads(destino.read_text(encoding="utf-8"))
            anterior = {c: len(velho[c]) for c, _ in DIMENSOES if c in velho}
        except (ValueError, KeyError, OSError) as e:
            # Não engolir: um snapshot ilegível é informação, não ausência de
            # informação. Sem cobertura anterior conhecida, a trava não arma.
            print(f"  [!] snapshot anterior ilegível ({e}); a trava não arma")
            velho = None

    encolheram = [(rotulo, anterior[chave], len(dados[chave]))
                  for chave, rotulo in DIMENSOES
                  if anterior.get(chave) and len(dados[chave]) < anterior[chave]]

    # ── A quarta dimensão: VALORES por coluna ──────────────────────────────
    #
    # Entrou em 24/09/2026, com o período que passou a vir da fonte
    # (`MAIS_RECENTE`). O snapshot publica o período MAIS NOVO do banco, e um
    # período novo gravado pela metade -- uma ingestão com `--uf`, uma UF que
    # falhou no meio -- viraria o vigente com a coluna quase vazia. Municípios,
    # indicadores e UFs continuariam iguais, e as três dimensões acima
    # passariam; 5.500 páginas trocariam o número por travessão. Contar os
    # municípios COM VALOR em cada coluna é o que vê isso.
    def _com_valor(d: dict) -> dict[str, int]:
        colunas = d.get("colunas", [])[3:]
        return {c: sum(1 for linha in d.get("municipios", [])
                       if len(linha) > 3 + j and linha[3 + j] is not None)
                for j, c in enumerate(colunas)}

    if velho is not None:
        antes_v, agora_v = _com_valor(velho), _com_valor(dados)
        encolheram += [(f"municípios com valor em {c}", antes_v[c], agora_v[c])
                       for c in agora_v
                       if c in antes_v and agora_v[c] < antes_v[c]]
    if encolheram and not getattr(args, "permitir_encolher", False):
        raise SystemExit("\n".join([
            "RECUSADO: a cobertura encolheria.",
            *(f"  {rotulo}: de {antes} para {agora}"
              for rotulo, antes, agora in encolheram),
            "  Se foi engano, quase sempre é o alcance da ingestão:",
            f"  a ingestão rodou com --regiao {getattr(args, 'regiao', PADRAO_RECORTE)}?",
            "  E o banco tinha TUDO o que o retrato anterior tinha? Checkout",
            "  limpo começa com banco vazio, e o retrato sai do banco.",
            "  Se encolher é a intenção, repita com --permitir-encolher.",
        ]))

    # ── A trava do CARIMBO ─────────────────────────────────────────────────
    #
    # Escrita em 21/09/2026, depois de o cron commitar TRÊS vezes seguidas sem
    # um único valor mudar. O comentário no topo do workflow prometia o
    # contrário, com todas as letras: *"a maior parte das execuções não vai
    # produzir commit nenhum… commit vazio semanal seria atividade fabricada,
    # que é exatamente o que este projeto não faz."*
    #
    # Ele nunca cumpriu. O guardião lá é `git diff --quiet` sobre este arquivo,
    # e o arquivo **sempre** difere: `geradoEm` e os treze `coletadoEm` são
    # carimbos de hora, refeitos a cada execução. Medido em 21/09, o diff
    # inteiro eram os catorze carimbos — os 72.411 valores byte a byte iguais.
    #
    # O custo era **um deployment por semana**, num limite sem expiração que já
    # bateu 100%: ~1 GB toda segunda-feira para republicar o mesmo dado.
    #
    # A trava vive aqui, e não no workflow, pela mesma razão da do encolhimento:
    # **guarda de artefato mora onde o artefato é escrito**, não em quem chama.
    # Assim ela vale para o cron, para o `atualizar-painel.py` e para quem
    # digitar o comando à mão.
    def _sem_carimbos(d):
        """O retrato sem o que muda a cada execução — para comparar DADO com
        DADO, e não relógio com relógio."""
        x = dict(d)
        x.pop("geradoEm", None)
        x["indicadores"] = [{k: v for k, v in i.items() if k != "coletadoEm"}
                            for i in x.get("indicadores", [])]
        return x

    if velho is not None and _sem_carimbos(velho) == _sem_carimbos(dados):
        print(f"{destino} · NADA MUDOU no dado — arquivo intacto.")
        print("  Só os carimbos de coleta seriam diferentes, e reescrevê-los "
              "publica\n  um deploy que republica o mesmo dado. A coleta "
              "aconteceu e está no log.")
        return 0

    # `separators` sem espaço: o arquivo é baixado por quem visita o painel.
    texto = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    destino.write_text(texto, encoding="utf-8")

    tamanho = len(texto.encode("utf-8")) / 1024
    print(f"{destino} · {len(dados['municipios'])} municípios · "
          f"{len(dados['indicadores'])} indicadores · {br(tamanho, 1)} KB")
    for i in dados["indicadores"]:
        print(f"  {i['codigo']:<24} {i['periodo']}  {i['unidade']:<12} "
              f"total {br(i['totalRegiao'])}")
    return 0


def listar_municipios(args) -> int:
    with Armazem(args.banco) as db:
        linhas = db.municipios(args.uf_filtro)
    if not linhas:
        print("Nada gravado ainda — rodar `ingerir-municipios` primeiro.")
        return 0
    for l in linhas[: args.limite]:
        print(f"  {l['codigo']}  {l['uf_sigla']}  {l['nome']}")
    if len(linhas) > args.limite:
        print(f"  ... e mais {len(linhas) - args.limite}")
    return 0


def listar_coletas(args) -> int:
    with Armazem(args.banco) as db:
        linhas = db.coletas()
    if not linhas:
        print("Nenhuma coleta registrada.")
        return 0
    print(f"{'quando':<26}{'alvo':<16}{'lidos':>7}{'novos':>7}{'igual':>7}  erro")
    for l in linhas:
        print(f"{l['rodou_em']:<26}{l['alvo']:<16}{l['lidos']:>7}"
              f"{l['novos']:>7}{l['inalterados']:>7}  {l['erro'] or ''}")
    return 0


def construir_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="numeros_publicos",
        description="Dados abertos oficiais dos municípios brasileiros.")
    p.add_argument("--banco",
                   default=os.environ.get("OBS_BANCO", "observatorio.db"),
                   help="arquivo SQLite (padrão: observatorio.db)")
    sub = p.add_subparsers(dest="comando", required=True)

    i = sub.add_parser("ingerir-municipios",
                       help="busca os municípios no IBGE e grava")
    i.add_argument("--regiao", default=PADRAO_RECORTE, choices=sorted(RECORTES),
                   help="BR (padrão) ou NE; o recorte é bandeira, não código")
    i.add_argument("--uf", type=int, choices=sorted(UFS_BRASIL),
                   help="só esta UF (código IBGE); padrão é as nove")
    i.add_argument("--pausa", type=float,
                   default=float(os.environ.get("OBS_PAUSA", PAUSA_PADRAO)),
                   help=f"segundos entre requisições (padrão: {PAUSA_PADRAO})")
    i.set_defaults(func=ingerir_municipios)

    m = sub.add_parser("municipios", help="lista o que está gravado")
    m.add_argument("--uf", dest="uf_filtro", help="sigla, ex.: SE")
    m.add_argument("--limite", type=int, default=30)
    m.set_defaults(func=listar_municipios)

    ii = sub.add_parser("ingerir-indicador",
                        help="busca um indicador no IBGE e grava")
    # `todos` entra nas escolhas para que o processo automático possa pedir o
    # registro inteiro em vez de carregar uma cópia da lista. Ver a docstring
    # de `ingerir_indicador`.
    ii.add_argument("indicador", choices=[*sorted(INDICADORES), TODOS])
    ii.add_argument("--regiao", default=PADRAO_RECORTE, choices=sorted(RECORTES))
    ii.add_argument("--uf", type=int, choices=sorted(UFS_BRASIL))
    ii.add_argument("--pausa", type=float,
                    default=float(os.environ.get("OBS_PAUSA", PAUSA_PADRAO)))
    ii.set_defaults(func=ingerir_indicador)

    o = sub.add_parser("observacoes", help="mostra os valores gravados")
    o.add_argument("indicador", choices=sorted(INDICADORES))
    o.add_argument("--uf", dest="uf_filtro", help="sigla, ex.: RN")
    o.add_argument("--limite", type=int, default=20)
    o.set_defaults(func=listar_observacoes)

    cf = sub.add_parser(
        "conferir",
        help="soma dos municípios × total regional do IBGE (integridade)")
    cf.set_defaults(func=conferir)
    cf.add_argument("--regiao", default=PADRAO_RECORTE, choices=sorted(RECORTES),
                    help="define o nível do total oficial: N2 da região ou N1 do Brasil")

    e = sub.add_parser("exportar", help="gera o JSON que o painel consome")
    e.add_argument("--permitir-encolher", action="store_true",
                   help="deixa o snapshot cobrir MENOS municípios que o anterior; "
                        "sem isto, encolher é recusado")
    e.add_argument("--saida", default="painel/dados/snapshot.json")
    e.set_defaults(func=exportar)

    c = sub.add_parser("coletas", help="histórico de execuções")
    c.set_defaults(func=listar_coletas)

    # ── INSS: banco próprio, nenhum efeito no snapshot nem no site ─────────
    ig = sub.add_parser(
        "inss-ingerir",
        help="grava a fila (pendentes) e os negados do INSS de um mês")
    ig.add_argument("--mes", required=True, help="AAAA-MM, ex.: 2026-07")
    ig.add_argument("--conjunto", default="todos",
                    choices=["pendentes", "indeferidos", "todos"])
    ig.add_argument("--arquivo",
                    help="arquivo local em vez do portal (só com um conjunto)")
    ig.add_argument("--banco-inss",
                    default=os.environ.get("INSS_BANCO", "inss.db"))
    ig.add_argument("--permitir-encolher", action="store_true",
                    help="aceita cobertura menor que 80%% do mês anterior")
    ig.set_defaults(func=inss_ingerir)

    ir = sub.add_parser("inss-resumo",
                        help="idade da fila por serviço e dias até o 'não'")
    ir.add_argument("--mes", required=True, help="AAAA-MM")
    ir.add_argument("--banco-inss",
                    default=os.environ.get("INSS_BANCO", "inss.db"))
    ir.set_defaults(func=inss_resumo)

    ie = sub.add_parser("inss-exportar",
                        help="gera o JSON do INSS que o painel lê, por grupo")
    ie.add_argument("--saida", default="painel/dados/inss.json")
    ie.add_argument("--banco-inss",
                    default=os.environ.get("INSS_BANCO", "inss.db"))
    ie.add_argument("--permitir-encolher", action="store_true",
                    help="aceita menos grupos, ou mês mais velho, que o publicado")
    ie.set_defaults(func=inss_exportar)
    # --- Novo Caged (29/09/2026). Banco próprio, como o INSS: outra fonte,
    # outro ritmo (mensal), e nada nele se soma ao do IBGE.
    banco_caged = os.environ.get("CAGED_BANCO", "caged.db")
    cg = sub.add_parser("caged-ingerir",
                        help="baixa e agrega os 12 meses do Novo Caged até o "
                             "mais recente publicado (ou --ate)")
    cg.add_argument("--ate", help="último mês da janela, AAAAMM")
    cg.add_argument("--refazer", action="store_true",
                    help="relê arquivos já gravados (o MTE republica meses)")
    cg.add_argument("--banco-caged", default=banco_caged)
    cg.set_defaults(func=caged_ingerir)

    ce = sub.add_parser("caged-exportar",
                        help="confere contra o sumário do MTE e gera o "
                             "caged.json que o painel lê")
    ce.add_argument("--saida", default="painel/dados/caged.json")
    ce.add_argument("--snapshot", default="painel/dados/snapshot.json",
                    help="de onde vêm os 5.571 códigos do IBGE")
    ce.add_argument("--sumario",
                    help="texto do sumário já extraído (sem rede); o padrão é "
                         "buscá-lo na pasta do mês no gov.br")
    ce.add_argument("--banco-caged", default=banco_caged)
    ce.add_argument("--permitir-encolher", action="store_true")
    ce.set_defaults(func=caged_exportar)

    cn = sub.add_parser("caged-novo",
                        help="diz se há mês novo publicado (arquivos E sumário)")
    cn.add_argument("--publicado", default="painel/dados/caged.json")
    cn.set_defaults(func=caged_novo)
    # --- Emendas parlamentares pagas a prefeituras (02/10/2026). Banco
    # próprio: outra fonte (CGU), e o arquivo inteiro é refeito a cada extração.
    em = sub.add_parser("emendas-ingerir",
                        help="grava os pagamentos de emendas a prefeituras e "
                             "fundos municipais, conferindo o total ao centavo")
    em.add_argument("--arquivo",
                    help="zip já baixado do Portal da Transparência "
                         "(sem ele, baixa de --url)")
    em.add_argument("--url", default=None, help="origem do zip")
    em.add_argument("--snapshot", default="painel/dados/snapshot.json",
                    help="os municípios do site, para casar o nome com o IBGE")
    em.add_argument("--banco-emendas",
                    default=os.environ.get("EMENDAS_BANCO", "emendas.db"))
    em.set_defaults(func=emendas_ingerir)

    ee = sub.add_parser("emendas-exportar",
                        help="gera o emendas.json que o painel lê, com a soma "
                             "fechada contra o banco")
    ee.add_argument("--saida", default="painel/dados/emendas.json")
    ee.add_argument("--snapshot", default="painel/dados/snapshot.json",
                    help="de onde vêm os 5.571 códigos do IBGE")
    ee.add_argument("--banco-emendas",
                    default=os.environ.get("EMENDAS_BANCO", "emendas.db"))
    ee.add_argument("--permitir-encolher", action="store_true")
    ee.set_defaults(func=emendas_exportar)
    # --- O Brasil ao longo do tempo (05/10/2026). Banco próprio: séries do
    # país, do IBGE e do Banco Central, cada uma lida por dois caminhos.
    bi = sub.add_parser("brasil-ingerir",
                        help="grava as séries do país, cada uma conferida "
                             "por uma segunda leitura da fonte")
    bi.add_argument("--banco-brasil",
                    default=os.environ.get("BRASIL_BANCO", "brasil.db"))
    bi.add_argument("--permitir-encolher", action="store_true",
                    help="aceita série com menos pontos ou período mais curto "
                         "que o já gravado")
    bi.add_argument("--semanal", action="store_true",
                    help="só as séries da atualização semanal: as anuais "
                         "coletadas à mão (SIM e PRODES) ficam com o dado "
                         "anterior")
    bi.set_defaults(func=brasil_ingerir)
    be = sub.add_parser("brasil-exportar",
                        help="gera o brasil.json que a página /brasil/ lê")
    be.add_argument("--saida", default="painel/dados/brasil.json")
    be.add_argument("--banco-brasil",
                    default=os.environ.get("BRASIL_BANCO", "brasil.db"))
    be.add_argument("--permitir-encolher", action="store_true")
    be.add_argument("--manter-ausentes", action="store_true",
                    help="a série ou a meta que faltar no banco sai do "
                         "brasil.json atual, como está (o banco do runner "
                         "começa vazio)")
    be.set_defaults(func=brasil_exportar)
    return p


def _listar_ftp(url: str) -> str:
    import urllib.request
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read().decode("latin-1")


def _pagina(url: str) -> str:
    import urllib.request
    pedido = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (numeros-publicos)"})
    with urllib.request.urlopen(pedido, timeout=120) as r:
        return r.read().decode("utf-8", "replace")


def _texto_do_pdf(caminho: str) -> str:
    """`pdftotext` (poppler). O runner o instala; o Git for Windows o traz."""
    import shutil
    import subprocess
    from . import caged
    binario = shutil.which("pdftotext")
    if not binario:
        raise caged.ErroCaged("sem `pdftotext` no PATH para ler o sumário do MTE "
                              "(apt-get install poppler-utils)")
    r = subprocess.run([binario, "-enc", "UTF-8", "-layout", caminho, "-"],
                       capture_output=True,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if r.returncode != 0:
        raise caged.ErroCaged(f"pdftotext falhou: {r.stderr[:300]!r}")
    return r.stdout.decode("utf-8", "replace")


def _sumario_oficial(mes: str, pagina=_pagina, baixar=None,
                     texto_do_pdf=_texto_do_pdf) -> tuple[str, str]:
    """`(link, texto)` do sumário executivo do mês, lido da pasta no gov.br."""
    baixar = baixar or _baixar
    import tempfile
    from . import caged
    link = caged.link_do_sumario(pagina(caged.pasta_do_mes(mes)), mes)
    with tempfile.TemporaryDirectory() as tmp:
        destino = os.path.join(tmp, "sumario.pdf")
        baixar(link, destino)
        return link, texto_do_pdf(destino)


def caged_ingerir(args, listar=_listar_ftp, baixar=None) -> int:
    """Os três arquivos de cada mês da janela, um de cada vez: baixa, agrega
    em fluxo, grava a fatia e apaga o `.7z`. Um mês tem ~57 MB comprimido e
    466 MB aberto, e nada disso fica no disco."""
    import tempfile
    import time
    from . import caged
    # `_baixar` é definido mais abaixo neste arquivo: resolvido na chamada.
    baixar = baixar or _baixar
    try:
        ultima = args.ate or caged.ultima_no_ftp(listar)
        print(f"janela: {caged.janela_ate(ultima)[0]} a {ultima}")
        with caged.ArmazemCaged(args.banco_caged) as db:
            for mes in caged.janela_ate(ultima):
                for tipo in caged.TIPOS:
                    nome = caged.nome_arquivo(tipo, mes)
                    if not args.refazer and db.gravado(tipo, mes) is not None:
                        print(f"  {nome}: já gravado")
                        continue
                    t = time.time()
                    with tempfile.TemporaryDirectory() as tmp:
                        destino = os.path.join(tmp, nome + ".7z")
                        url = caged.url_arquivo(tipo, mes)
                        baixar(url, destino)
                        tamanho = os.path.getsize(destino)
                        agregado, n = caged.agregar(caged.linhas_do_7z(destino), nome)
                    db.gravar(tipo, mes, agregado, n, tamanho,
                              url.replace("%20", " "))
                    a = sum(x[0] for x in agregado.values())
                    d = sum(x[1] for x in agregado.values())
                    print(f"  {nome}: {n} linhas, {a - d:+d} "
                          f"({tamanho // 1_000_000} MB, {time.time() - t:.0f} s)")
    except caged.ErroCaged as e:
        print(f"[!] {e}", file=sys.stderr)
        return 1
    return 0


def emendas_ingerir(args, baixar=None) -> int:
    """Baixa (ou lê) o zip da CGU, casa os favorecidos municipais com o IBGE,
    confere o total contra o CSV ao centavo e só então grava."""
    import json as _json
    import tempfile
    from . import emendas
    baixar = baixar or _baixar
    try:
        snapshot = _json.loads(Path_(args.snapshot).read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            origem = args.url or emendas.URL
            if args.arquivo:
                zip_ = args.arquivo
                origem = args.url or f"{emendas.URL} (arquivo local)"
            else:
                zip_ = os.path.join(tmp, "emendas.zip")
                baixar(origem, zip_)
            r = emendas.ingerir(zip_, snapshot, args.banco_emendas, origem=origem)
    except emendas.ErroEmendas as e:
        print(f"[!] {e}", file=sys.stderr)
        return 1
    print(f"arquivo da CGU de {r['data_arquivo']}, último mês {r['ultimo_mes']}")
    print(f"{r['lidas']} linhas lidas, {r['gravadas']} pagamentos municipais "
          f"gravados, {r['municipios']} municípios, "
          f"R$ {r['centavos'] / 100:_.2f}".replace(".", ",").replace("_", ".")
          + " (confere com o CSV ao centavo)")
    print(f"tabela de apelidos: {r['apelidos']} nomes antigos, todos conferidos "
          "contra o snapshot")
    return 0


def emendas_exportar(args) -> int:
    """Escreve o `emendas.json` a partir do banco. A conferência contra a
    fonte é a da ingestão (o total ao centavo); aqui, a soma exportada fecha
    com o banco antes de gravar."""
    import json as _json
    from . import emendas
    try:
        snap = _json.loads(Path_(args.snapshot).read_text(encoding="utf-8"))
        with emendas.ArmazemEmendas(args.banco_emendas) as db:
            r = emendas.retrato(db, (l[0] for l in snap["municipios"]))
        estado = emendas.gravar_retrato(r, args.saida, args.permitir_encolher)
    except emendas.ErroEmendas as e:
        print(f"[!] {e}", file=sys.stderr)
        return 1
    com = sum(1 for _, p, _t in r["municipios"] if any(v is not None for v in p))
    print(f"{args.saida}: {estado} · arquivo da CGU de {r['dataArquivo']} · "
          f"{r['anos'][0]} a {r['anos'][-1]} (último mês {r['ultimoMes']}) · "
          f"{len(r['municipios'])} municípios, {com} com pagamento · "
          "soma fechada com o banco")
    return 0


#: O que `brasil-ingerir` diz da segunda leitura, quando ela não dá os
#: mesmos valores e sim outra coisa que tem de bater.
CONFERIDA = {
    "ptax": "iguais à média da PTAX diária, até meia unidade da 4ª casa",
    "inpc": ("cada variação mensal igual à do nominal e do INPC do SGS, até o "
             "arredondamento do INPC, e o último mês igual ao nominal"),
    "ultimo-dia": ("iguais em duas janelas e, onde há série diária, ao último "
                   "dia útil de cada mês, até 0,05%"),
    "razao-pib": ("iguais em duas janelas e à conta do saldo em reais pelo "
                  "PIB de 12 meses, com duas casas"),
    "diferenca": ("iguais em duas janelas e às exportações menos as "
                  "importações, até 0,1 milhão de dólares"),
    "tabnet": ("iguais nas tabelas das causas externas e dos óbitos gerais "
               "do TabNet, só nos anos finais"),
}

#: A saída de `brasil-ingerir` quando alguma série (ou a meta) ficou de fora:
#: o resto foi gravado, e a atualização semanal publica e termina vermelha.
SAIDA_PARCIAL = 3


def brasil_ingerir(args, transporte=None, dormir=None) -> int:
    """Valida a tabela de mandatos, lê cada série pelos dois caminhos, confere
    a meta de inflação contra o SGS e a página do Banco Central, e grava o que
    bateu. Cada série entra por si: a que falhar duas vezes fica com o dado
    anterior, e o comando sai com `SAIDA_PARCIAL`, para a atualização semanal
    seguir e avisar. Mandatos com defeito, nada lido ou série que encolheria:
    sai com 1, e nada é gravado. Com `--semanal`, as séries anuais coletadas
    à mão ficam de fora, sem contar como falha. Cada coleta imprime o tempo
    assim que termina: o log mostra onde a coleta parou."""
    import time
    from . import brasil

    def andamento(codigo: str, segundos: float, motivo: str | None) -> None:
        print(f"· {codigo}: {'falhou' if motivo else 'lida'} em "
              f"{segundos:.0f} s", flush=True)

    series = tuple(s for s in brasil.SERIES if s.semanal or not args.semanal)
    try:
        mandatos = brasil.carregar_mandatos()
        r = brasil.ingerir(
            args.banco_brasil,
            transporte or transporte_http(prazo=brasil.PRAZO_PEDIDO),
            dormir or time.sleep, series=series,
            permitir_encolher=args.permitir_encolher,
            prazo=brasil.PRAZO_COLETA, ao_ler=andamento)
    except brasil.ErroBrasil as e:
        print(f"[!] {e}", file=sys.stderr)
        return 1
    for leitura in r.leituras:
        ps = sorted(leitura.pontos)
        vao = brasil.buracos(leitura.serie.periodicidade, leitura.pontos)
        print(f"{leitura.serie.codigo}: {len(ps)} pontos, {ps[0]} a {ps[-1]}, "
              + CONFERIDA.get(leitura.serie.conferencia,
                              "iguais na segunda leitura")
              + (f"; sem dado na fonte: {', '.join(vao)}" if vao else ""))
    if r.metas is not None:
        anos = [m.ano for m in r.metas.metas]
        print(f"meta de inflação: {len(anos)} anos, {anos[0]} a {anos[-1]}, "
              f"o centro igual ao SGS {brasil.SGS_METAS} e meta e intervalo "
              "iguais à página do Banco Central")
    atual = mandatos[-1]
    print(f"mandatos: {len(mandatos)} períodos, de {mandatos[0].inicio} até "
          f"hoje ({atual.nome}, desde {atual.inicio}), com fonte oficial em "
          "todos, sem sobreposição nem buraco")
    fora = [s.codigo for s in brasil.SERIES if s not in series]
    if fora:
        print("fora da semanal (anuais, coletadas à mão): "
              + ", ".join(fora) + "; fica o dado anterior")
    for falha in r.falhas:
        print(f"[falha] {falha}; fica o dado anterior", file=sys.stderr)
    return SAIDA_PARCIAL if r.falhas else 0


def brasil_exportar(args) -> int:
    """Escreve o `brasil.json` a partir do banco e da tabela de mandatos.
    Não confere com a fonte: a conferência é a segunda leitura, feita na
    ingestão, e nada entra no banco sem ela.

    Com `--manter-ausentes`, a série ou a meta que faltar no banco sai do
    `brasil.json` atual, como está: é o que a atualização semanal faz depois
    de uma fonte falhar."""
    import json as _json
    from . import brasil
    try:
        mandatos = brasil.carregar_mandatos()
        anterior = None
        if args.manter_ausentes and Path_(args.saida).exists():
            anterior = _json.loads(
                Path_(args.saida).read_text(encoding="utf-8"))
        with brasil.ArmazemBrasil(args.banco_brasil) as db:
            r = brasil.retrato(db, mandatos, anterior=anterior)
            mantidas = [s.codigo for s in brasil.SERIES
                        if not db.pontos(s.codigo)]
            if db.metas() is None:
                mantidas.append(brasil.META)
        estado = brasil.gravar_retrato(r, args.saida, args.permitir_encolher)
    except brasil.ErroBrasil as e:
        print(f"[!] {e}", file=sys.stderr)
        return 1
    print(f"{args.saida}: {estado} · " + " · ".join(
        f"{s['codigo']} {len(s['pontos'])} ({s['pontos'][0][0]} a "
        f"{s['pontos'][-1][0]})" for s in r["series"])
        + f" · {len(r['mandatos'])} períodos na Presidência"
        + f" · meta de inflação de {len(r['metaInflacao']['anos'])} anos")
    if mantidas:
        print("sem coleta nova, mantidas do brasil.json anterior: "
              + ", ".join(mantidas))
    return 0


def caged_exportar(args, sumario_oficial=_sumario_oficial) -> int:
    """Confere contra o sumário executivo do MTE e SÓ ENTÃO escreve o
    `caged.json`. Não há bandeira para pular a conferência: sem ela, o número
    do site não tem contra o que ser verdadeiro."""
    import json as _json
    from . import caged
    try:
        with caged.ArmazemCaged(args.banco_caged) as db:
            ultima = db.ultima()
            if ultima is None:
                raise caged.ErroCaged("banco do Caged vazio: rode caged-ingerir")
            if args.sumario:
                link = args.sumario
                texto = Path_(args.sumario).read_text(encoding="utf-8")
            else:
                link, texto = sumario_oficial(ultima)
            oficiais = caged.numeros_do_sumario(texto, ultima)
            nossos = caged.nossos_numeros(db, ultima)
            for bloco in ("mes", "ano", "doze"):
                n, o = nossos[bloco], oficiais[bloco]
                if o is None:
                    print(f"  {bloco:<5} o sumário não traz (em janeiro, o ano é o mês)")
                    continue
                print(f"  {bloco:<5} nosso {n['saldo']:+,} ({n['admissoes']:,} − "
                      f"{n['desligamentos']:,}) · oficial {o['saldo']:+,}"
                      .replace(",", "."))
            erros = caged.conferir(nossos, oficiais)
            if erros:
                raise caged.ErroCaged("DIVERGE do sumário do MTE: " + "; ".join(erros))
            snap = _json.loads(Path_(args.snapshot).read_text(encoding="utf-8"))
            r = caged.retrato(db, ultima, (l[0] for l in snap["municipios"]), {
                "sumario": link,
                "mes": oficiais["mes"], "ano": oficiais["ano"],
                "anoPeriodo": oficiais["ano_periodo"],
                "doze": oficiais["doze"], "dozePeriodo": oficiais["doze_periodo"],
            })
        estado = caged.gravar_retrato(r, args.saida, args.permitir_encolher)
    except caged.ErroCaged as e:
        print(f"[!] {e}", file=sys.stderr)
        return 1
    print(f"{args.saida}: {estado} · competência {r['competencia']} · "
          f"{len(r['municipios'])} municípios · confere com o sumário do MTE")
    return 0


def caged_novo(args, listar=_listar_ftp, pagina=_pagina) -> int:
    """`novo` quando o FTP tem mês mais recente que o publicado E o sumário
    daquele mês já está no gov.br; senão `nada`. Os dois saem no mesmo dia,
    mas não na mesma hora, e sem o sumário a exportação não confere nada.
    Escreve `novo=true|false` em `$GITHUB_OUTPUT` quando existir."""
    import json as _json
    from . import caged
    publicado = None
    if Path_(args.publicado).exists():
        publicado = _json.loads(
            Path_(args.publicado).read_text(encoding="utf-8")).get("competencia")
    novo = False
    try:
        ultima = caged.ultima_no_ftp(listar)
        if publicado is None or ultima > publicado:
            try:
                caged.link_do_sumario(pagina(caged.pasta_do_mes(ultima)), ultima)
                novo = True
                print(f"novo: {ultima} no FTP e no gov.br (publicado: {publicado})")
            except (caged.ErroCaged, OSError) as e:
                print(f"nada: {ultima} está no FTP, e o sumário ainda não ({e})")
        else:
            print(f"nada: o FTP vai até {ultima}, e é o publicado")
    except (caged.ErroCaged, OSError) as e:
        print(f"[!] {e}", file=sys.stderr)
        return 1
    saida = os.environ.get("GITHUB_OUTPUT")
    if saida:
        with open(saida, "a", encoding="utf-8") as fh:
            fh.write(f"novo={'true' if novo else 'false'}\n")
    return 0


def inss_exportar(args) -> int:
    from . import inss
    try:
        with inss.ArmazemINSS(args.banco_inss) as db:
            r = inss.retrato(db)
        cob = inss.gravar_retrato(r, args.saida, args.permitir_encolher)
    except inss.ErroINSS as e:
        print(e, file=sys.stderr)
        return 1
    fila, neg = r["fila"] or {}, r["negados"] or {}
    print(f"{args.saida}: fila de {fila.get('mes', '—')}, negados de "
          f"{neg.get('mes', '—')} · " + " · ".join(f"{k} {v}" for k, v in cob.items()))
    return 0


def _baixar(url: str, destino: str) -> None:
    """Baixa em blocos: os arquivos do INSS têm de 60 a 125 MB."""
    import shutil
    import urllib.request
    pedido = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (numeros-publicos)"})
    with urllib.request.urlopen(pedido, timeout=120) as r, open(destino, "wb") as fh:
        shutil.copyfileobj(r, fh, length=1 << 20)


def inss_ingerir(args, transporte=None, baixar=_baixar) -> int:
    """Grava um mês do INSS. O mês do rótulo é só o candidato: quem decide é
    o que está dentro do arquivo (ver `numeros_publicos/inss.py`)."""
    import json as _json
    import tempfile
    import urllib.parse
    from . import inss

    conjuntos = (["pendentes", "indeferidos"] if args.conjunto == "todos"
                 else [args.conjunto])
    if args.arquivo and len(conjuntos) != 1:
        print("--arquivo exige --conjunto pendentes ou indeferidos",
              file=sys.stderr)
        return 2
    falhou = False
    try:
        # Só quem vai reler os negados pode migrar o banco anterior à
        # clientela, que apaga os negados antigos (ver `ArmazemINSS`).
        db = inss.ArmazemINSS(args.banco_inss, migrar="indeferidos" in conjuntos)
    except inss.ErroINSS as e:
        print(e, file=sys.stderr)
        return 1
    if db.migrado:
        print("banco anterior à clientela: os negados antigos foram apagados; "
              "reingira cada mês de indeferidos")
    with db:
        for conjunto in conjuntos:
            temporario = None
            try:
                if args.arquivo:
                    caminho, nome = args.arquivo, os.path.basename(args.arquivo)
                else:
                    pacote = (inss.PACOTE_PENDENTES if conjunto == "pendentes"
                              else inss.PACOTE_INDEFERIDOS)
                    t = transporte or transporte_http(timeout=60)
                    resposta = t(inss.PORTAL + pacote)
                    if resposta.status != 200:
                        raise inss.ErroINSS(
                            f"portal do INSS respondeu {resposta.status} para "
                            f"o pacote {pacote}")
                    dados = _json.loads(resposta.corpo)
                    recurso = inss.recurso_do_mes(dados["result"]["resources"],
                                                  conjunto, args.mes)
                    url = recurso["url"]
                    nome = urllib.parse.unquote(url.rsplit("/", 1)[-1])
                    fd, temporario = tempfile.mkstemp(suffix="-" + nome)
                    os.close(fd)
                    print(f"{conjunto} {args.mes}: baixando {nome}")
                    baixar(url, temporario)
                    caminho = temporario
                if conjunto == "pendentes":
                    with inss.abrir_pendentes(caminho) as fh:
                        r = inss.gravar_pendentes(db, args.mes, nome,
                                                  inss.ler_pendentes(fh),
                                                  args.permitir_encolher)
                else:
                    r = inss.gravar_indeferidos(
                        db, args.mes, nome,
                        inss.ler_indeferidos(inss.linhas_xlsx(caminho)),
                        args.permitir_encolher)
                print(f"{conjunto} {args.mes}: gravado · " + " · ".join(
                    f"{k} {br(v) if isinstance(v, (int, float)) else v}"
                    for k, v in r.items()))
            except inss.ErroINSS as e:
                falhou = True
                print(f"{conjunto} {args.mes}: {e}", file=sys.stderr)
            finally:
                if temporario and os.path.exists(temporario):
                    os.remove(temporario)
    return 1 if falhou else 0


def inss_resumo(args) -> int:
    from . import inss, inss_grupos

    def linha(nome, r):
        return (f"  {nome[:52]:<52} {br(r['n']):>9} {r['mediana']:>5} "
                f"{r['p75']:>5} {100 * r['acima_45']:>6.1f}% {100 * r['acima_90']:>6.1f}%")

    try:
        db = inss.ArmazemINSS(args.banco_inss)
    except inss.ErroINSS as e:
        print(e, file=sys.stderr)
        return 1
    def linha_grupo(g, r, pub):
        prazo = (f"{g.prazo_acordo}d" + ("" if g.prazo_conta_do_pedido else "*")
                 if g.prazo_acordo else "—")
        return (linha(g.nome, r) + f" {prazo:>5}"
                + ("" if pub else f"  abaixo de {br(inss_grupos.MINIMO_PEDIDOS)}"))

    with db:
        for titulo, conjunto, por in (
                ("POR GRUPO — idade da fila", "pendentes", inss.fila_por_grupo),
                ("POR GRUPO — dias do pedido ao 'não'", "indeferidos",
                 inss.negados_por_grupo)):
            if not inss.total_distribuicao(db, conjunto, args.mes):
                continue
            print(f"\n{titulo} — {args.mes}")
            print(f"  {'':<52} {'n':>9} {'med.':>5} {'p75':>5} {'>45d':>7} "
                  f"{'>90d':>7} {'prazo':>5}")
            for g, r, pub in por(db, args.mes):
                print(linha_grupo(g, r, pub))
        print("\n  prazo: o do acordo no STF (Tema 1066, 2021, vigência de 24 meses);"
              "\n  * = conta só depois da perícia/avaliação social, não do pedido")
        for titulo, conjunto, por in (
                ("IDADE DA FILA (pedidos ainda sem decisão, na data de referência)",
                 "pendentes", inss.fila_por_servico),
                ("DIAS DO PEDIDO AO 'NÃO' (negados no mês)",
                 "indeferidos", inss.negados_por_especie)):
            total = inss.total_distribuicao(db, conjunto, args.mes)
            print(f"\n{titulo} — {args.mes}")
            if not total:
                print("  nada gravado para este mês")
                continue
            print(f"  {'':<52} {'n':>9} {'med.':>5} {'p75':>5} {'>45d':>7} {'>90d':>7}")
            print(linha("TOTAL", total))
            for _, nome, r in por(db, args.mes)[:15]:
                print(linha(nome, r))
    return 0


def main(argv: list[str] | None = None) -> int:
    args = construir_parser().parse_args(argv)
    return args.func(args)
