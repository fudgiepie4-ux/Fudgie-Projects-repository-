import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.ts';
import { importStaging, parseCsv } from '../scripts/import-staging.mjs';

const rid=n=>'rec'+String(n).padStart(14,'0');
const testPacket=()=>{
  const tables={People:{record_count:1,records:[{id:rid(1),createdTime:'2026-01-01T00:00:00Z',fields:{'Full Name':'TEST ONLY ancestor','Status':'Active'}}]},
    'MDS Assignments':{record_count:1,records:[{id:rid(2),fields:{'MDS ID':'MDS-TEST','Status':'Completed'}}]},
    'QC Reviews':{record_count:1,records:[{id:rid(3),fields:{Decision:'Approve','Final Tier':'INDEX ONLY'}}]},
    'Activity Log':{record_count:2,records:[{id:rid(4),fields:{'Action Type':'READ'}},{id:rid(5),fields:{'Action Type':'DISCOVERY'}}]}};
  const objects=[{original_table:'People',original_record_id:rid(1),app_kind:'Ancestor',app_status:'Active',title:'TEST ONLY ancestor',linked_record_ids:[rid(3)],summary:'TEST ONLY',original_status_fields:{Status:'Active'}},
    {original_table:'MDS Assignments',original_record_id:rid(2),app_kind:'MissionWork',app_status:'Done',title:'TEST ONLY mission',linked_record_ids:[]},
    {original_table:'QC Reviews',original_record_id:rid(3),app_kind:null,app_status:'Approve',title:'QC TEST ONLY',linked_record_ids:[rid(1)]},
    {original_table:'Activity Log',original_record_id:rid(4),app_kind:'Timeline',app_status:'Heartbeat',title:'TEST heartbeat',linked_record_ids:[]},
    {original_table:'Activity Log',original_record_id:rid(5),app_kind:'Timeline',app_status:'Event',title:'TEST event',linked_record_ids:[]}];
  return {exportText:JSON.stringify({tables}),crosswalkText:JSON.stringify({crosswalk_meta:{total_objects:5},objects}),inventoryText:'name,location,drive_id,size_bytes,over_25mb,sha256,notes\r\n"test, source.pdf",Drive,id123,30000000,YES,,"notes, here"\r\n'};
};

test('CSV honors quoted columns',()=>{assert.deepEqual(parseCsv(testPacket().inventoryText)[0],{name:'test, source.pdf',location:'Drive',drive_id:'id123',size_bytes:'30000000',over_25mb:'YES',sha256:'',notes:'notes, here'});});

test('Lossless staging import is idempotent, keeps QC distinct, and does not auto-confirm',()=>{
  const dir=mkdtempSync(join(tmpdir(),'fudgie-import-'));
  try{
    const packet=testPacket(),dry=importStaging({dataDir:dir,...packet,dryRun:true});
    assert.equal(dry.airtableRecords,5);assert.equal(dry.appRecords,3);assert.equal(dry.preservedOnly,2);assert.equal(dry.over25MB,1);
    const first=importStaging({dataDir:dir,...packet});assert.equal(first.createdAppRecords,3);assert.equal(first.createdRawRecords,5);
    const db=new Store(join(dir,'archive.sqlite'));
    try{
      assert.equal(db.snapshot().records.length,3);
      assert.equal(db.snapshot().links.length,0); // Airtable relationships are NOT automatically evidence.
      assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM external_rows').get().n,5);
      assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM external_edges').get().n,2);
      assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM import_payloads').get().n,3);
      assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM external_inventory').get().n,1);
      const ancestor=db.get('airtable:'+rid(1));assert.equal(ancestor.status,'Unverified');assert.equal(ancestor.book_approved,0);
      const mission=db.get('airtable:'+rid(2));assert.equal(mission.kind,'Assignment');assert.equal(mission.progress,'Completed');assert.equal(mission.status,'Unverified');
      assert.doesNotMatch(db.export('chapters'),/TEST ONLY ancestor/);
      assert.equal(db.db.prepare('SELECT app_record_id FROM external_rows WHERE source_id=?').get(rid(3)).app_record_id,null);
      assert.equal(db.db.prepare('SELECT app_record_id FROM external_rows WHERE source_id=?').get(rid(4)).app_record_id,null);
    }finally{db.db.close();}
    const second=importStaging({dataDir:dir,...packet});assert.equal(second.createdAppRecords,0);assert.equal(second.createdRawRecords,0);
    assert.throws(()=>importStaging({dataDir:dir,...packet,crosswalkText:packet.crosswalkText.replace('TEST ONLY ancestor','changed ancestor')}),/Changed input/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});