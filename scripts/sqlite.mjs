import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function database(path=':memory:'){
 const sqlite=new DatabaseSync(path);sqlite.exec('PRAGMA journal_mode=WAL');
 sqlite.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
 for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())if(!sqlite.prepare('SELECT name FROM _migrations WHERE name=?').get(name)){sqlite.exec(readFileSync(`drizzle/${name}`,'utf8'));sqlite.prepare('INSERT INTO _migrations VALUES(?)').run(name)}
 const prepare=(sql,values=[])=>({bind(...v){return prepare(sql,v)},first(){return sqlite.prepare(sql).get(...values)||null},all(){return {results:sqlite.prepare(sql).all(...values)}},run(){const r=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:Number(r.changes)}}}});
 return {prepare,async batch(statements){sqlite.exec('BEGIN');try{const out=statements.map(s=>s.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}},close(){sqlite.close()}};
}
