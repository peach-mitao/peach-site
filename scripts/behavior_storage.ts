// 本地预览与隔离测试使用 SQLite，SQL 与 D1 共用同一份迁移。
import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import type {Database,Statement} from '../worker/behavior.ts';
export function behaviorStorage(file:string){
 if(file!==':memory:')mkdirSync(path.dirname(file),{recursive:true});
 const sqlite=new DatabaseSync(file);sqlite.exec(readFileSync(new URL('../worker/behavior-schema.sql',import.meta.url),'utf8'));
 const database:Database={prepare(sql:string){
  let values:SQLInputValue[]=[];
  const statement:Statement={bind(...args:unknown[]){values=args as SQLInputValue[];return statement},async all<T>(){return {results:sqlite.prepare(sql).all(...values).map(row=>({...row})) as T[]}},async first<T>(){const row=sqlite.prepare(sql).get(...values);return (row?{...row}:null) as T|null},async run(){return sqlite.prepare(sql).run(...values)}};
  return statement;
 },async batch(statements){sqlite.exec('BEGIN');try{const rows=[];for(const statement of statements)rows.push(await statement.run());sqlite.exec('COMMIT');return rows}catch(error){sqlite.exec('ROLLBACK');throw error}}};
 return {database,sqlite};
}
