const ts=require("typescript"),fs=require("fs"),path=require("path");
const root = process.env.PROJECT_ROOT || path.resolve(__dirname, "../.."),srcRoot=path.join(root,"src");
const files=[];
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==="node_modules")continue;const p=path.join(d,e.name);e.isDirectory()?w(p):/\.(ts|tsx)$/.test(e.name)&&files.push(p);}})(srcRoot);

const isClient=(f)=>/^\s*["']use client["']/m.test(fs.readFileSync(f,"utf8").split("\n").slice(0,3).join("\n"));
const isServerOnly=(f)=>/import\s+["']server-only["']/.test(fs.readFileSync(f,"utf8"));

function resolve(spec,from){let b;if(spec.startsWith("@/"))b=path.join(srcRoot,spec.slice(2));else if(spec.startsWith("."))b=path.resolve(path.dirname(from),spec);else return null;
for(const c of [b+".ts",b+".tsx",path.join(b,"index.ts"),path.join(b,"index.tsx")])if(fs.existsSync(c))return c;return null;}

// transitive server-only reachability
const cache=new Map();
function reachesServerOnly(f,stack=new Set()){
  if(cache.has(f))return cache.get(f);
  if(stack.has(f))return null;
  stack.add(f);
  if(isServerOnly(f)){cache.set(f,[f]);return [f];}
  const sf=ts.createSourceFile(f,fs.readFileSync(f,"utf8"),ts.ScriptTarget.ESNext,true,ts.ScriptKind.TSX);
  let found=null;
  sf.forEachChild((n)=>{
    if(found)return;
    if(!ts.isImportDeclaration(n)||!n.moduleSpecifier)return;
    // type-only imports are erased and are safe
    if(n.importClause&&n.importClause.isTypeOnly)return;
    const t=resolve(n.moduleSpecifier.text,f); if(!t)return;
    const chain=reachesServerOnly(t,stack);
    if(chain)found=[f,...chain];
  });
  cache.set(f,found); return found;
}

let issues=0;
for(const f of files){
  if(!isClient(f))continue;
  const chain=reachesServerOnly(f);
  if(chain){
    console.log(`CLIENT→SERVER  ${path.relative(root,f)}`);
    console.log(`   chain: ${chain.map(c=>path.relative(root,c)).join("  →  ")}`);
    issues++;
  }
}
console.log(`\nclient components: ${files.filter(isClient).length}`);
console.log(`${issues} client components importing server-only code.`);
