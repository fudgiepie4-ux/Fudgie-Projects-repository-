import { stripTypeScriptTypes } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
mkdirSync('dist',{recursive:true});
for(const name of ['main','options']){const source=readFileSync(`src/${name}.ts`,'utf8').replace("import './style.css';",'').replace("from './options'","from './options.js'");writeFileSync(`dist/${name}.js`,stripTypeScriptTypes(source,{mode:'strip'}));}
copyFileSync('src/style.css','dist/style.css');
writeFileSync('dist/index.html',readFileSync('index.html','utf8').replace('/src/main.ts','/main.js').replace('</head>','<link rel="stylesheet" href="/style.css"></head>'));
console.log('Browser TypeScript compiled to dist/ (type stripping, not static type checking).');
