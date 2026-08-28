const fs=require("fs"),path=require("path");
const root = process.env.PROJECT_ROOT || path.resolve(__dirname, "../.."), appDir=path.join(root,"src/app");

// Build the set of real routes from the app directory
const routes=new Set(); const dynamic=[];
(function w(dir,url){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory()){
      if(e.name==="api")continue;
      let seg=e.name;
      if(/^\(.*\)$/.test(seg)) w(p,url);                       // route group: no URL segment
      else if(/^\[.*\]$/.test(seg)) w(p,url+"/:param");
      else w(p,url+"/"+seg);
    } else if(/^page\.(tsx|ts)$/.test(e.name)){
      const u=url===""?"/":url;
      if(u.includes(":param")) dynamic.push(new RegExp("^"+u.replace(/:param/g,"[^/]+")+"$"));
      else routes.add(u);
    }
  }
})(appDir,"");

// API routes too
const apiRoutes=new Set(); const apiDynamic=[];
(function w(dir,url){
  if(!fs.existsSync(dir))return;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,e.name);
    if(e.isDirectory()){
      const seg=e.name;
      if(/^\[.*\]$/.test(seg)) w(p,url+"/:param"); else w(p,url+"/"+seg);
    } else if(/^route\.(tsx|ts)$/.test(e.name)){
      if(url.includes(":param")) apiDynamic.push(new RegExp("^"+url.replace(/:param/g,"[^/]+")+"$"));
      else apiRoutes.add(url);
    }
  }
})(path.join(appDir,"api"),"/api");

const files=[];
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==="node_modules"||e.name===".next")continue;const p=path.join(d,e.name);e.isDirectory()?w(p):/\.(ts|tsx)$/.test(e.name)&&files.push(p);}})(path.join(root,"src"));

function known(u){
  const clean=u.split("?")[0].split("#")[0].replace(/\/$/,"")||"/";
  if(clean.startsWith("/api/")) return apiRoutes.has(clean)||apiDynamic.some(r=>r.test(clean));
  return routes.has(clean)||dynamic.some(r=>r.test(clean));
}

let bad=0; const seen=new Set();
for(const f of files){
  const src=fs.readFileSync(f,"utf8");
  src.split("\n").forEach((line,i)=>{
    // href="/..." and static template hrefs, plus api() / fetch() paths
    for(const m of line.matchAll(/(?:href|action)=["'](\/[^"'{}]*)["']/g)) checkOne(m[1],f,i);
    for(const m of line.matchAll(/(?:api|fetch)<?[^>]*>?\(\s*["'`](\/api\/[^"'`${]*)["'`]/g)) checkOne(m[1],f,i);
  });
}
function checkOne(u,f,i){
  if(u.startsWith("//"))return;
  const key=u+"|"+f;
  if(seen.has(key))return; seen.add(key);
  if(!known(u)){ console.log(`BROKEN  ${path.relative(root,f)}:${i+1}  ${u}`); bad++; }
}
console.log(`\npages: ${routes.size} static + ${dynamic.length} dynamic | api: ${apiRoutes.size} + ${apiDynamic.length} dynamic`);
console.log(`${bad} broken internal links.`);
