const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),cache=new Map()
module.exports=function load(name){
 if(cache.has(name))return cache.get(name)
 const m={exports:{}},code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 new Function('require','module','exports',code)(id=>id.startsWith('./')?module.exports(id.slice(2)):require(id),m,m.exports)
 cache.set(name,m.exports);return m.exports
}
