const fs=require('fs');
const firebase=require('firebase/compat/app');require('firebase/compat/firestore');
const assert=require('assert');
const FAM=fs.readFileSync('/tmp/fam/family.html','utf8');
const DAF=fs.readFileSync('/tmp/fam/index.src.html','utf8').replace(/\r\n/g,'\n');
const norm=t=>t.split('\n').map(l=>l.trim()).join('\n');
function between(src,a,b){const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('extract '+a);return src.slice(i,j+b.length);}
const famBlock=between(FAM,'/*FAMILY_OPS_START*/','/*FAMILY_OPS_END*/');
const dafBlock=between(DAF,'/*FAMILY_OPS_START*/','/*FAMILY_OPS_END*/');
assert.strictEqual(norm(famBlock),norm(dafBlock),'ops block differs between apps');
const dafImport=between(DAF,'const FAMILY_HANY_CATEGORIES','return { adds, reqs, edits, undos, closedSkips, text: parts.join(" · ") };\n      };');
// Family helpers
const famHelpers=between(FAM,'var FAMILY_VIEW_PATH','function famStartOpsListener(){')
 .replace(/function famStartOpsListener\(\)\{$/,'');
const famChecks=between(FAM,'/* فحوصات محلية','function initFirebaseAuth(){').replace(/function initFirebaseAuth\(\)\{$/,'');
function fnSrc(src,name){const i=src.indexOf('function '+name+'(');let j=src.indexOf('{',i),d=0,k=j;for(;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)break;}}return src.slice(i,k+1);}
const parseSrc=['isActiveTx','getTxDate','parseTransactions'].map(n=>fnSrc(FAM,n)).join('\n');

firebase.initializeApp({projectId:'demo-test',apiKey:'x'});
const db=firebase.firestore();db.settings({host:'127.0.0.1:8085',ssl:false});
const main=JSON.parse(fs.readFileSync('/tmp/emu/main_copy.json','utf8'));
const MAINREF=()=>db.collection('finance_2026').doc('user_ahmed_data');
const FIREBASE_DOC_PATH={collection:'finance_2026',doc:'user_ahmed_data'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Daftari instance factory (module-level state per instance)
function mkDaftari(){return new Function('db','FIREBASE_DOC_PATH',blockWrap(famBlock)+'\n'+dafImport+'\nreturn {famApplyOp,famSortOps,famBuildView,runFamilyImport,famImportSummary,scheduleFamilyViewPublish,getHash:()=>famViewLastHash};')(db,FIREBASE_DOC_PATH);}
function blockWrap(b){return b;}
// Family instance factory (a "tab")
function mkFamily(user,closedMonths){
 const src=famBlock+'\n'+`
 var FAMILY_VIEW_PATH={collection:'finance_2026',doc:'family_view'};
 var famOps=[], lastViewData=null;
 function famOpsCol(){return db.collection('family_ops');}
 function famSendOp(op){op.applied=false;op.ts=Date.now();op.by=currentUser.id;op.byName=currentUser.name;
  return famOpsCol().doc(op.opId).set(op).then(function(){return op;});}
 function famEffective(d){lastViewData=d;var gen=Number(d.generatedAt||0);
  var ops=famSortOps(famOps.filter(function(o){return !o.applied||Number(o.appliedAt||0)>=gen;}));
  var cur=d;ops.forEach(function(o){cur=famApplyOp(cur,o).d;});return cur;}
 `+famChecks+`
 var CATEGORY_NAME='مسحوبات محل هاني';var CANCELLED_STATUSES=['cancelled','canceled','deleted','rejected','void','voided','archived','refunded','reversed','declined','removed','inactive'];
 function isMonthClosed(iso){return false;}
 `+parseSrc+`
 return {famSendOp,famEffective,famSaveCheck,famDelReqCheck,famEditSend,famFlushCheck,parseTransactions,setOps:o=>{famOps=o},getView:()=>lastViewData,famEff};`;
 const api=new Function('db','currentUser',src)(db,user);
 return api;
}
const mkTx=(id,amt,who,extra={})=>Object.assign({id,type:'expense',category:'مسحوبات محل هاني',subCategory:'سناكس',amount:amt,description:'بسكويت',method:'hany_tab',date:'2026-11-27',month:'نوفمبر',year:2026,monthIndex:10,subType:'withdrawal',status:'pending',source:'family-app',createdBy:who.id,createdByName:who.name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},extra);
const ANS={id:'ans',name:'أنس'},ABD={id:'abdelrahman',name:'عبد الرحمن'};
let pass=0;const T=async(name,fn)=>{try{await fn();pass++;console.log('PASS',name);}catch(e){console.log('FAIL',name,e.message);process.exitCode=1;}};
async function reset(){
 for(const col of ['family_ops']){const s=await db.collection(col).get();for(const d of s.docs)await d.ref.delete();}
 await db.collection('finance_2026').doc('family_view').delete();
 await MAINREF().set(JSON.parse(JSON.stringify(main)));
}
const mainTx=async()=>(await MAINREF().get()).data().transactions;
const opsAll=async()=>(await db.collection('family_ops').get()).docs.map(d=>({opId:d.id,...d.data()}));

(async()=>{
 const base=main.transactions.length;
 await T('ops blocks identical in both apps',()=>{});
 await T('S1 Family adds 3 (Daftari closed), then Daftari opens: all 3 imported once; rerun adds nothing',async()=>{
  await reset();const fam=mkFamily(ANS);fam.famEffective({transactions:main.transactions.filter(t=>t.source==='family-app'),deleteRequests:[],deletedTxIds:main.deletedTxIds,closedMonths:[]});
  const txs=[mkTx('t-s1a',10,ANS),mkTx('t-s1b',25,ANS),mkTx('t-s1c',5,ABD)];
  for(const t of txs){await fam.famSaveCheck(t,'بسكويت');}
  assert.strictEqual((await mainTx()).length,base,'main must not change before import');
  const D=mkDaftari();let notified=null;await D.runFamilyImport(r=>notified=D.famImportSummary(r));
  const after=await mainTx();assert.strictEqual(after.length,base+3);assert.strictEqual(notified.adds,3);
  await D.runFamilyImport(()=>{});await mkDaftari().runFamilyImport(()=>{});
  assert.strictEqual((await mainTx()).length,base+3,'no duplicates on re-run');
  assert((await opsAll()).every(o=>o.applied===true));
  console.log('   notice text:','تم استيراد '+notified.text+' من تطبيق العيلة');
 });
 await T('S2 delete request imported, pending, once; second request for same tx refused',async()=>{
  const fam=mkFamily(ANS);const view={transactions:[mkTx('t-s1a',10,ANS)],deleteRequests:[],deletedTxIds:[],closedMonths:[]};fam.famEffective(view);
  const rq={id:'delreq-1',txId:'t-s1a',txSnapshot:mkTx('t-s1a',10,ANS),reason:'غلط',requestedBy:'ans',requestedByName:'أنس',requestedAt:Date.now(),status:'pending'};
  await fam.famDelReqCheck({id:'t-s1a'},rq);
  const D=mkDaftari();await D.runFamilyImport(()=>{});await D.runFamilyImport(()=>{});
  const reqs=(await MAINREF().get()).data().deleteRequests;assert.strictEqual(reqs.filter(r=>r.id==='delreq-1').length,1);
  fam.setOps(await opsAll());
  await assert.rejects(()=>fam.famDelReqCheck({id:'t-s1a'},{...rq,id:'delreq-2'}),/ALREADY_REQUESTED/);
 });
 await T('S3 add then undo (both before import) nets zero + tombstone; undo after import removes',async()=>{
  await reset();const fam=mkFamily(ANS);fam.famEffective({transactions:[],deleteRequests:[],deletedTxIds:[],closedMonths:[]});
  const t1=mkTx('t-s3a',7,ANS),t2=mkTx('t-s3b',8,ANS);
  await fam.famSaveCheck(t1,'بسكويت');await fam.famSendOp({opId:'undo-t-s3a',type:'undo',txId:'t-s3a'});
  await sleep(5);await fam.famSaveCheck(t2,'بسكويت');
  const D=mkDaftari();await D.runFamilyImport(()=>{});
  let m=(await MAINREF().get()).data();assert(!m.transactions.some(t=>t.id==='t-s3a'));assert(m.transactions.some(t=>t.id==='t-s3b'));assert(m.deletedTxIds.includes('t-s3a'));
  await fam.famSendOp({opId:'undo-t-s3b',type:'undo',txId:'t-s3b'});await D.runFamilyImport(()=>{});
  m=(await MAINREF().get()).data();assert(!m.transactions.some(t=>t.id==='t-s3b'));assert.strictEqual(m.transactions.length,base);
 });
 await T('S3b undo op arriving BEFORE its add (order flip) never resurrects the entry',async()=>{
  await reset();const D=mkDaftari();
  const fam=mkFamily(ANS);fam.famEffective({transactions:[],deleteRequests:[],deletedTxIds:[],closedMonths:[]});
  await fam.famSendOp({opId:'undo-t-flip',type:'undo',txId:'t-flip'});await D.runFamilyImport(()=>{});
  await fam.famSendOp({opId:'add-t-flip',type:'add',tx:mkTx('t-flip',9,ANS)});await D.runFamilyImport(()=>{});
  assert(!(await mainTx()).some(t=>t.id==='t-flip'));
 });
 await T('S4 Daftari OPEN while Family adds: picked up live without restart',async()=>{
  await reset();const D=mkDaftari();let got=0;
  const unsub=db.collection('family_ops').where('applied','==',false).onSnapshot(()=>{D.runFamilyImport(r=>{got+=D.famImportSummary(r).adds;});});
  await sleep(500);const fam=mkFamily(ANS);fam.famEffective({transactions:[],deleteRequests:[],deletedTxIds:[],closedMonths:[]});
  await fam.famSaveCheck(mkTx('t-live1',11,ANS),'بسكويت');await sleep(1500);
  await fam.famSaveCheck(mkTx('t-live2',12,ANS),'بسكويت');await sleep(1500);
  unsub();assert.strictEqual(got,2);assert.strictEqual((await mainTx()).length,base+2);
 });
 await T('S5 two tabs: same op sent twice (double tap) = 1 entry; two Daftari windows importing at once = no duplicates, none lost',async()=>{
  await reset();const f1=mkFamily(ANS),f2=mkFamily(ANS);const empty={transactions:[],deleteRequests:[],deletedTxIds:[],closedMonths:[]};f1.famEffective(empty);f2.famEffective(empty);
  const t=mkTx('t-dbl',3,ANS);
  await Promise.all([f1.famSendOp({opId:'add-t-dbl',type:'add',tx:t}),f2.famSendOp({opId:'add-t-dbl',type:'add',tx:t})]);
  const batch=[];for(let i=0;i<12;i++)batch.push((i%2?f1:f2).famSendOp({opId:'add-t-m'+i,type:'add',tx:mkTx('t-m'+i,i+1,ANS)}));await Promise.all(batch);
  assert.strictEqual((await opsAll()).length,13);
  const A=mkDaftari(),B=mkDaftari();await Promise.all([A.runFamilyImport(()=>{}),B.runFamilyImport(()=>{})]);await Promise.all([A.runFamilyImport(()=>{}),B.runFamilyImport(()=>{})]);
  const ids=(await mainTx()).map(t=>t.id);assert.strictEqual(ids.length,base+13);assert.strictEqual(new Set(ids).size,ids.length);
 });
 await T('S6 crash between main write and op flag: re-import is a no-op (no duplicate)',async()=>{
  await reset();const t=mkTx('t-crash',4,ANS);const m=JSON.parse(JSON.stringify(main));m.transactions.push(t);await MAINREF().set(m);
  const fam=mkFamily(ANS);fam.famEffective({transactions:[],deleteRequests:[],deletedTxIds:[],closedMonths:[]});
  await fam.famSendOp({opId:'add-t-crash',type:'add',tx:t});const D=mkDaftari();await D.runFamilyImport(()=>{});
  assert.strictEqual((await mainTx()).filter(x=>x.id==='t-crash').length,1);assert((await opsAll())[0].applied===true);
 });
 await T('S7 edit applies once, repeats are no-ops; reject/cancel only while pending',async()=>{
  await reset();const t=mkTx('t-ed',20,ANS);const m=JSON.parse(JSON.stringify(main));m.transactions.push(t);m.deleteRequests=[{id:'r1',txId:'t-ed',txSnapshot:t,status:'pending',requestedBy:'ans'},{id:'r2',txId:'x',txSnapshot:t,status:'approved'}];await MAINREF().set(m);
  const fam=mkFamily(ABD);fam.famEffective({transactions:[t],deleteRequests:m.deleteRequests,deletedTxIds:[],closedMonths:[]});
  await fam.famEditSend({id:'t-ed'},30,'بسكويت — x','غلط',true);
  await fam.famSendOp({opId:'cancel-r2',type:'cancel',reqId:'r2',at:Date.now()});await fam.famSendOp({opId:'reject-r1',type:'reject',reqId:'r1',at:Date.now(),reason:'لا'});
  const D=mkDaftari();await D.runFamilyImport(()=>{});await D.runFamilyImport(()=>{});
  const d=(await MAINREF().get()).data();const e=d.transactions.find(x=>x.id==='t-ed');
  assert.strictEqual(e.amount,30);assert.strictEqual(e.originalAmount,20);assert.strictEqual(d.deleteRequests.find(r=>r.id==='r1').status,'rejected');assert.strictEqual(d.deleteRequests.find(r=>r.id==='r2').status,'approved','approved request must not be overwritten');
 });
 await T('S8 closed month (Daftari key 2026-أكتوبر): entry skipped and reported, op still marked done',async()=>{
  await reset();const fam=mkFamily(ANS);fam.famEffective({transactions:[],deleteRequests:[],deletedTxIds:[],closedMonths:[]});
  await fam.famSendOp({opId:'add-t-old',type:'add',tx:mkTx('t-old',50,ANS,{date:'2026-10-15',month:'أكتوبر',monthIndex:9})});
  const D=mkDaftari();let sm;await D.runFamilyImport(r=>sm=D.famImportSummary(r));
  assert.strictEqual(sm.closedSkips,1);assert(!(await mainTx()).some(t=>t.id==='t-old'));
 });
 await T('S9 Family sees its entry instantly (overlay) and exactly once after Daftari imports and republishes the view',async()=>{
  await reset();const D=mkDaftari();const fam=mkFamily(ANS);
  const view0=D.famBuildView(main);const v0=Object.assign({},view0,{generatedAt:Date.now()-1000});
  const hani=fam.parseTransactions(v0).length;
  await fam.famSaveCheck(mkTx('t-vis',6,ANS),'بسكويت');fam.setOps(await opsAll());
  assert.strictEqual(fam.parseTransactions(fam.famEffective(v0)).length,hani+1,'visible before import');
  await D.runFamilyImport(()=>{});const raw=(await MAINREF().get()).data();const v1=Object.assign({},D.famBuildView(raw),{generatedAt:Date.now()});
  fam.setOps(await opsAll());
  assert.strictEqual(fam.parseTransactions(fam.famEffective(v1)).length,hani+1,'once after import');
  // stale view + applied op still overlays (no flicker)
  assert.strictEqual(fam.parseTransactions(fam.famEffective(v0)).length,hani+1,'no flicker with older view');
 });
 await T('S10 view contains exactly what Family showed before (parse of main == parse of view) on REAL data',async()=>{
  const fam=mkFamily(ANS);const D=mkDaftari();
  const a=fam.parseTransactions(main).map(t=>t.id).sort(),b=fam.parseTransactions(D.famBuildView(main)).map(t=>t.id).sort();
  assert.deepStrictEqual(a,b);console.log('   Family-visible entries on real data:',a.length,'of',main.transactions.length,'total; view size KB:',Math.round(JSON.stringify(D.famBuildView(main)).length/1024));
 });
 await T('S11 import touches only transactions, deleteRequests, deletedTxIds + version fields (45 other fields on real doc unchanged)',async()=>{
  await reset();const fam=mkFamily(ANS);fam.famEffective({transactions:[],deleteRequests:[],deletedTxIds:[],closedMonths:[]});
  await fam.famSaveCheck(mkTx('t-s11',2,ANS),'بسكويت');const D=mkDaftari();await D.runFamilyImport(()=>{});
  const after=(await MAINREF().get()).data();const keys=Object.keys(main).filter(k=>!['transactions','deleteRequests','deletedTxIds','__docVersion','__lastWriteAt','__lastWriteBy'].includes(k));
  for(const k of keys)assert.deepStrictEqual(after[k],main[k],'field changed: '+k);console.log('   unchanged fields checked:',keys.length);
 });
 await T('S12 view publish writes family_view and skips identical republish',async()=>{
  await reset();const D=mkDaftari();D.scheduleFamilyViewPublish(main);await sleep(2500);
  const v=(await db.collection('finance_2026').doc('family_view').get()).data();assert(v&&v.generatedAt&&v.transactions.length>0);
  const g=v.generatedAt;D.scheduleFamilyViewPublish(main);await sleep(2500);
  assert.strictEqual((await db.collection('finance_2026').doc('family_view').get()).data().generatedAt,g,'unchanged view must not be rewritten');
 });
 console.log('\nPASSED',pass);process.exit(process.exitCode||0);
})().catch(e=>{console.error('CRASH',e);process.exit(1)});
