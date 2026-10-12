import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.ts';
import { prepareImport, importStaging } from '../scripts/import-staging.mjs';

// Synthetic fixtures only. No private family history or Airtable exports are committed.
const rid=(n:number)=>'rec'+String(n).padStart(14,'0');
const scenarios=[
  {n:1,table:'Research Results',kind:'Discovery',status:'Verified',qc:'Approved',proposed:'IMAGE READ',final:'IMAGE READ'},
  {n:2,table:'Research Results',kind:'Discovery',status:'Unverified',qc:'Pending',proposed:'IMAGE READ',final:null},
  {n:3,table:'Research Results',kind:null,status:'Rejected',qc:'Rejected',proposed:'EXCLUDED',final:'EXCLUDED'},
  {n:4,table:'Activity Log',kind:null,status:'Heartbeat',qc:'READ',proposed:null,final:null},
  {n:5,table:'QC Reviews',kind:null,status:'Approve',qc:'Approve',proposed:null,final:null},
  {n:6,table:'Activity Log',kind:null,status:'Event',qc:'CORRECTION',proposed:null,final:null},
  {n:7,table:'Research Results',kind:null,status:'Verified',qc:'Approved',proposed:'EXCLUDED',final:'EXCLUDED'},
  {n:8,table:'Research Results',kind:'Discovery',status:'Verified',qc:'Downgraded',proposed:'IMAGE READ',final:'FAMILY TESTIMONY'},
  {n:9,table:'Research Results',kind:'Discovery',status:'Verified',qc:'Approved',proposed:'CONFIRMED',final:'IMAGE READ'},
  {n:10,table:'Research Results',kind:'Discovery',status:'Verified',qc:'Approved',proposed:'CONFIRMED',final:'CONFIRMED'}
] as const;
function packet(){
  const tables:Record<string,{record_count:number;records:any[]}>= {};
  const objects:any[]=[];
  for(const t of scenarios){
    const source={id:rid(t.n),fields:{'Result ID':'TEST-'+t.n,'Claim':'TEST ONLY '+t.n,'QC Status':{name:t.qc},'Proposed Tier':t.proposed?{name:t.proposed}:undefined}};
    if(!tables[t.table])tables[t.table]={record_count:0,records:[]};
    tables[t.table].records.push(source);tables[t.table].record_count++;
    objects.push({original_record_id:rid(t.n),original_key:'TEST-'+t.n,original_table:t.table,
      app_kind:t.kind,app_status:t.status,title:'TEST ONLY case '+t.n,summary:'Synthetic example',
      original_status_fields:{'QC Status':t.qc,'Proposed Tier':t.proposed},
      final_tier:t.final,final_tier_source:t.final?'latest-qc-review':'no-qc-review',linked_record_ids:[]});
  }
  return {exportData:{tables},crosswalk:{crosswalk_meta:{version:'v3',total_objects:10},objects},
    inventoryText:'name,location,drive_id,size_bytes,over_25mb,sha256,notes\n'};
}
test('v3: all ten synthetic staging categories map conservatively',()=>{
  const p=packet(),plan=prepareImport(p.exportData,p.crosswalk,p.inventoryText);
  assert.equal(plan.total,10);
  assert.equal(plan.mapped.length,5);
  assert.equal(plan.unmapped,5);
  assert.equal(plan.skippedHeartbeats,1);
  assert.ok(plan.mapped.every(x=>x.item.app_kind==='Discovery'));
  assert.ok(plan.preserved.filter(x=>x.item.app_kind===null).every(x=>x.appId===null));
});
test('v3: operational entries and excluded records cannot acquire display kinds',()=>{
  const p=packet();
  for(const n of [3,4,6,7]){
    const changed=structuredClone(p.crosswalk);
    changed.objects[n-1].app_kind='Discovery';
    assert.throws(()=>prepareImport(p.exportData,changed,p.inventoryText),/audit-only/);
  }
});
test('v3: final tiers are traceable; all imported claims remain unverified',()=>{
  const p=packet(),dir=mkdtempSync(join(tmpdir(),'v3-acceptance-'));
  try{
    const args={dataDir:dir,exportText:JSON.stringify(p.exportData),
      crosswalkText:JSON.stringify(p.crosswalk),inventoryText:p.inventoryText};
    const dry=importStaging({...args,dryRun:true});
    assert.equal(dry.airtableRecords,10);
    assert.equal(dry.appRecords,5);
    const imported=importStaging(args);
    assert.equal(imported.createdAppRecords,5);
    const db=new Store(join(dir,'archive.sqlite'));
    try{
      assert.equal(db.db.prepare('SELECT COUNT(*) n FROM external_rows').get().n,10);
      for(const n of [3,4,5,6,7]){
        assert.equal(db.db.prepare('SELECT app_record_id FROM external_rows WHERE source_id=?').get(rid(n)).app_record_id,null);
      }
      for(const n of [1,2,8,9,10]){
        assert.equal(db.get('airtable:'+rid(n)).status,'Unverified');
      }
      assert.match(db.get('airtable:'+rid(8)).body,/Final evidence tier: FAMILY TESTIMONY/);
      assert.match(db.get('airtable:'+rid(9)).body,/Proposed evidence tier: CONFIRMED/);
      assert.match(db.get('airtable:'+rid(9)).body,/Final evidence tier: IMAGE READ/);
      assert.match(db.get('airtable:'+rid(2)).body,/Final evidence tier: UNESTABLISHED/);
      assert.match(db.get('airtable:'+rid(10)).body,/Final evidence tier: CONFIRMED/);
      assert.doesNotMatch(db.export('chapters'),/Synthetic example/);
    }finally{db.db.close();}
    assert.equal(importStaging(args).createdAppRecords,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
