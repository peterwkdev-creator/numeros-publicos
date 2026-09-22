#!/bin/sh
# Ignored Build Step da Vercel: sai 0 para PULAR o build, diferente de 0 para
# construir. Chamado pelo `ignoreCommand` do vercel.json, que roda na pasta
# `painel/` (o Root Directory do projeto).
#
# Por que é um arquivo e não uma linha no vercel.json: o esquema limita o
# `ignoreCommand` a 256 caracteres, e a versão em linha tinha mais. A Vercel
# recusou o deploy inteiro por isso em 22/09/2026 — o erro não aparece em
# nenhum build local, só no deploy.
#
# A regra: commit que não muda o que vai para o `out/` não gera deploy. Cada
# deploy guarda o site inteiro de novo no Deployment Storage, e o Hobby
# bloqueia deploy acima de 10 GB (`hospedagem-armazenamento.md`).
#
# Compara com o ÚLTIMO DEPLOY QUE DEU CERTO, e não com `HEAD^`: num push com
# vários commits, `HEAD^` não veria a mudança de site de um commit do meio.
#
# O erro fica sempre do lado de CONSTRUIR: sem SHA anterior, ou com o
# histórico raso demais para alcançá-lo, o `git diff` falha, sai diferente de
# 0, e o build roda.

[ -n "$VERCEL_GIT_PREVIOUS_SHA" ] || exit 1

git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . \
  ':(exclude)tests' \
  ':(exclude).indexnow.json' \
  ':(exclude)scripts/auditar.mjs' \
  ':(exclude)scripts/conferir-links.mjs' \
  ':(exclude)scripts/conferir-xlsx.mjs' \
  ':(exclude)scripts/indexnow.mjs' \
  ':(exclude)scripts/medir-inp.mjs'
