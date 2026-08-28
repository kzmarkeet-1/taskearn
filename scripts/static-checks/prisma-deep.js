const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const root = process.env.PROJECT_ROOT || path.resolve(__dirname, "../..");
const schema = fs.readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");

const modelNames = new Set();
for (const m of schema.matchAll(/^model\s+(\w+)\s*\{/gm)) modelNames.add(m[1]);

const fieldsOf = new Map();   // clientModel -> Set(field)
const relOf = new Map();      // clientModel -> Map(field -> clientTargetModel)
const toClient = (n) => n.charAt(0).toLowerCase() + n.slice(1);

for (const m of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
  const client = toClient(m[1]);
  const fields = new Set(); const rels = new Map();
  for (const line of m[2].split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
    const fm = t.match(/^(\w+)\s+(\w+)(\[\])?\??/);
    if (!fm) continue;
    fields.add(fm[1]);
    if (modelNames.has(fm[2])) rels.set(fm[1], toClient(fm[2]));
  }
  fieldsOf.set(client, fields); relOf.set(client, rels);
}

const META = new Set(["select","include","where","data","orderBy","take","skip","cursor","distinct","by","having",
  "_sum","_count","_avg","_max","_min","_all","create","update","upsert","connect","connectOrCreate","disconnect",
  "set","increment","decrement","multiply","divide","push","delete","deleteMany","updateMany","createMany",
  "equals","not","in","notIn","lt","lte","gt","gte","contains","startsWith","endsWith","mode","AND","OR","NOT",
  "some","every","none","is","isNot","hasEvery","hasSome","has","isEmpty","skipDuplicates","sort","nulls"]);

const files = [];
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==="node_modules"||e.name===".next")continue;const p=path.join(d,e.name);e.isDirectory()?walk(p):/\.(ts|tsx)$/.test(e.name)&&files.push(p);}})(root);

let problems = 0;

function walkObj(node, model, file, sf, trail) {
  if (!ts.isObjectLiteralExpression(node)) return;
  const fields = fieldsOf.get(model); const rels = relOf.get(model);
  if (!fields) return;
  for (const prop of node.properties) {
    if (!prop.name) continue;
    const key = ts.isIdentifier(prop.name)||ts.isStringLiteral(prop.name) ? prop.name.text : null;
    if (!key) continue;
    const init = ts.isPropertyAssignment(prop) ? prop.initializer : null;

    if (META.has(key)) { if (init) walkObj(init, model, file, sf, trail); continue; }
    if (key.includes("_") && key.split("_").every((k)=>fields.has(k))) { if(init) walkObj(init, model, file, sf, trail); continue; }

    if (!fields.has(key)) {
      const { line } = sf.getLineAndCharacterOfPosition(prop.getStart(sf));
      console.log(`FIELD  ${path.relative(root,file)}:${line+1}  ${trail}.${key}  — not on model ${model}`);
      problems++; continue;
    }
    if (init && rels.has(key)) walkObj(init, rels.get(key), file, sf, `${trail}.${key}`);
  }
}

for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file,"utf8"), ts.ScriptTarget.ESNext, true,
    file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  (function visit(node){
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const target = node.expression.expression;
      if (ts.isPropertyAccessExpression(target)) {
        const model = target.name.text;
        const baseName = ts.isIdentifier(target.expression) ? target.expression.text : null;
        if ((baseName==="prisma"||baseName==="tx") && fieldsOf.has(model) && node.arguments[0]) {
          walkObj(node.arguments[0], model, file, sf, model);
        }
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
}
console.log(`models in schema: ${modelNames.size}`);
console.log(`\n${problems} deep prisma field problems.`);
