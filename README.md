# Números Públicos

**Live at [www.numerospublicos.com.br](https://www.numerospublicos.com.br).**

Open data on **all 5,571 Brazilian municipalities** — ingested from official
IBGE public APIs, stored with full provenance, joined to municipal fiscal
filings from the National Treasury and to school results from INEP, and
published as **one static page per municipality**.

It started as a regional observatory for the Northeast (1,794 municipalities);
the national cut was always a flag, so the expansion was one command — and the
five latent defects it exposed are written up in the design notes below.

> **Status: published and scheduled.** Every figure is ingested from a live API,
> idempotent, cross-checked against IBGE's own regional aggregate, and rebuilt
> weekly by a GitHub Actions job that commits only when the data actually
> changed.

**5,571 indexable pages, not one.** The whole site used to be a single URL
holding every municipality behind a filter — which meant nobody searching for a
specific town could ever reach it. Each municipality now has its own address,
title, description and canonical, carrying population, GDP, personnel spending
against the legal limit, the school index, and work and income (2022 Census
unemployment, social-security coverage and earnings; the Central Business
Register's firms, jobs and average wage), joined by the shared IBGE code.

The fiscal half comes from [painel-fiscal-ne](https://github.com/peterwkdev-creator/painel-fiscal-ne),
handed over as a versioned snapshot rather than fetched at build time: a build
that reached into another repository would fail silently the day that repository
moved.

## Independent work — no affiliation

Built against a **public** term of reference (TR 21/2026, project BRA/23/006,
published by UNDP Brazil for the Consórcio Nordeste) describing a regional
observatory that does not yet exist. This is **independent work with no
affiliation to, or endorsement by, the Consórcio Nordeste or UNDP**, and it is
not a bid, proposal or deliverable for that contract.

## Run it

Python 3.10+ and nothing else — standard library only, no install step.

```bash
python -m numeros_publicos ingerir-municipios
```

Then:

```bash
python -m numeros_publicos ingerir-indicador populacao-censo-2022
python -m numeros_publicos observacoes pib-municipal --uf SE
python -m numeros_publicos conferir             # integrity, against the source
python -m numeros_publicos coletas              # ingestion history
```

## Integrity: checked against the source, not against itself

`conferir` compares the **sum of all municipalities** with the **regional total
IBGE itself publishes**. Verifying one city proves the parser is right; only the
sum proves the ingestion is *complete* — it catches a missing, duplicated or
mis-summed municipality in a single comparison.

Run against the live API on 2026-09-24, national cut (`--regiao BR`, IBGE's
own N1 aggregate):

| Indicator | Sum of municipalities | vs. IBGE national total |
|---|---|---|
| Population (2022 Census) | 203,080,756 | **exact** |
| Estimated population (2026) | 214,211,951 | **exact** |
| Municipal GDP (2023) | 10,943,345,420 (BRL thousands) | rounding, 19 (1.7e-09) |

**Averages and sample estimates are checked differently, and say so.** The
average wage and average earnings are IBGE's published means, not ours:
dividing the published total by the published head count misses by up to
BRL 2.92, because the count was rounded after IBGE computed the mean. Summing
means is meaningless, so `conferir` checks each municipality's mean against
`total ÷ count` within the error IBGE's own rounding allows. And the Census
labour tables are expanded from a sample, rounded per municipality: the
unemployed sum to 44 below the national total, which passes only for series
that declare `amostra=True` (at most half a person per municipality).

**IBGE's `-` means zero, not missing.** Until 2026-09-29 it was read as
absent, and 33 pages said "no data" on water or sewage where IBGE publishes
zero.

**The estimate and the GDP follow the latest year IBGE publishes.** Their
period is not written in the code: ingestion asks the API for the aggregate's
newest period (`MAIS_RECENTE`), so the weekly job picks up a new year on its
own. Until 2026-09-24 the years were hard-coded, and the site kept showing the
2024 estimate and the 2021 GDP while 2026 and 2023 were already out.

**Exact equality is the wrong test for a rounded aggregate**, and the first real
run showed why: GDP came out 5 apart in 1,243,103,280 back when the cut was
regional, and 31 apart in 9,012,142,000 nationally (2021) — the absolute gap grows
with the sum, the relative one does not. IBGE publishes municipal
GDP already rounded to thousands and computes the regional total before
rounding. Widening the tolerance to hide that would be dishonest; the check
**classifies** instead — below 1e-6 relative it is rounding and says so with the
number, above it the command fails. The gap between the two cases is hundreds of
times over.

## Test it

```bash
python -m unittest discover -s tests -t .
```

100 tests, **no network and no real waiting** — the HTTP transport and the clock
are injected. The fixtures in `tests/fixtures/` are real captured responses from
the IBGE API: the 75 municipalities of Sergipe, the 2022 Census population of
Rio Grande do Norte, and the 2021 GDP of Sergipe.

## Novo Caged: formal jobs, month by month

```bash
python -m numeros_publicos caged-novo       # is there a new month (files AND official summary)?
python -m numeros_publicos caged-ingerir    # 12 months x 3 files from the Ministry of Labour FTP
python -m numeros_publicos caged-exportar   # checks against the official summary, then writes painel/dados/caged.json
```

Hires and separations of formally registered (CLT) jobs, by municipality, for
the last 12 months, from the Ministry of Labour's public microdata
(`ftp.mtps.gov.br/pdet/microdados/NOVO CAGED/`). Each month has three files:
the month's movements, late filings for earlier months, and exclusions — which
undo a line already filed. The "adjusted" figure the Ministry publishes is
reproducible: for each month, its own file plus every late filing for that
month, minus every exclusion. On 2026-09-29 the month (+58,568), the year to
date (+972,203) and the 12 months (+880,717) matched the Ministry's executive
summary exactly.

`caged-exportar` has **no flag to skip that check**: it reads the summary PDF
from the month's folder on gov.br and refuses to write if any of the three
blocks differ. The December summary is an annual edition whose own figures do
not add up, so that month is refused and checked by hand. A municipality with
no line in a month has **zero** movements, not missing data. The files need
`7z` (or the `py7zr` package) and the summary needs `pdftotext`; the scheduled
workflow installs both.

## INSS: the social-security queue

```bash
python -m numeros_publicos inss-exportar   # writes painel/dados/inss.json, one entry per group
```

Each group with a publishable queue gets a page at `/inss/<group>/`: how long
the pending requests have been waiting, how long the denied ones took to get a
"no", and the 2021 Supreme Court agreement deadline as a *dated reference* —
with the caveat, where it applies, that the deadline only starts after the
medical examination, which the open data does not date. Like the snapshot, the
export refuses to shrink (fewer groups, or an older month) without
`--permitir-encolher`.

### Ingestion

`numeros_publicos/inss.py` reads two monthly datasets from INSS's open-data portal
into a separate database (`inss.db`; only `inss-exportar`, above, feeds the site):

```bash
python -m numeros_publicos inss-ingerir --mes 2026-07
python -m numeros_publicos inss-resumo --mes 2026-07
```

- **Pending requests** measure the *age of the queue*: how long the requests
  still undecided on the reference date have been waiting. Not the time to a
  decision — whoever was served fast has already left the file.
- **Denied requests** carry the request date and the denial date, so they give
  the time to a "no". Granted requests carry no request date; **the time to a
  "yes" is not in the open data.** They are stored with the *clientele*
  (urban or rural): it is the only column that separates, among denials, the
  urban old-age pension from the rural one, which share the same benefit code.
  A database written before this column existed refuses to open;
  `inss-ingerir --conjunto indeferidos` migrates it by re-reading each month.

The two files share no code: the queue uses *service* codes, the denials use
*benefit* codes. `numeros_publicos/inss_grupos.py` bridges them into ten groups
(the unit a page will have), each checked against the 2026 files, and every
code must fall into exactly one group or an explicit "no page" list — **a new
code refuses the ingestion** instead of vanishing from every page. A median is
publishable only with at least 1,000 requests: below ~500 it swung 25–100% from
one month to the next, in both directions.

The portal's labels are not trusted: in September 2026 the resource labelled
"August 2026" was July 2025's file. The month is checked **inside** each file,
and a mismatch is refused. The spreadsheets (60–70 MB) are read by a
dependency-free XLSX reader, checked cell by cell against `openpyxl` on a real
935,123-row file: zero differences.

## The panel

```bash
python -m numeros_publicos exportar     # writes painel/dados/snapshot.json
cd painel && npm install && npm run build
```

Next.js 16 + React 19 + TypeScript, **fully static** (`output: "export"`) — no
server, no serverless function, no runtime data fetching. The build reads the
JSON snapshot from disk and emits HTML that already contains every number.
5,571 municipality pages plus 27 state pages build in **40 seconds**.

The one client component is the municipality table, because searching and
sorting 5,571 rows is the only thing here that genuinely needs JavaScript.

### Checking the build

Three commands, each verifying something the others cannot:

```bash
npm test           # the pure libraries: distribution maths, spreadsheet format
npm run typecheck  # tsc --noEmit
npm run auditar    # accessibility and SEO, against the GENERATED HTML
```

`npm test` uses the Node test runner over TypeScript that Node itself strips —
**no test dependency**. `npm run auditar` needs `npm run build` and the output
served on `:8791`; it drives a real browser through every page in **both colour
themes**, because a contrast bug that only exists in light mode is invisible to
a checker that only ever renders dark.

```bash
npm run conferir-xlsx   # opens the generated spreadsheet in LibreOffice
```

The `.xlsx` writer builds a ZIP of XML by hand, and a format error there raises
no exception — it produces a file Excel refuses to open. So the check hands the
file to LibreOffice, an independent implementation, converts it back to CSV and
compares the values. Requires LibreOffice on the PATH (or `SOFFICE=` pointing
at it).

**No CSS framework**, by decision: design tokens as custom properties plus CSS
Modules. One less dependency, and real control over typography — including
`font-variant-numeric: tabular-nums`, without which number columns wobble and
comparing values becomes work.

**Accessibility is not decoration here**: skip link, real table semantics with
`<th scope>`, sortable headers as actual `<button>`s (focus and keyboard for
free), `aria-sort` only on the active column, and `prefers-reduced-motion`
honoured.

### Publishing

The site is served by **Cloudflare Pages** (since 27 September 2026; it was
on Vercel before). `.github/workflows/publicar-cloudflare.yml` builds
`painel/` on GitHub Actions on every push to `main` that changes the site,
and after the weekly data update, then uploads the finished `out/` (Direct
Upload), so Pages' 20-minute build limit never applies.
`cloudflare/_headers` sets the long cache for `/_next/static/` and marks the
`*.pages.dev` hosts `noindex`. It needs two repository secrets:
`CLOUDFLARE_API_TOKEN` (an account token with *Cloudflare Pages: Edit*) and
`CLOUDFLARE_ACCOUNT_ID`.

## Telling search engines the site changed

```bash
npm run indexnow
```

A sitemap solves **discovery**; it does not make anything happen sooner.
Measured one day after publishing: Google had *detected* all 5,600 URLs from
the sitemap and *crawled exactly one* — the home page.
[IndexNow](https://www.indexnow.org/) is the other half: an active ping that a
URL changed, which participating engines use to prioritise their crawl queue.

Listening: **Bing, Yandex, Naver, Seznam, Yep and Amazon** — not Google, whose
indexing API stays limited to job postings and livestreams.

**Bing is the reason this is worth doing**, and not for Bing's own search: it is
the index behind ChatGPT Search and Copilot. For a site whose content is factual
answers with the source beside them, being citable by an assistant is plausibly
worth more than a position on a search page.

Three things the script refuses to do, each of them a mistake made once:

- **Submit when only the code changed.** A static site rebuilds entirely on
  every deploy, including for a CSS tweak. The guard fingerprints the **data
  files**, not the generated HTML — a layout change tells nobody; a new
  collection tells everybody. Override with `--forcar` if you know why.
- **Submit before the key is live.** The key must be readable at the domain
  root; that is what proves ownership. The script checks the **live** site
  first, because submitting against a 404 key returns 403 and burns the
  submission.
- **Exit through `process.exit()` with a request in flight.** On Windows that
  aborts the process outright and the exit code is lost in the crash, so a
  pipeline reads a failure as a pass.

The key is **not a secret** — the protocol requires it to be publicly readable.
It lives in `public/`, and a test asserts the file content matches the constant
in the script byte for byte, including the absence of a trailing newline. Get
that wrong and every submission returns 403, weeks after the change that caused
it.

## Every number is downloadable

A public-data panel that only lets you *look* is half a panel: a number nobody
can download is a number nobody can contest. Every figure ships in three shapes,
generated at build time as static files — no server, no API.

| File | Shape | For |
|---|---|---|
| `/dados/municipios.xlsx` | three sheets | anyone who opens spreadsheets |
| `/dados/municipios.csv` | wide, one row per municipality | anyone reading it by program |
| `/municipio/<slug>/dados.csv` | long, one observation per row | one town at a time |

**The CSVs use `;` and decimal commas, with a UTF-8 BOM.** Not pedantry: this
site's readers open Excel in a pt-BR locale, where a "standard" CSV lands
entirely in one column and, without the BOM, `Município` renders as `MunicÃ­pio`.

**The spreadsheet carries two sheets the CSV cannot.** One says what each column
means; the other says where each number came from and when it was collected. In
a CSV those would have to become a second file nobody downloads alongside the
first — and a number without provenance is exactly what this site exists not to
produce.

**An empty cell means ABSENT, never zero**, and that survives the download:
`pessoal_publicou` is `sim`/`nao`/`nao_consultado`, never blank. Collapsing "did
not file" into "we did not ask" would erase the distinction the whole panel is
built to keep.

The `.xlsx` is written without a dependency — the format is a ZIP of XML, and
Node ships `deflateRawSync` but no packer. That choice buys a verification
obligation, met by `npm run conferir-xlsx` above.

## Design notes

**Missing is not zero.** IBGE marks absent values with `-`, `...` or `X`. Those
become `NULL`, never `0` — conflating "we don't know" with "zero" is how a
dashboard starts lying without anyone noticing. Averages count only rows that
have a number.

**Provenance is a column, not a comment.** Every observation records when it was
collected and which endpoint it came from. A number with no traceable origin is
worthless here — that is what separates this from a scraper.

**Revisions do not overwrite.** IBGE revises GDP retroactively; a new collection
with a different value becomes another row, never a silent overwrite.

**Idempotent by construction.** Running twice changes nothing: proven in tests
and against the live API (second run: 0 new, every municipality already
known).

**Failure is expected, not exceptional.** The transport returns a status instead
of raising on network failure, so retry policy is actually consulted; a socket
`TimeoutError` is an `OSError`, not a `URLError`, and would otherwise escape it.

**One contract, tested from the Python side.** The TypeScript panel reads the
JSON snapshot at build time. If the Python export changes shape, the panel
breaks in another directory, in another language, with no warning — so
`tests/test_snapshot.py` asserts exactly the keys `type Snapshot` declares.

**Flat layout, deliberately.** The PyPA does not recommend `src/` over flat; it
states the trade-off, and the deciding one here is that *"the src layout
requires installation of the project to be able to run its code, and the flat
layout does not."* This project must run from a clean checkout with no install.

## License: AGPL-3.0-or-later, deliberately

Not MIT. This project can plausibly become a product: Brazilian municipalities
buy exactly this kind of public data portal, on continuous contracts, and the
three tender documents read in full price it at BRL 5,000–6,000 per month.

MIT would let anyone take this code, **close it**, rebrand it and sell it to
those same municipalities — including the incumbent vendors it would compete
with. AGPL keeps it open and inspectable, which is the entire point of
publishing it, while requiring anyone who offers it **as a service** to publish
their modifications. That is the clause MIT lacks and a SaaS market needs.

The copyright is held by one person, so dual licensing stays available:
AGPL for everyone, a commercial licence for anyone who needs it closed.

Note that this decision gets more expensive over time — relicensing later
requires the consent of **every** contributor.

## Data sources

All public, no registration, no token — `https://servicodados.ibge.gov.br`.
Every endpoint was called and returned real municipal data before being written
down; two aggregate/variable combinations returned HTTP 500 and were left out
rather than promised.

The formal-employment figures come from the Ministry of Labour's Novo Caged
microdata, over public FTP (`ftp.mtps.gov.br`), checked against the monthly
executive summary published on gov.br.

The fiscal figures come from SICONFI (`https://apidatalake.tesouro.gov.br`),
equally public and equally token-free. **The percentage of revenue committed to
personnel is never recalculated here** — it arrives computed and filed by the
municipality itself, over its *adjusted* net revenue. Filings that fall outside
0–100% of revenue are shown as filed and labelled implausible, because
correcting them would invent a number and hiding them would decide which
filings a reader may see.
