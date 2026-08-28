/**
 * Runs every static check in sequence and exits non-zero if any reports a problem.
 *
 * These are a stopgap, not a replacement for `tsc`. They were written because
 * the environment this project was finished in had no npm registry access, so
 * `npm run typecheck` could not be executed. They catch structural mistakes —
 * unresolved imports, wrong Prisma fields, undeclared identifiers, client
 * components pulling in server-only code, broken internal links — but they know
 * nothing about types. Run `npm run typecheck` as well once dependencies are
 * installed; it supersedes most of this.
 */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const CHECKS = [
  ["syntax", "syntax-check.js", "TypeScript/TSX parse errors"],
  ["imports", "import-check.js", "unresolved imports and missing named exports"],
  ["prisma", "prisma-deep.js", "model and field references against schema.prisma"],
  ["callables", "callable-check.js", "functions used as objects, values called as functions"],
  ["undefined", "undef-check.js", "identifiers used without being declared or imported"],
  ["boundaries", "boundary-check.js", "client components importing server-only modules"],
  ["links", "link-check.js", "internal hrefs and API paths that resolve to no route"],
];

let failed = 0;

for (const [name, file, description] of CHECKS) {
  process.stdout.write(`\n── ${name}: ${description}\n`);
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, file)], { encoding: "utf8" });
    process.stdout.write(out.trim() + "\n");
    // Each checker ends with a count; anything other than a leading 0 is a hit.
    const last = out.trim().split("\n").pop() ?? "";
    const count = Number((last.match(/^(\d+)/) || [])[1] ?? 0);
    if (count > 0) failed += 1;
  } catch (error) {
    process.stdout.write(`  checker itself failed: ${error.message}\n`);
    failed += 1;
  }
}

process.stdout.write(`\n${failed === 0 ? "All static checks clean." : `${failed} check(s) reported problems.`}\n`);
process.exit(failed === 0 ? 0 : 1);
