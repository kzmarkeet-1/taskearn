const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const root = process.env.PROJECT_ROOT || path.resolve(__dirname, "../..");
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(e.name)) files.push(p);
  }
})(root);

let errors = 0;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.ESNext,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const diags = sf.parseDiagnostics || [];
  if (diags.length) {
    errors += diags.length;
    console.log("\n" + path.relative(root, file));
    for (const d of diags.slice(0, 6)) {
      const { line, character } = sf.getLineAndCharacterOfPosition(d.start);
      console.log(`  ${line + 1}:${character + 1}  ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
    }
  }
}
console.log(`\nParsed ${files.length} files, ${errors} syntax errors.`);
