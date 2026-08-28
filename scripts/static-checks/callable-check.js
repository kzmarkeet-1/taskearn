const ts=require("typescript"),fs=require("fs"),path=require("path");
const root = process.env.PROJECT_ROOT || path.resolve(__dirname, "../.."), srcRoot=path.join(root,"src");

const files=[];
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==="node_modules"||e.name===".next")continue;const p=path.join(d,e.name);e.isDirectory()?w(p):/\.(ts|tsx)$/.test(e.name)&&files.push(p);}})(root);

const parse=(f)=>ts.createSourceFile(f,fs.readFileSync(f,"utf8"),ts.ScriptTarget.ESNext,true,f.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
function resolve(spec,from){let b;if(spec.startsWith("@/"))b=path.join(srcRoot,spec.slice(2));else if(spec.startsWith("."))b=path.resolve(path.dirname(from),spec);else return null;
for(const c of [b+".ts",b+".tsx",path.join(b,"index.ts"),path.join(b,"index.tsx")])if(fs.existsSync(c))return c;return null;}

// kind of each export: "fn" | "value" | "type"
const kinds=new Map(); // file -> Map(name->kind)
function collect(f){
  if(kinds.has(f))return kinds.get(f);
  const m=new Map(); kinds.set(f,m);
  const sf=parse(f);
  sf.forEachChild((n)=>{
    const mods=ts.canHaveModifiers(n)?(ts.getModifiers(n)||[]):[];
    const exp=mods.some((x)=>x.kind===ts.SyntaxKind.ExportKeyword);
    if(!exp)return;
    if(ts.isFunctionDeclaration(n)&&n.name)m.set(n.name.text,"fn");
    else if(ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n))m.set(n.name.text,"type");
    else if(ts.isVariableStatement(n)){
      for(const d of n.declarationList.declarations){
        if(!ts.isIdentifier(d.name))continue;
        const init=d.initializer;
        const isFn=init&&(ts.isArrowFunction(init)||ts.isFunctionExpression(init)||
          (ts.isCallExpression(init)&&ts.isIdentifier(init.expression)&&init.expression.text==="cache"));
        m.set(d.name.text,isFn?"fn":"value");
      }
    }
  });
  return m;
}
for(const f of files)collect(f);

let issues=0;
for(const file of files){
  const sf=parse(file);
  const imported=new Map(); // local name -> kind
  sf.forEachChild((n)=>{
    if(!ts.isImportDeclaration(n)||!n.moduleSpecifier)return;
    const t=resolve(n.moduleSpecifier.text,file); if(!t)return;
    const k=collect(t);
    const cl=n.importClause; if(!cl||!cl.namedBindings||!ts.isNamedImports(cl.namedBindings))return;
    for(const el of cl.namedBindings.elements){
      const orig=(el.propertyName||el.name).text;
      if(k.has(orig)&&k.get(orig)!=="type")imported.set(el.name.text,{kind:k.get(orig),from:n.moduleSpecifier.text,orig});
    }
  });
  if(!imported.size)continue;

  (function visit(node){
    // fn used as object: `foo.bar` where foo is an imported function and it's not called
    if(ts.isPropertyAccessExpression(node)&&ts.isIdentifier(node.expression)){
      const info=imported.get(node.expression.text);
      if(info&&info.kind==="fn"){
        const okProps=new Set(["name","length","call","apply","bind","prototype"]);
        if(!okProps.has(node.name.text)){
          const {line}=sf.getLineAndCharacterOfPosition(node.getStart(sf));
          console.log(`FN-AS-OBJ  ${path.relative(root,file)}:${line+1}  ${node.expression.text}.${node.name.text}  (${info.orig} from "${info.from}" is a function)`);
          issues++;
        }
      }
    }
    // value called: `foo()` where foo is an imported non-function const
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)){
      const info=imported.get(node.expression.text);
      if(info&&info.kind==="value"){
        const {line}=sf.getLineAndCharacterOfPosition(node.getStart(sf));
        console.log(`VAL-CALLED ${path.relative(root,file)}:${line+1}  ${node.expression.text}()  (${info.orig} from "${info.from}" is not a function)`);
        issues++;
      }
    }
    ts.forEachChild(node,visit);
  })(sf);
}
console.log(`\n${issues} callable-shape issues.`);
