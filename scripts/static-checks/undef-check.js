const ts=require("typescript"),fs=require("fs"),path=require("path");
const root = process.env.PROJECT_ROOT || path.resolve(__dirname, "../..");
const files=[];
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==="node_modules"||e.name===".next")continue;const p=path.join(d,e.name);e.isDirectory()?w(p):/\.(ts|tsx)$/.test(e.name)&&files.push(p);}})(root);

const GLOBALS=new Set(["console","process","Math","JSON","Object","Array","String","Number","Boolean","Date","Promise","Error","Set","Map","WeakMap","Symbol","BigInt","RegExp","URL","URLSearchParams","Request","Response","Headers","fetch","crypto","Buffer","setTimeout","clearTimeout","setInterval","clearInterval","window","document","navigator","localStorage","globalThis","undefined","null","true","false","NaN","Infinity","parseInt","parseFloat","isNaN","isFinite","encodeURIComponent","decodeURIComponent","React","JSX","HTMLElement","HTMLInputElement","HTMLSelectElement","HTMLTextAreaElement","HTMLDivElement","HTMLButtonElement","HTMLAnchorElement","HTMLFormElement","HTMLTableElement","HTMLTableRowElement","HTMLTableCellElement","HTMLTableSectionElement","HTMLParagraphElement","HTMLHeadingElement","HTMLSpanElement","HTMLLabelElement","Event","FormData","AbortController","TextEncoder","TextDecoder","structuredClone","queueMicrotask","Intl","require","module","exports","__dirname","__filename","Uint8Array","ArrayBuffer","Record","Partial","Pick","Omit","Exclude","Extract","Awaited","ReturnType","Parameters","NonNullable","Readonly","Required","InstanceType","keyof","this","arguments","Function","Iterable","AsyncIterable","Generator","IteratorResult","Node","Element","MouseEvent","KeyboardEvent","ChangeEvent","FocusEvent","ClipboardEvent",
"ResponseInit","RequestInit","BodyInit","HeadersInit","NodeJS","Omit","Uppercase","Lowercase","Capitalize",
"const","Iterator","PromiseLike","ArrayLike","Thenable","AbortSignal","Blob","File","FileReader","Image",
"IntersectionObserver","ResizeObserver","MutationObserver","performance","location","history","alert","confirm"]);

let issues=0;
for(const file of files){
  const src=fs.readFileSync(file,"utf8");
  const sf=ts.createSourceFile(file,src,ts.ScriptTarget.ESNext,true,file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const declared=new Set();

  // top-level declarations + imports
  const collectName=(n)=>{
    if(!n)return;
    if(ts.isIdentifier(n))declared.add(n.text);
    else if(ts.isObjectBindingPattern(n)||ts.isArrayBindingPattern(n))
      for(const el of n.elements) if(ts.isBindingElement(el)) collectName(el.name);
  };
  const walkDecl=(node)=>{
    if(ts.isImportDeclaration(node)&&node.importClause){
      const cl=node.importClause;
      if(cl.name)declared.add(cl.name.text);
      if(cl.namedBindings){
        if(ts.isNamedImports(cl.namedBindings))for(const el of cl.namedBindings.elements)declared.add(el.name.text);
        else declared.add(cl.namedBindings.name.text);
      }
    }
    if(ts.isFunctionDeclaration(node)&&node.name)declared.add(node.name.text);
    if(ts.isClassDeclaration(node)&&node.name)declared.add(node.name.text);
    if(ts.isTypeAliasDeclaration(node)||ts.isInterfaceDeclaration(node)||ts.isEnumDeclaration(node))declared.add(node.name.text);
    if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations)collectName(d.name);
    // nested declarations anywhere (params, locals, catch, loops)
    if(ts.isParameter(node))collectName(node.name);
    if(ts.isVariableDeclaration(node))collectName(node.name);
    if(ts.isBindingElement(node))collectName(node.name);
    if(ts.isFunctionExpression(node)&&node.name)declared.add(node.name.text);
    if(ts.isCatchClause(node)&&node.variableDeclaration)collectName(node.variableDeclaration.name);
    if(ts.isTypeParameterDeclaration(node))declared.add(node.name.text);
    if(ts.isImportEqualsDeclaration(node))declared.add(node.name.text);
    ts.forEachChild(node,walkDecl);
  };
  walkDecl(sf);

  // now find free identifiers in value/type positions
  const seen=new Set();
  const check=(node)=>{
    if(ts.isIdentifier(node)){
      const p=node.parent;
      // class and interface member names are declarations, not references
      const isMember = p&&((ts.isPropertyDeclaration(p)&&p.name===node)||
        (ts.isMethodDeclaration(p)&&p.name===node)||
        (ts.isMethodSignature(p)&&p.name===node)||
        (ts.isPropertySignature(p)&&p.name===node)||
        (ts.isGetAccessorDeclaration(p)&&p.name===node)||
        (ts.isSetAccessorDeclaration(p)&&p.name===node));
      // lowercase JSX tags are intrinsic HTML elements
      const isIntrinsicJsx = p&&(ts.isJsxOpeningElement(p)||ts.isJsxSelfClosingElement(p)||ts.isJsxClosingElement(p))&&
        p.tagName===node&&/^[a-z]/.test(node.text);
      if(isMember||isIntrinsicJsx){ts.forEachChild(node,check);return;}
      const isPropName = p&&((ts.isPropertyAccessExpression(p)&&p.name===node)||
        (ts.isPropertyAssignment(p)&&p.name===node)||
        (ts.isPropertySignature(p)&&p.name===node)||
        (ts.isMethodDeclaration(p)&&p.name===node)||
        (ts.isBindingElement(p)&&p.propertyName===node)||
        (ts.isImportSpecifier(p))||(ts.isExportSpecifier(p))||
        (ts.isJsxAttribute(p)&&p.name===node)||
        (ts.isQualifiedName(p))||
        (p&&p.parent&&ts.isImportTypeNode(p.parent))||
        (ts.isEnumMember(p)&&p.name===node)||
        (ts.isShorthandPropertyAssignment(p)&&false));
      if(!isPropName&&!declared.has(node.text)&&!GLOBALS.has(node.text)&&!seen.has(node.text)){
        seen.add(node.text);
        const {line}=sf.getLineAndCharacterOfPosition(node.getStart(sf));
        console.log(`UNDEF  ${path.relative(root,file)}:${line+1}  ${node.text}`);
        issues++;
      }
    }
    ts.forEachChild(node,check);
  };
  check(sf);
}
console.log(`\n${issues} possibly-undefined identifiers.`);
