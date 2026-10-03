/**
 * Sai com 1 se a porta já responde, antes de o `npm run start` subir o serve.
 *
 *     node scripts/porta-livre.mjs 8791
 *
 * O serve 14.2.6 (a última versão em 02/10/2026) aceita `--no-port-switching`
 * e não o lê: se a porta responde, ele sobe noutra, calado. Foi assim que a
 * auditoria e o medir-inp de 02/10 rodaram contra um servidor órfão na 8791,
 * e não contra o build que se queria medir. A sonda faz a mesma pergunta que
 * o serve faz (uma conexão em localhost) e recusa onde ele trocaria.
 */
import { connect } from "node:net";

const porta = Number(process.argv[2]);
if (!Number.isInteger(porta) || porta <= 0) {
  console.error(`porta-livre: porta inválida: ${process.argv[2]}`);
  process.exit(2);
}

const sonda = connect({ port: porta, host: "localhost" });
sonda.setTimeout(2000);
sonda.once("connect", () => {
  sonda.destroy();
  console.error(
    `porta-livre: a porta ${porta} já está ocupada. Encerre o servidor que ` +
      `está nela; senão o serve sobe noutra porta e a medição lê o antigo.`,
  );
  process.exit(1);
});
sonda.once("timeout", () => {
  // O serve também lê o silêncio como porta livre; se ela não estiver, o
  // listen dele falha alto (EADDRINUSE), sem trocar de porta.
  sonda.destroy();
  process.exit(0);
});
sonda.once("error", (erro) => {
  if (erro.code === "ECONNREFUSED") process.exit(0);
  console.error(`porta-livre: não consegui sondar a porta ${porta}: ${erro.message}`);
  process.exit(2);
});
