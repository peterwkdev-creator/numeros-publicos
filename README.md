# Números Públicos

**No ar em [www.numerospublicos.com.br](https://www.numerospublicos.com.br).**

Dados abertos de **todos os 5.571 municípios brasileiros**: coletados das APIs
públicas oficiais do IBGE, guardados com a procedência completa, cruzados com
as declarações fiscais dos municípios ao Tesouro Nacional e com os resultados
escolares do INEP, e publicados como **uma página estática por município**.

Começou como um observatório regional do Nordeste (1.794 municípios); o
recorte nacional sempre foi um parâmetro, então a expansão foi um comando só,
e os cinco defeitos latentes que ela revelou estão descritos nas notas de
projeto abaixo.

> **Situação: publicado e agendado.** Todo número é coletado de uma API ao
> vivo, de forma idempotente, conferido contra o agregado regional que o
> próprio IBGE publica e refeito toda semana por um job do GitHub Actions que
> só faz commit quando o dado de fato mudou.

**5.571 páginas indexáveis, não uma.** O site inteiro era uma única URL com
todos os municípios atrás de um filtro, e por isso ninguém que buscasse uma
cidade específica conseguia chegar a ela. Cada município agora tem endereço,
título, descrição e canonical próprios, com população, PIB, gasto com pessoal
contra o limite legal, o índice escolar e trabalho e renda (desocupação,
cobertura previdenciária e rendimento do Censo 2022; empresas, pessoal ocupado
e salário médio do Cadastro Central de Empresas), unidos pelo código do IBGE.

A metade fiscal vem do [painel-fiscal-ne](https://github.com/peterwkdev-creator/painel-fiscal-ne),
entregue como um retrato versionado em vez de buscada na hora do build: um
build que entrasse em outro repositório falharia em silêncio no dia em que
esse repositório mudasse.

## Trabalho independente, sem vínculo

Feito a partir de um termo de referência **público** (TR 21/2026, projeto
BRA/23/006, publicado pelo PNUD Brasil para o Consórcio Nordeste) que descreve
um observatório regional que ainda não existe. Este é um **trabalho
independente, sem vínculo com o Consórcio Nordeste nem com o PNUD, e sem
endosso deles**, e não é proposta, lance nem entrega daquele contrato.

## Como rodar

Python 3.10+ e nada mais: só a biblioteca padrão, sem passo de instalação.

```bash
python -m numeros_publicos ingerir-municipios
```

Depois:

```bash
python -m numeros_publicos ingerir-indicador populacao-censo-2022
python -m numeros_publicos observacoes pib-municipal --uf SE
python -m numeros_publicos conferir             # integridade, contra a fonte
python -m numeros_publicos coletas              # histórico das coletas
```

## Integridade: conferida contra a fonte, não contra si mesma

`conferir` compara a **soma de todos os municípios** com o **total regional
que o próprio IBGE publica**. Conferir uma cidade prova que o parser está
certo; só a soma prova que a coleta está *completa*: ela pega um município
faltando, duplicado ou somado errado numa comparação só.

Rodado contra a API ao vivo em 24/09/2026, recorte nacional (`--regiao BR`, o
agregado N1 do próprio IBGE):

| Indicador | Soma dos municípios | Contra o total nacional do IBGE |
|---|---|---|
| População (Censo 2022) | 203.080.756 | **exata** |
| População estimada (2026) | 214.211.951 | **exata** |
| PIB municipal (2023) | 10.943.345.420 (R$ mil) | arredondamento, 19 (1,7e-09) |

**Médias e estimativas por amostra se conferem de outro jeito, e dizem isso.**
O salário médio e o rendimento médio são as médias publicadas pelo IBGE, não
as nossas: dividir o total publicado pela contagem publicada erra por até
R$ 2,92, porque a contagem foi arredondada depois que o IBGE calculou a
média. Somar médias não tem sentido, então `conferir` confere a média de cada
município contra `total ÷ contagem`, dentro do erro que o próprio
arredondamento do IBGE permite. E as tabelas de trabalho do Censo são
expandidas de uma amostra, arredondadas por município: os desocupados somam 44
a menos que o total nacional, o que só passa nas séries que declaram
`amostra=True` (no máximo meia pessoa por município).

**O `-` do IBGE quer dizer zero, não ausente.** Até 29/09/2026 ele era lido
como ausente, e 33 páginas diziam "sem dado" em água ou esgoto onde o IBGE
publica zero.

**A estimativa e o PIB seguem o ano mais recente que o IBGE publica.** O
período deles não está escrito no código: a coleta pergunta à API o período
mais novo do agregado (`MAIS_RECENTE`), então o job semanal pega um ano novo
sozinho. Até 24/09/2026 os anos estavam fixos no código, e o site seguia
mostrando a estimativa de 2024 e o PIB de 2021 quando 2026 e 2023 já tinham
saído.

**Igualdade exata é o teste errado para um agregado arredondado**, e a
primeira rodada real mostrou por quê: o PIB saiu com 5 de diferença em
1.243.103.280 quando o recorte era regional, e 31 em 9.012.142.000 no
nacional (2021); a diferença absoluta cresce com a soma, a relativa não. O
IBGE publica o PIB municipal já arredondado em milhares e calcula o total
regional antes de arredondar. Alargar a tolerância para esconder isso seria
desonesto; a conferência **classifica**: abaixo de 1e-6 relativo é
arredondamento, e ela diz isso com o número; acima disso, o comando falha. A
distância entre os dois casos é de centenas de vezes.

## Como testar

```bash
python -m unittest discover -s tests -t .
```

100 testes, **sem rede e sem espera de verdade**: o transporte HTTP e o
relógio são injetados. As fixtures em `tests/fixtures/` são respostas reais
capturadas da API do IBGE: os 75 municípios de Sergipe, a população do Censo
2022 do Rio Grande do Norte e o PIB de 2021 de Sergipe.

## Novo Caged: emprego formal, mês a mês

```bash
python -m numeros_publicos caged-novo       # há mês novo (arquivos E resumo oficial)?
python -m numeros_publicos caged-ingerir    # 12 meses x 3 arquivos do FTP do Ministério do Trabalho
python -m numeros_publicos caged-exportar   # confere contra o resumo oficial, depois grava painel/dados/caged.json
```

Admissões e desligamentos de empregos formais (CLT), por município, nos
últimos 12 meses, dos microdados públicos do Ministério do Trabalho
(`ftp.mtps.gov.br/pdet/microdados/NOVO CAGED/`). Cada mês tem três arquivos:
as movimentações do mês, as declarações fora do prazo de meses anteriores e as
exclusões, que desfazem uma linha já declarada. O número "com ajustes" que o
Ministério publica é reproduzível: para cada mês, o arquivo do próprio mês
mais toda declaração fora do prazo daquele mês, menos toda exclusão. Em
29/09/2026 o mês (+58.568), o acumulado do ano (+972.203) e os 12 meses
(+880.717) bateram exatamente com o sumário executivo do Ministério.

`caged-exportar` **não tem opção para pular essa conferência**: lê o PDF do
sumário na pasta do mês no gov.br e se recusa a gravar se qualquer um dos três
blocos divergir. O sumário de dezembro é uma edição anual cujos próprios
números não fecham, então esse mês é recusado e conferido à mão. Município sem
linha num mês tem **zero** movimentações, não dado ausente. Os arquivos
precisam do `7z` (ou do pacote `py7zr`) e o sumário precisa do `pdftotext`; o
workflow agendado instala os dois.

## INSS: a fila da previdência

```bash
python -m numeros_publicos inss-exportar   # grava painel/dados/inss.json, uma entrada por grupo
```

Cada grupo com fila publicável ganha uma página em `/inss/<grupo>/`: há
quanto tempo os requerimentos pendentes esperam, quanto tempo os indeferidos
levaram para receber o "não" e o prazo do acordo de 2021 no Supremo como
*referência datada*, com a ressalva, onde ela se aplica, de que o prazo só
começa depois da perícia médica, que o dado aberto não data. Como o retrato,
a exportação se recusa a encolher (menos grupos, ou um mês mais antigo) sem
`--permitir-encolher`.

### Coleta

`numeros_publicos/inss.py` lê dois conjuntos mensais do portal de dados
abertos do INSS para um banco separado (`inss.db`; só o `inss-exportar`,
acima, alimenta o site):

```bash
python -m numeros_publicos inss-ingerir --mes 2026-07
python -m numeros_publicos inss-resumo --mes 2026-07
```

- **Requerimentos pendentes** medem a *idade da fila*: há quanto tempo
  esperam os requerimentos ainda sem decisão na data de referência. Não o
  tempo até a decisão: quem foi atendido rápido já saiu do arquivo.
- **Requerimentos indeferidos** trazem a data do requerimento e a do
  indeferimento, então dão o tempo até o "não". Os concedidos não trazem a
  data do requerimento; **o tempo até o "sim" não está no dado aberto.** Eles
  são guardados com a *clientela* (urbana ou rural): é a única coluna que
  separa, entre os indeferimentos, a aposentadoria por idade urbana da rural,
  que têm o mesmo código de benefício. Um banco gravado antes de essa coluna
  existir se recusa a abrir; `inss-ingerir --conjunto indeferidos` o migra,
  relendo cada mês.

Os dois arquivos não compartilham código: a fila usa códigos de *serviço*, os
indeferimentos usam códigos de *benefício*. `numeros_publicos/inss_grupos.py`
liga os dois em dez grupos (a unidade de uma página), cada um conferido
contra os arquivos de 2026, e todo código tem de cair em exatamente um grupo
ou numa lista explícita de "sem página": **um código novo faz a coleta se
recusar**, em vez de sumir de todas as páginas. Uma mediana só é publicável
com pelo menos 1.000 requerimentos: abaixo de ~500, ela oscilava de 25% a
100% de um mês para o outro, nos dois sentidos.

Os rótulos do portal não são confiáveis: em setembro de 2026, o recurso
rotulado "agosto de 2026" era o arquivo de julho de 2025. O mês é conferido
**dentro** de cada arquivo, e a divergência é recusada. As planilhas (60 a
70 MB) são lidas por um leitor de XLSX sem dependência, conferido célula a
célula contra o `openpyxl` num arquivo real de 935.123 linhas: zero
diferenças.

## O painel

```bash
python -m numeros_publicos exportar     # grava painel/dados/snapshot.json
cd painel && npm install && npm run build
```

Next.js 16 + React 19 + TypeScript, **totalmente estático**
(`output: "export"`): sem servidor, sem função serverless, sem busca de dado
em tempo de execução. O build lê o retrato JSON do disco e emite HTML que já contém todos
os números. As 5.571 páginas de município e as 27 de estado são geradas em
**40 segundos**.

O único componente de cliente é a tabela de municípios, porque buscar e
ordenar 5.571 linhas é a única coisa aqui que precisa de verdade de
JavaScript.

### Conferindo o build

Três comandos, cada um conferindo algo que os outros não conseguem:

```bash
npm test           # as bibliotecas puras: a matemática da distribuição, o formato da planilha
npm run typecheck  # tsc --noEmit
npm run auditar    # acessibilidade e SEO, contra o HTML GERADO
```

`npm test` usa o executor de testes do Node sobre TypeScript, cujos tipos o
próprio Node remove: **nenhuma dependência de teste**. `npm run auditar`
precisa do `npm run build` e da saída servida na `:8791`; ele conduz um
navegador de verdade por todas as páginas **nos dois temas de cor**, porque um
defeito de contraste que só existe no modo claro é invisível para um
conferidor que só desenha o escuro.

```bash
npm run conferir-xlsx   # abre a planilha gerada no LibreOffice
```

O gravador de `.xlsx` monta um ZIP de XML à mão, e um erro de formato ali não
levanta exceção: produz um arquivo que o Excel se recusa a abrir. Por isso a
conferência entrega o arquivo ao LibreOffice, uma implementação independente,
converte de volta para CSV e compara os valores. Exige o LibreOffice no PATH
(ou `SOFFICE=` apontando para ele).

**Nenhum framework de CSS**, por decisão: tokens de desenho como propriedades
customizadas, mais CSS Modules. Uma dependência a menos e controle real sobre
a tipografia, inclusive `font-variant-numeric: tabular-nums`, sem o qual as
colunas de número dançam e comparar valores vira trabalho.

**Acessibilidade aqui não é enfeite**: link para pular ao conteúdo, semântica
real de tabela com `<th scope>`, cabeçalhos ordenáveis como `<button>` de
verdade (foco e teclado de graça), `aria-sort` só na coluna ativa e
`prefers-reduced-motion` respeitado.

### Publicação

O site é servido pela **Cloudflare Pages** (desde 27 de setembro de 2026;
antes, estava na Vercel). `.github/workflows/publicar-cloudflare.yml` gera o
`painel/` no GitHub Actions a cada push na `main` que muda o site, e depois da
atualização semanal de dados, e então sobe o `out/` pronto (Direct Upload),
de modo que o limite de 20 minutos de build da Pages nunca se aplica.
`cloudflare/_headers` define o cache longo de `/_next/static/` e marca os
hosts `*.pages.dev` como `noindex`. Precisa de dois secrets do repositório:
`CLOUDFLARE_API_TOKEN` (um token de conta com *Cloudflare Pages: Edit*) e
`CLOUDFLARE_ACCOUNT_ID`.

## Avisando os buscadores de que o site mudou

```bash
npm run indexnow
```

Um sitemap resolve a **descoberta**; não faz nada acontecer mais cedo. Medido
um dia depois da publicação: o Google tinha *detectado* todas as 5.600 URLs
do sitemap e *rastreado exatamente uma*, a página inicial.
O [IndexNow](https://www.indexnow.org/) é a outra metade: um aviso ativo de
que uma URL mudou, que os buscadores participantes usam para priorizar a fila
de rastreamento.

Escutam: **Bing, Yandex, Naver, Seznam, Yep e Amazon**. O Google não: a API
de indexação dele segue limitada a vagas de emprego e transmissões ao vivo.

**O Bing é o motivo de valer a pena**, e não pela busca do próprio Bing: ele
é o índice por trás do ChatGPT Search e do Copilot. Para um site cujo
conteúdo são respostas factuais com a fonte ao lado, ser citável por um
assistente vale, plausivelmente, mais do que uma posição numa página de
resultados.

Três coisas que o script se recusa a fazer, cada uma um erro já cometido uma
vez:

- **Enviar quando só o código mudou.** Um site estático se refaz inteiro a
  cada deploy, inclusive por um ajuste de CSS. A trava tira a impressão
  digital dos **arquivos de dados**, não do HTML gerado: uma mudança de layout
  não avisa ninguém; uma coleta nova avisa todo mundo. Para passar por cima,
  `--forcar`, se você sabe por quê.
- **Enviar antes de a chave estar no ar.** A chave tem de poder ser lida na
  raiz do domínio; é isso que prova a propriedade. O script confere primeiro o
  site **no ar**, porque enviar com a chave em 404 devolve 403 e queima o
  envio.
- **Sair por `process.exit()` com uma requisição em curso.** No Windows, isso
  derruba o processo de vez e o código de saída se perde na queda, e um
  pipeline lê a falha como sucesso.

A chave **não é segredo**: o protocolo exige que ela possa ser lida por
qualquer um. Ela fica em `public/`, e um teste confere que o conteúdo do
arquivo bate com a constante do script byte a byte, inclusive a ausência de
quebra de linha no fim. Errar isso faz todo envio devolver 403, semanas depois
da mudança que causou o erro.

## Todo número pode ser baixado

Um painel de dado público que só deixa *olhar* é meio painel: um número que
ninguém consegue baixar é um número que ninguém consegue contestar. Todo
número sai em três formatos, gerados no build como arquivos estáticos: sem
servidor, sem API.

| Arquivo | Formato | Para |
|---|---|---|
| `/dados/municipios.xlsx` | três abas | quem abre planilhas |
| `/dados/municipios.csv` | largo, uma linha por município | quem lê por programa |
| `/municipio/<slug>/dados.csv` | longo, uma observação por linha | uma cidade de cada vez |

**Os CSVs usam `;` e vírgula decimal, com BOM UTF-8.** Não é preciosismo: os
leitores deste site abrem o Excel em pt-BR, onde um CSV "padrão" cai inteiro
numa coluna só e, sem o BOM, `Município` aparece como `MunicÃ­pio`.

**A planilha leva duas abas que o CSV não consegue levar.** Uma diz o que
cada coluna significa; a outra diz de onde veio cada número e quando foi
coletado. Num CSV, elas teriam de virar um segundo arquivo que ninguém baixa
junto com o primeiro, e um número sem procedência é exatamente o que este
site existe para não produzir.

**Célula vazia quer dizer AUSENTE, nunca zero**, e isso sobrevive ao
download: `pessoal_publicou` é `sim`/`nao`/`nao_consultado`, nunca em branco.
Juntar "não declarou" com "não perguntamos" apagaria a distinção que o painel
inteiro existe para manter.

O `.xlsx` é gravado sem dependência: o formato é um ZIP de XML, e o Node traz
`deflateRawSync`, mas nenhum empacotador. Essa escolha cria uma obrigação de
conferência, cumprida pelo `npm run conferir-xlsx` acima.

## Notas de projeto

**Ausente não é zero.** O IBGE marca valores ausentes com `-`, `...` ou `X`.
Eles viram `NULL`, nunca `0`: confundir "não sabemos" com "zero" é como um
painel começa a mentir sem ninguém perceber. As médias contam só as linhas que
têm número.

**Procedência é coluna, não comentário.** Toda observação registra quando foi
coletada e de qual endpoint veio. Um número sem origem rastreável não vale
nada aqui: é isso que separa este projeto de um raspador.

**Revisão não sobrescreve.** O IBGE revisa o PIB retroativamente; uma coleta
nova com valor diferente vira outra linha, nunca uma sobrescrita silenciosa.

**Idempotente por construção.** Rodar duas vezes não muda nada: provado nos
testes e contra a API ao vivo (segunda rodada: 0 novos, todos os municípios já
conhecidos).

**Falha é esperada, não exceção.** O transporte devolve um status em vez de
levantar exceção numa falha de rede, então a política de nova tentativa é de
fato consultada; um `TimeoutError` de socket é um `OSError`, não um
`URLError`, e de outro modo escaparia dela.

**Um contrato, testado do lado do Python.** O painel em TypeScript lê o
retrato JSON na hora do build. Se a exportação em Python mudar de forma, o
painel quebra em outro diretório, em outra linguagem, sem aviso; por isso
`tests/test_snapshot.py` confere exatamente as chaves que `type Snapshot`
declara.

**Layout plano, de propósito.** A PyPA não recomenda `src/` acima do layout
plano; ela expõe os prós e contras, e o que decide aqui é que *"the src layout
requires installation of the project to be able to run its code, and the flat
layout does not"* (o layout `src` exige instalar o projeto para rodar o
código, e o plano não). Este projeto tem de rodar a partir de um clone limpo,
sem instalação.

## Licença: AGPL-3.0-or-later, de propósito

Não MIT. Este projeto pode plausivelmente virar produto: municípios
brasileiros compram exatamente esse tipo de portal de dado público, em
contratos contínuos, e os três editais lidos por inteiro o precificam em
R$ 5.000 a 6.000 por mês.

A MIT deixaria qualquer um pegar este código, **fechá-lo**, trocar a marca e
vendê-lo a esses mesmos municípios, inclusive os fornecedores que já estão lá
e com quem ele competiria. A AGPL o mantém aberto e inspecionável, que é todo
o motivo de publicá-lo, e exige que quem o oferecer **como serviço** publique
as suas modificações. É a cláusula que falta na MIT e de que um mercado de
SaaS precisa.

O direito autoral é de uma pessoa só, então o licenciamento duplo continua
possível: AGPL para todos, uma licença comercial para quem precisar dele
fechado.

Essa decisão fica mais cara com o tempo: trocar a licença depois exige o
consentimento de **cada** contribuidor.

## Fontes dos dados

Todas públicas, sem cadastro, sem token: `https://servicodados.ibge.gov.br`.
Todo endpoint foi chamado e devolveu dado municipal real antes de ser escrito
aqui; duas combinações de agregado e variável devolveram HTTP 500 e ficaram
de fora, em vez de prometidas.

Os números do emprego formal vêm dos microdados do Novo Caged do Ministério do
Trabalho, por FTP público (`ftp.mtps.gov.br`), conferidos contra o sumário
executivo mensal publicado no gov.br.

Os números fiscais vêm do SICONFI (`https://apidatalake.tesouro.gov.br`),
igualmente público e igualmente sem token. **O percentual da receita
comprometido com pessoal nunca é recalculado aqui**: ele chega calculado e
declarado pelo próprio município, sobre a receita corrente líquida
*ajustada*. Declarações fora de 0 a 100% da receita aparecem como foram
declaradas e marcadas como implausíveis, porque corrigi-las inventaria um
número, e escondê-las decidiria quais declarações um leitor pode ver.

<details>
<summary><b>In English</b></summary>

**Números Públicos**: open data on all 5,571 Brazilian municipalities, one
static page per municipality, live at
[www.numerospublicos.com.br](https://www.numerospublicos.com.br). The full
description is in Portuguese above; this is the short version.

- **Sources, all public and token-free:** IBGE's public APIs
  (`https://servicodados.ibge.gov.br`), municipal fiscal filings from
  SICONFI (`https://apidatalake.tesouro.gov.br`, through
  [painel-fiscal-ne](https://github.com/peterwkdev-creator/painel-fiscal-ne)),
  school results from INEP, INSS open data and the Ministry of Labour's Novo
  Caged microdata (`ftp.mtps.gov.br`).
- **Checked against the source, not against itself:** the sum of all
  municipalities against IBGE's own national total (2022 Census population:
  exact); the Caged month against the Ministry's executive summary, with no
  flag to skip it. Missing is never zero, provenance is a column, and
  revisions never overwrite.
- **Run and test:** Python 3.10+, standard library only
  (`python -m numeros_publicos`, 100 tests with no network); the panel is
  Next.js 16 + React 19 + TypeScript, fully static, served by Cloudflare
  Pages.
- **Every number is downloadable**, as `.xlsx` and `.csv`, for the whole
  country and per municipality.
- **Independent work**, with no affiliation to, or endorsement by, the
  Consórcio Nordeste or UNDP.
- **License:** AGPL-3.0-or-later; dual licensing stays available.

</details>
