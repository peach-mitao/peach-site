import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),sql=await readFile(new URL('worker/behavior-schema.sql',root),'utf8');
const batch=sql.split(';').map(sql=>sql.trim()).filter(Boolean).map(sql=>({sql,params:[]}));
await mkdir(new URL('evidence/',root),{recursive:true});await writeFile(new URL('evidence/behavior-migration.json',root),JSON.stringify(batch));
