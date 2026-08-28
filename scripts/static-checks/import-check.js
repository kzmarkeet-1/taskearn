const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const root = process.env.PROJECT_ROOT || path.resolve(__dirname, "../..");
const srcRoot = path.join(root, "src");

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
  }
})(root);

function parse(file) {
  return ts.createSourceFile(
    file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ESNext, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function resolve(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = path.join(srcRoot, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // external package
  for (const c of [base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx"), base]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return { missing: base };
}

// Collect exported names per file (including `export * from`)
const exportsOf = new Map();
const starExports = new Map();

function collectExports(file) {
  if (exportsOf.has(file)) return;
  const names = new Set();
  const stars = [];
  exportsOf.set(file, names);
  starExports.set(file, stars);
  const sf = parse(file);
  sf.forEachChild((node) => {
    const mods = ts.canHaveModifiers(node) ? (ts.getModifiers(node) || []) : [];
    const isExported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(node) && isExported && node.name) names.add(node.name.text);
    else if (ts.isClassDeclaration(node) && isExported && node.name) names.add(node.name.text);
    else if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) && isExported) names.add(node.name.text);
    else if (ts.isVariableStatement(node) && isExported) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.add(d.name.text);
        else if (ts.isObjectBindingPattern(d.name)) for (const el of d.name.elements) if (ts.isIdentifier(el.name)) names.add(el.name.text);
      }
    } else if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) names.add(el.name.text);
      } else if (!node.exportClause && node.moduleSpecifier) {
        stars.push(node.moduleSpecifier.text);
      }
    } else if (ts.isExportAssignment(node)) names.add("default");
  });
  // default export via `export default function/class`
  const text = fs.readFileSync(file, "utf8");
  if (/^export default /m.test(text)) names.add("default");
}

for (const f of files) collectExports(f);

function allExports(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);
  const out = new Set(exportsOf.get(file) || []);
  for (const spec of starExports.get(file) || []) {
    const r = resolve(spec, file);
    if (r && typeof r === "string") for (const n of allExports(r, seen)) out.add(n);
  }
  return out;
}

let problems = 0;
for (const file of files) {
  const sf = parse(file);
  sf.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !node.moduleSpecifier) return;
    const spec = node.moduleSpecifier.text;
    const r = resolve(spec, file);
    if (r === null) return;
    if (typeof r === "object") {
      problems++;
      console.log(`UNRESOLVED  ${path.relative(root, file)}\n            imports "${spec}"`);
      return;
    }
    const avail = allExports(r);
    const clause = node.importClause;
    if (!clause) return;
    if (clause.name && !avail.has("default")) {
      problems++;
      console.log(`NO DEFAULT  ${path.relative(root, file)}\n            "${spec}" has no default export`);
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        const want = (el.propertyName || el.name).text;
        if (!avail.has(want)) {
          problems++;
          console.log(`MISSING     ${path.relative(root, file)}\n            "${spec}" does not export "${want}"`);
        }
      }
    }
  });
}
console.log(`\n${problems} import problems across ${files.length} files.`);
