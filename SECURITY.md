# Segurança

Achou uma falha de segurança no numerospublicos.com.br ou neste repositório?
Avise pelo **aviso privado de vulnerabilidade** do GitHub:
<https://github.com/peterwkdev-creator/numeros-publicos/security/advisories/new>.
Só o dono do repositório lê. Não abra uma issue pública.

O site é estático: não tem login, formulário nem banco de dados no ar, e
não guarda nada de quem o visita. O que mais interessa:

- uma página que execute script de fora (a CSP só permite os arquivos do
  próprio site);
- um número que não bate com a fonte oficial citada na página (aí vale também
  uma issue pública: não é segredo);
- um arquivo para baixar (CSV ou XLSX) com conteúdo que uma planilha execute.

A resposta vem em português ou inglês.

O endereço também está em
<https://www.numerospublicos.com.br/.well-known/security.txt> (RFC 9116).

<details>
<summary>In English</summary>

Found a security issue in numerospublicos.com.br or in this repository? Report
it through GitHub's
[private vulnerability reporting](https://github.com/peterwkdev-creator/numeros-publicos/security/advisories/new).
Please do not open a public issue. The site is static: no login, forms or live
database. Replies in Portuguese or English.

</details>
