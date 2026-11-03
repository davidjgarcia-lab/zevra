import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const stub = `
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
grant usage on schema auth, storage, public to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
grant execute on function storage.foldername(text) to authenticated;
create publication supabase_realtime;
`;
await db.exec(stub);
const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
try { await db.exec(schema); } catch (e) { console.log("SQL ERROR:", e.message, e.position, e.where); process.exit(1); }
await db.exec(schema); // idempotente
console.log('schema OK x2');

const U = {};
for (const n of ['ana','ben','cris']) { const r = await db.query(`insert into auth.users (raw_user_meta_data) values ($1) returning id`, [JSON.stringify({alias: n})]); U[n] = r.rows[0].id; }
let ok = 0, fail = 0;
async function as(user, sql, params=[]) {
  await db.exec(`reset role; select set_config('request.jwt.sub', '${user||''}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
async function expect(name, fn, shouldFail=false) {
  try { const r = await fn(); if (shouldFail) { fail++; console.log('FAIL (should have failed):', name, JSON.stringify(r?.rows)); } else { ok++; return r; } }
  catch (e) { if (shouldFail) { ok++; } else { fail++; console.log('FAIL:', name, e.message); } }
}
const rows = async (u, sql, p) => (await as(u, sql, p)).rows;

await expect('perfil creado', async()=>{ const r = await rows(U.ana, `select alias from profiles where id=$1`, [U.ana]); if (r[0].alias!=='ana') throw new Error(JSON.stringify(r)); });
await expect('no leer birthdate', ()=>as(U.ana, `select birthdate from profiles`), true);
await expect('no actualizar age_verified_at', ()=>as(U.ana, `update profiles set age_verified_at=now() where id=$1`, [U.ana]), true);
await expect('actualizar bio propia', ()=>as(U.ana, `update profiles set bio='hola' where id=$1`, [U.ana]));
await expect('match sin verificar', ()=>as(U.ana, `select find_match('social','p1')`), true);
await expect('menor rechazado', ()=>as(U.ana, `select verify_age('2012-01-01','2030-01-01',$1)`, ['x'.repeat(64)]), true);
await expect('DNI caducado', ()=>as(U.ana, `select verify_age('1990-01-01','2020-01-01',$1)`, ['x'.repeat(64)]), true);
await expect('verificar ana', ()=>as(U.ana, `select verify_age('1990-05-01','2031-01-01',$1)`, ['a'.repeat(64)]));
await expect('DNI duplicado', ()=>as(U.ben, `select verify_age('1992-05-01','2031-01-01',$1)`, ['a'.repeat(64)]), true);
await expect('verificar ben', ()=>as(U.ben, `select verify_age('1992-05-01','2031-01-01',$1)`, ['b'.repeat(64)]));
await expect('verificar cris', ()=>as(U.cris, `select verify_age('1995-05-01','2031-01-01',$1)`, ['c'.repeat(64)]));

// chat antes de conectar
await expect('chat sin conexión previa', ()=>as(U.ana, `insert into messages (recipient, kind, body) values ($1,'text','hola')`, [U.ben]), true);
// matching
const m1 = await expect('ana espera', ()=>as(U.ana, `select find_match('social','peer-ana') as r`));
if (m1.rows[0].r !== null) { fail++; console.log('ana debería esperar'); }
const m2 = await expect('ben encuentra a ana', ()=>as(U.ben, `select find_match('social','peer-ben') as r`));
const call = m2.rows[0].r; if (call?.peer_id !== 'peer-ana') { fail++; console.log('match mal', call); }
await expect('cris no ve la llamada', async()=>{ const r = await rows(U.cris, `select * from calls`); if (r.length) throw new Error('ve llamadas'); });
await expect('ana ve la llamada', async()=>{ const r = await rows(U.ana, `select * from calls`); if (r.length!==1) throw new Error('no'); });
// valoración antes de 4 min
await expect('ana termina', ()=>as(U.ana, `select end_call($1)`, [call.call_id]));
await expect('valorar llamada corta', ()=>as(U.ana, `insert into ratings (call_id, ratee, score) values ($1,$2,5)`, [call.call_id, U.ben]), true);
await db.query(`update calls set started_at = ended_at - interval '5 minutes' where id=$1`, [call.call_id]);
await expect('valorar llamada >4min', ()=>as(U.ana, `insert into ratings (call_id, ratee, score) values ($1,$2,5)`, [call.call_id, U.ben]));
await expect('valorar dos veces', ()=>as(U.ana, `insert into ratings (call_id, ratee, score) values ($1,$2,4)`, [call.call_id, U.ben]), true);
await expect('cris no puede valorar', ()=>as(U.cris, `insert into ratings (call_id, ratee, score) values ($1,$2,1)`, [call.call_id, U.ben]), true);
await expect('ben valora a ana', ()=>as(U.ben, `insert into ratings (call_id, ratee, score) values ($1,$2,4)`, [call.call_id, U.ana]));
await expect('autovaloración', ()=>as(U.ben, `insert into ratings (call_id, ratee, score) values ($1,$2,5)`, [call.call_id, U.ben]), true);
await expect('ben no ve quién le valoró', async()=>{ const r = await rows(U.ben, `select * from ratings where ratee=$1`, [U.ben]).catch(()=>[]); if (r.length) throw new Error('ve ratings'); });
await expect('tarjeta respeto', async()=>{ const r = await rows(U.cris, `select alias, age, respect_score, respect_count, connections from profile_cards where id=$1`, [U.ben]); console.log('   card', JSON.stringify(r[0])); if (Number(r[0].respect_score)!==5) throw new Error('score'); });
await expect('my_calls', async()=>{ const r = await rows(U.ana, `select * from my_calls()`); if (r[0].can_rate!==false || r[0].seconds!==300) throw new Error(JSON.stringify(r)); });

// chat
await expect('chat tras conectar', ()=>as(U.ana, `insert into messages (recipient, kind, body) values ($1,'text','hola ben')`, [U.ben]));
await expect('cris no puede escribir a ana', ()=>as(U.cris, `insert into messages (recipient, kind, body) values ($1,'text','hey')`, [U.ana]), true);
await expect('media con ruta ajena', ()=>as(U.ana, `insert into messages (recipient, kind, media_path) values ($1,'image',$2)`, [U.ben, U.ben+'/x.jpg']), true);
const mm = await expect('foto efímera', ()=>as(U.ana, `insert into messages (recipient, kind, media_path) values ($1,'image',$2) returning id`, [U.ben, U.ana+'/f1.jpg']));
const mid = mm.rows[0].id;
await db.query(`insert into storage.objects (bucket_id, name, owner) values ('chat-media',$1,$2)`, [U.ana+'/f1.jpg', U.ana]);
await expect('ben no puede leer antes de abrir', async()=>{ const r = await rows(U.ben, `select name from storage.objects where bucket_id='chat-media'`); if (r.length) throw new Error('lee'); });
await expect('ana no puede abrir su propia foto', ()=>as(U.ana, `select open_media($1)`, [mid]), true);
await expect('ben abre', ()=>as(U.ben, `select open_media($1)`, [mid]));
await expect('ben puede leer tras abrir', async()=>{ const r = await rows(U.ben, `select name from storage.objects where bucket_id='chat-media'`); if (r.length!==1) throw new Error('no lee'); });
await expect('ben abre por segunda vez', ()=>as(U.ben, `select open_media($1)`, [mid]), true);
await expect('ben borra el archivo', async()=>{ const r = await as(U.ben, `delete from storage.objects where bucket_id='chat-media' returning name`); if (r.rows.length!==1) throw new Error('no borra'); });
await expect('ben no puede falsear viewed_at', ()=>as(U.ben, `update messages set viewed_at=null where id=$1`, [mid]), true);
await expect('conversaciones', async()=>{ const r = await rows(U.ben, `select alias, last_kind, unread from my_conversations()`); console.log('   convs', JSON.stringify(r)); if (r.length!==1) throw new Error('n'); });

// fotos
await expect('foto pública', ()=>as(U.ana, `insert into photos (path, is_private) values ($1,false)`, [U.ana+'/public/a.jpg']));
await expect('foto privada', ()=>as(U.ana, `insert into photos (path, is_private) values ($1,true)`, [U.ana+'/private/b.jpg']));
await expect('foto privada en carpeta pública', ()=>as(U.ana, `insert into photos (path, is_private) values ($1,true)`, [U.ana+'/public/c.jpg']), true);
await db.query(`insert into storage.objects (bucket_id, name) values ('photos',$1),('photos',$2)`, [U.ana+'/public/a.jpg', U.ana+'/private/b.jpg']);
await expect('cris ve solo la pública', async()=>{ const r = await rows(U.cris, `select name from storage.objects where bucket_id='photos'`); if (r.length!==1) throw new Error(JSON.stringify(r)); });
await expect('cris aprueba por sí misma', ()=>as(U.cris, `insert into photo_access (owner, viewer, status) values ($1,$2,'approved')`, [U.ana, U.cris]), true);
await expect('cris solicita', ()=>as(U.cris, `insert into photo_access (owner, viewer) values ($1,$2)`, [U.ana, U.cris]));
await expect('cris se autoaprueba (update)', async()=>{ const r = await as(U.cris, `update photo_access set status='approved' where viewer=$1 returning *`, [U.cris]); if (r.rows.length) throw new Error('pudo'); });
await expect('ana aprueba', ()=>as(U.ana, `update photo_access set status='approved', decided_at=now() where owner=$1 and viewer=$2`, [U.ana, U.cris]));
await expect('cris ve la privada', async()=>{ const r = await rows(U.cris, `select name from storage.objects where bucket_id='photos'`); if (r.length!==2) throw new Error(JSON.stringify(r)); });
await expect('ana revoca', ()=>as(U.ana, `delete from photo_access where owner=$1 and viewer=$2`, [U.ana, U.cris]));
await expect('cris ya no ve la privada', async()=>{ const r = await rows(U.cris, `select name from storage.objects where bucket_id='photos'`); if (r.length!==1) throw new Error(JSON.stringify(r)); });

// invitaciones y bloqueo
const inv = await expect('ana invita a ben', ()=>as(U.ana, `select invite_call($1,'voice','peer-ana2') as id`, [U.ben]));
await expect('ana no puede invitar a cris', ()=>as(U.ana, `select invite_call($1,'voice','x')`, [U.cris]), true);
await expect('ben acepta', async()=>{ const r = await rows(U.ben, `select answer_invite($1,true) as r`, [inv.rows[0].id]); if (r[0].r.peer_id!=='peer-ana2') throw new Error(JSON.stringify(r)); });
await expect('ben bloquea a ana', ()=>as(U.ben, `insert into blocks (blocker, blocked) values ($1,$2)`, [U.ben, U.ana]));
await expect('ana no puede escribir a ben', ()=>as(U.ana, `insert into messages (recipient, kind, body) values ($1,'text','?')`, [U.ben]), true);
await expect('denuncia', ()=>as(U.ben, `insert into reports (reported, reason) values ($1,'Acoso')`, [U.ana]));
await expect('anon no ve perfiles', async()=>{ await db.exec(`set role anon`); try { await db.query('select * from profiles'); throw new Error('ve'); } catch(e){ if(e.message==='ve') throw e; } finally { await db.exec('reset role'); } });
await expect('borrar cuenta', ()=>as(U.cris, `select delete_my_account()`));
await expect('cris borrada', async()=>{ const r = await db.query(`select count(*)::int n from profiles where id=$1`, [U.cris]); if (r.rows[0].n) throw new Error('sigue'); });
console.log(`\n${ok} OK, ${fail} FALLOS`); if (fail) process.exit(1);
