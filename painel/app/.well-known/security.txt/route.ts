import { SITE } from "../../../lib/servidor";

/**
 * `/.well-known/security.txt` (RFC 9116): onde avisar de uma falha de
 * segurança. Criado em 17/10/2026; até ali o endereço dava 404.
 *
 * O contato é o aviso privado de vulnerabilidade do repositório no GitHub, e
 * não um e-mail: o site não publica e-mail nenhum, e o aviso privado só o dono
 * do repositório lê.
 *
 * O `Expires` é obrigatório e conta da data do BUILD: 180 dias adiante. O site
 * publica pelo menos uma vez por mês (as coletas do IBGE e do Caged), então a
 * data se renova sozinha; se as publicações pararem por meio ano, o arquivo
 * vence, e é isso mesmo que ele deve dizer.
 */
export const dynamic = "force-static";

const REPOSITORIO = "https://github.com/peterwkdev-creator/numeros-publicos";
const VALIDADE_DIAS = 180;

export function GET(): Response {
  const vence = new Date(Date.now() + VALIDADE_DIAS * 86_400_000);
  vence.setUTCHours(0, 0, 0, 0);
  const linhas = [
    `Contact: ${REPOSITORIO}/security/advisories/new`,
    `Expires: ${vence.toISOString()}`,
    "Preferred-Languages: pt, en",
    `Canonical: ${SITE}/.well-known/security.txt`,
    `Policy: ${REPOSITORIO}/security/policy`,
  ];
  return new Response(linhas.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
