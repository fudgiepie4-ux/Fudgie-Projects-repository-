/** Import Muse's existing Airtable handoff into the local FudgiePie SQLite archive.
 * No source documents are modified, downloaded, or uploaded by this importer.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Store } from '../src/store.ts';

const allowedKinds = new Set(['Ancestor','Relationship','Biography','Timeline','Discovery','Source','Chapter','Assignment','Question','Audit','Handoff','Approval','Investigation']);
const hash = value => createHash('sha256').update(value).digest('hex');
const assert = (ok, message) => { if (!ok) throw new Error(message); };

/** RFC 4180-style CSV parser: handles quoted commas, escaped quotes, and line breaks. */
export function parseCsv(input) {
  const rows=[]; let row=[], field='', quote=false;
  for(let i=0;i<input.length;i++) {
    const c=input[i];
    if(quote) { if(c==='"'&&input[i+1]==='"'){field+='"';i++;} else if(c==='"'){quote=false;} else field+=c; }
    else if(c==='"'){assert(field.length===0,'Malformed CSV quote');quote=true;}
    else if(c===','){row.push(field);field='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.length))rows.push(row);row=[];field='';}
    else field+=c;
  }
  assert(!quote,'Unterminated CSV quote');
  if(field.length||row.length){row.push(field);rows.push(row);}
  const headers=rows.shift()||[];
  assert(headers.includes('name')&&headers.includes('drive_id')&&headers.includes('over_25mb'),'Wrong inventory CSV headers');
  return rows.map((values,i)=>{assert(values.length===headers.length,`Malformed CSV row ${i+2}`);return Object.fromEntries(headers.map((head,j)=>[head,values[j]]));});
}

/** Verify full export/crosswalk coverage before any database writes. */
export function prepareImport(exportData,crosswalk,inventoryText,{includeHeartbeats=false}={}) {
  assert(exportData&&exportData.tables&&typeof exportData.tables==='object','Missing Airtable tables');
  assert(crosswalk&&Array.isArray(crosswalk.objects),'Missing crosswalk objects');
  const rows=new Map(), tableCounts={};
  for(const [table,entry] of Object.entries(exportData.tables)) {
    assert(entry&&Array.isArray(entry.records),'Missing table records: '+table);
    assert(entry.record_count===entry.records.length,'Table count mismatch: '+table);
    tableCounts[table]=entry.records.length;
    for(const row of entry.records) {
      assert(typeof row.id==='string'&&/^rec[A-Za-z0-9]{14}$/.test(row.id),'Invalid Airtable ID in '+table);
      assert(!rows.has(row.id),'Duplicate Airtable record ID '+row.id);
      rows.set(row.id,{...row,original_table:table});
    }
  }
  assert(rows.size===crosswalk.objects.length,'Crosswalk/export row count mismatch');
  assert(crosswalk.crosswalk_meta?.total_objects===rows.size,'Crosswalk declared count mismatch');
  const seen=new Set(), mapped=[], preserved=[], edges=[];
  for(const item of crosswalk.objects) {
    const id=item.original_record_id, source=rows.get(id);
    assert(source,'Crosswalk points to missing Airtable record '+id);
    assert(source.original_table===item.original_table,'Crosswalk table mismatch for '+id);
    assert(!seen.has(id),'Duplicate crosswalk record '+id);seen.add(id);
    const kind=item.app_kind==='MissionWork'?'Assignment':item.app_kind;
    const heartbeat=item.original_table==='Activity Log'&&item.app_status==='Heartbeat';
    const operational=item.original_table==='Activity Log';
    const qc=text(source.fields?.['QC Status']);
    const excluded=item.final_tier==='EXCLUDED'||text(source.fields?.['Proposed Tier'])==='EXCLUDED'||item.app_status==='Rejected'||qc==='Rejected';
    assert(!operational||kind===null,'Activity Log must be audit-only: '+id);
    assert(!excluded||kind===null,'Rejected/EXCLUDED records must be audit-only: '+id);
    if(kind!==null)assert(allowedKinds.has(kind),'Unsupported app kind '+kind+' for '+id);
    const appId=kind?'airtable:'+id:null;
    if(appId)mapped.push({id:appId,kind,item,source});
    preserved.push({id,table:source.original_table,source,item,appId});
    for(const target of item.linked_record_ids||[]) {
      assert(typeof target==='string','Invalid linked record for '+id);
      edges.push([id,target]); // Raw Airtable references are NOT automatically evidence citations.
    }
  }
  const inventory=parseCsv(inventoryText);
  return {mapped,preserved,edges,inventory,tableCounts,total:rows.size,
    unmapped:preserved.filter(x=>!x.appId).length,
    skippedHeartbeats:preserved.filter(x=>x.item.original_table==='Activity Log'&&x.item.app_status==='Heartbeat'&&!x.appId).length,
    overLimitFiles:inventory.filter(x=>x.over_25mb==='YES').length};
}

function text(value){if(typeof value==='string')return value;if(value&&typeof value==='object'&&typeof value.name==='string')return value.name;return '';}
function appRecord(row){
  const {id,kind,item,source}=row;
  const title=(text(item.title)||text(item.original_key)||id).slice(0,300);
  const qc=item.original_status_fields??{};
  const proposedTier=text(qc['Proposed Tier'])||text(source.fields?.['Proposed Tier'])||'UNESTABLISHED';
  const finalTier=text(item.final_tier)||'UNESTABLISHED';
  const tierDescription=finalTier==='ACCESS GAP'?'ACCESS GAP (source-access condition, not an evidence strength)':finalTier;
  const reviewContext=kind==='Discovery'?`Staging evidence metadata (NOT an app verification):\nProposed evidence tier: ${proposedTier}\nFinal evidence tier: ${tierDescription}\nFinal tier source: ${text(item.final_tier_source)||'unknown'}\nOriginal QC decision: ${text(qc['QC Status'])||text(source.fields?.['QC Status'])||'none'}\n\n`:'';
  const full=`${text(item.summary)}\n\n${reviewContext}Original Airtable fields:\n${JSON.stringify(source.fields??{},null,2)}`;
  // A full, byte-exact copy of the export is kept separately in import_payloads.
  const body=full.length<=100000?full:full.slice(0,99950)+'\n[See preserved original export for remaining fields]';
  const fields=source.fields??{};
  const date=['Record Date','Submitted At CT','Timestamp CT','Issued At CT','Birth'].map(k=>text(fields[k])).find(Boolean)||'';
  const owner=['Issued To','Researcher','Actor'].map(k=>text(fields[k])).find(Boolean)||'';
  const progress=kind==='Assignment'&&['Done','Completed'].includes(item.app_status)?'Completed':kind==='Assignment'&&item.app_status==='InProgress'?'In progress':'Open';
  return [id,kind,title,body,date.slice(0,50),owner.slice(0,200),progress];
}

/** Transactional, repeatable import; QC stays separate and app verification stays Unverified. */
export function importStaging({dataDir,exportText,crosswalkText,inventoryText,dryRun=false,includeHeartbeats=false}) {
  const planned=prepareImport(JSON.parse(exportText),JSON.parse(crosswalkText),inventoryText,{includeHeartbeats});
  const totals={airtableRecords:planned.total,appRecords:planned.mapped.length,preservedOnly:planned.unmapped,heartbeatsPreservedOnly:planned.skippedHeartbeats,rawRelationships:planned.edges.length,sourceInventory:planned.inventory.length,over25MB:planned.overLimitFiles,tableCounts:planned.tableCounts};
  if(dryRun)return {mode:'dry-run',...totals};
  assert(typeof dataDir==='string'&&dataDir.length>0,'Missing DATA_DIR');
  mkdirSync(resolve(dataDir),{recursive:true});
  const store=new Store(resolve(dataDir,'archive.sqlite'));
  try {
    return store.transaction(()=>{
      const db=store.db;
      db.exec(`CREATE TABLE IF NOT EXISTS import_payloads(filename TEXT PRIMARY KEY,sha256 TEXT NOT NULL,bytes INTEGER NOT NULL,content TEXT NOT NULL,imported_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS external_rows(source_id TEXT PRIMARY KEY,table_name TEXT NOT NULL,record_json TEXT NOT NULL,crosswalk_json TEXT NOT NULL,app_record_id TEXT,FOREIGN KEY(app_record_id) REFERENCES records(id));
      CREATE TABLE IF NOT EXISTS external_edges(from_source_id TEXT NOT NULL,to_source_id TEXT NOT NULL,PRIMARY KEY(from_source_id,to_source_id),FOREIGN KEY(from_source_id) REFERENCES external_rows(source_id));
      CREATE TABLE IF NOT EXISTS external_inventory(row_number INTEGER PRIMARY KEY,entry_json TEXT NOT NULL);`);
      const now=new Date().toISOString();
      for(const [filename,content] of [['AIRTABLE_EXPORT.json',exportText],['IMPORT_CROSSWALK.json',crosswalkText],['SOURCE_INVENTORY.csv',inventoryText]]) {
        const old=db.prepare('SELECT sha256 FROM import_payloads WHERE filename=?').get(filename),digest=hash(content);
        assert(!old||old.sha256===digest,'Changed input for '+filename+' — reconcile instead of overwriting');
        if(!old)db.prepare('INSERT INTO import_payloads VALUES(?,?,?,?,?)').run(filename,digest,Buffer.byteLength(content),content,now);
      }
      const recordSQL=db.prepare(`INSERT INTO records(id,kind,title,body,date,owner,progress,status,book_approved,created,updated) VALUES(?,?,?,?,?,?,?,'Unverified',0,?,?)`);
      let added=0,unchanged=0,rawAdded=0;
      for(const item of planned.mapped){
        const prior=db.prepare('SELECT id FROM records WHERE id=?').get(item.id);
        if(prior){unchanged++;continue;}
        recordSQL.run(...appRecord(item),now,now);
        db.prepare('INSERT INTO revisions(id,record_id,snapshot,action,actor,created) VALUES(?,?,?,?,?,?)').run('import-revision:'+item.id,item.id,JSON.stringify(db.prepare('SELECT * FROM records WHERE id=?').get(item.id)),'Imported from Airtable staging; QC retained separately','Staging importer',now);
        added++;
      }
      const ext=db.prepare('INSERT INTO external_rows(source_id,table_name,record_json,crosswalk_json,app_record_id) VALUES(?,?,?,?,?)');
      const extGet=db.prepare('SELECT record_json,crosswalk_json,app_record_id FROM external_rows WHERE source_id=?');
      for(const entry of planned.preserved){
        const recordJson=JSON.stringify(entry.source),crosswalkJson=JSON.stringify(entry.item);
        const old=extGet.get(entry.id);
        if(old){assert(old.record_json===recordJson&&old.crosswalk_json===crosswalkJson&&old.app_record_id===entry.appId,'Changed source record '+entry.id+' — reconcile before reimport');continue;}
        ext.run(entry.id,entry.table,recordJson,crosswalkJson,entry.appId);rawAdded++;
      }
      const link=db.prepare('INSERT OR IGNORE INTO external_edges(from_source_id,to_source_id) VALUES(?,?)');
      for(const [from,to] of planned.edges)link.run(from,to);
      for(let i=0;i<planned.inventory.length;i++){
        const value=JSON.stringify(planned.inventory[i]);
        const old=db.prepare('SELECT entry_json FROM external_inventory WHERE row_number=?').get(i+1);
        assert(!old||old.entry_json===value,'Changed inventory at row '+(i+1));
        if(!old)db.prepare('INSERT INTO external_inventory VALUES(?,?)').run(i+1,value);
      }
      return {mode:'import',...totals,createdAppRecords:added,existingAppRecords:unchanged,createdRawRecords:rawAdded};
    });
  }finally{store.db.close();}
}

const invokedAsScript=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invokedAsScript){
  try{
    const args=process.argv.slice(2).filter(x=>!x.startsWith('--'));
    if(args.length!==4)throw new Error('Usage: node scripts/import-staging.mjs DATA_DIR AIRTABLE_EXPORT.json IMPORT_CROSSWALK.json SOURCE_INVENTORY.csv [--dry-run]');
    const [dataDir,exportPath,crosswalkPath,inventoryPath]=args;
    const result=importStaging({dataDir,exportText:readFileSync(exportPath,'utf8'),crosswalkText:readFileSync(crosswalkPath,'utf8'),inventoryText:readFileSync(inventoryPath,'utf8'),dryRun:process.argv.includes('--dry-run')});
    console.log(JSON.stringify(result,null,2));
  }catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
}