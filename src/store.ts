import { create } from 'zustand';
import { WorkItem, TaskLink, ItemKind, LinkKind, SegmentRule, DEFAULT_SEGMENTS, canMove } from './model';

const isTauri = '__TAURI_INTERNALS__' in window;
const storageKey = 'taskmaster-local-v1';
type Snapshot = { items: WorkItem[]; links: TaskLink[]; rules: SegmentRule[] };
const stamp = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const seed = (): Snapshot => {
  const now = stamp();
  const items: WorkItem[] = DEFAULT_SEGMENTS.map((s, i) => ({ id: `segment-${i + 1}`, title: s.title, kind: 'segment', parentId: null, segmentId: null, status: 'active', dueDate: null, startDate: null, notes: '', position: i, size: null, createdAt: now, updatedAt: now }));
  const samples = [
    { title: 'Plan the next release', segment: 0, parent: null, due: null },
    { title: 'Shape the roadmap', segment: 1, parent: 'segment-2', due: plus(5) },
    { title: 'Review the draft', segment: 2, parent: 'segment-2', due: plus(2) },
    { title: 'Ship the first version', segment: 1, parent: 'segment-1', due: plus(14) },
    { title: 'Collect early feedback', segment: 3, parent: 'segment-4', due: plus(-1) },
  ];
  for (let i=0; i<samples.length; i++) {
    const sample = samples[i]; items.push({ id: `task-${i+1}`, title: sample.title, kind: 'task', parentId: sample.parent, segmentId: `segment-${sample.segment+1}`, status: 'active', dueDate: sample.due, startDate: null, notes: '', position: i, size: null, createdAt: now, updatedAt: now });
  }
  const links: TaskLink[] = [
    { id:'link-a', sourceId:'task-2', targetId:'task-3', kind:'dependent', timing:null, label:'', createdAt:now },
    { id:'link-b', sourceId:'task-2', targetId:'task-4', kind:'parallel', timing:null, label:'', createdAt:now },
    { id:'link-c', sourceId:'task-3', targetId:'task-5', kind:'timed', timing:'finish-to-start', label:'', createdAt:now },
  ];
  return { items, links, rules: [] };
};
function plus(days:number) { const d=new Date(); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }

async function openDb() {
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  const db = await Database.load('sqlite:taskmaster.db');
  await db.execute('PRAGMA foreign_keys = ON');
  await db.execute(`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, parent_id TEXT REFERENCES items(id) ON DELETE CASCADE, segment_id TEXT REFERENCES items(id) ON DELETE SET NULL, status TEXT NOT NULL, due_date TEXT, start_date TEXT, notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, size REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  await db.execute(`CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, target_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, kind TEXT NOT NULL, timing TEXT, label TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, CHECK(source_id <> target_id))`);
  await db.execute(`CREATE TABLE IF NOT EXISTS rules (segment_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, type TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(segment_id,type))`);
  await db.execute(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  return db;
}
type ItemRow = { id:string; title:string; kind:ItemKind; parent_id:string|null; segment_id:string|null; status:string; due_date:string|null; start_date:string|null; notes:string; position:number; size:number|null; created_at:string; updated_at:string };
function toItem(r:ItemRow):WorkItem { return { id:r.id,title:r.title,kind:r.kind,parentId:r.parent_id,segmentId:r.segment_id,status:r.status,dueDate:r.due_date,startDate:r.start_date,notes:r.notes,position:r.position,size:r.size,createdAt:r.created_at,updatedAt:r.updated_at }; }
let dbPromise: ReturnType<typeof openDb> | undefined;
async function persist(s:Snapshot) {
  if (!isTauri) { localStorage.setItem(storageKey, JSON.stringify(s)); return; }
  const db = await (dbPromise ??= openDb());
  await db.execute('BEGIN');
  try {
    await db.execute('DELETE FROM links'); await db.execute('DELETE FROM rules'); await db.execute('DELETE FROM items');
    for (const x of s.items) await db.execute('INSERT INTO items VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[x.id,x.title,x.kind,x.parentId,x.segmentId,x.status,x.dueDate,x.startDate,x.notes,x.position,x.size,x.createdAt,x.updatedAt]);
    for (const x of s.links) await db.execute('INSERT INTO links VALUES(?,?,?,?,?,?,?)',[x.id,x.sourceId,x.targetId,x.kind,x.timing,x.label,x.createdAt]);
    for (const x of s.rules) await db.execute('INSERT INTO rules VALUES(?,?,?)',[x.segmentId,x.type,x.value]);
    await db.execute('COMMIT');
  } catch (e) { await db.execute('ROLLBACK'); throw e; }
}
async function loadSnapshot():Promise<Snapshot> {
  if (!isTauri) { const raw=localStorage.getItem(storageKey); return raw ? JSON.parse(raw) as Snapshot : seed(); }
  const db=await (dbPromise ??= openDb());
  const rows=await db.select<ItemRow[]>('SELECT * FROM items ORDER BY position');
  if (!rows.length) return seed();
  const links=await db.select<TaskLink[]>('SELECT id,source_id as sourceId,target_id as targetId,kind,timing,label,created_at as createdAt FROM links');
  const rules=await db.select<Array<{segment_id:string,type:SegmentRule['type'],value:string}>>('SELECT * FROM rules');
  return { items:rows.map(toItem),links,rules:rules.map(r=>({segmentId:r.segment_id,type:r.type,value:r.value})) };
}

interface AppState extends Snapshot {
  ready:boolean; view:'board'|'map'; selectedId:string|null; search:string; sizeMode:'manual'|'due'|'children'; minSize:number; maxSize:number;
  visibleLinks:Record<LinkKind,boolean>; maxDepth:number; sidebarOpen:boolean;
  init:()=>Promise<void>; setView:(view:'board'|'map')=>void; select:(id:string|null)=>void; setSearch:(q:string)=>void;
  setSizeMode:(v:AppState['sizeMode'])=>void; setBounds:(min:number,max:number)=>void; toggleLink:(kind:LinkKind)=>void; setMaxDepth:(n:number)=>void; toggleSidebar:()=>void;
  addItem:(kind:ItemKind,parentId?:string|null,segmentId?:string|null)=>string; updateItem:(id:string,patch:Partial<WorkItem>)=>void; moveItem:(id:string,parentId:string|null,segmentId:string|null)=>boolean; removeItem:(id:string)=>void;
  addLink:(sourceId:string,targetId:string,kind:LinkKind,timing?:string)=>void; removeLink:(id:string)=>void; setRule:(rule:SegmentRule)=>void; resetDemo:()=>void;
}
export const useAppStore=create<AppState>((set,get)=>({
  ...seed(),ready:false,view:'board',selectedId:null,search:'',sizeMode:'due',minSize:34,maxSize:82,visibleLinks:{timed:true,dependent:true,parallel:true},maxDepth:8,sidebarOpen:true,
  init:async()=>{try{const s=await loadSnapshot();set({...s,ready:true});if(!isTauri&&!localStorage.getItem(storageKey))await persist(s);if(isTauri){const db=await(dbPromise??=openDb());const rows=await db.select<Array<{id:string}>>('SELECT id FROM items LIMIT 1');if(!rows.length)await persist(s);}}catch(e){console.error('Could not load local task data',e);set({ready:true});}},
  setView:view=>set({view}),select:selectedId=>set({selectedId}),setSearch:search=>set({search}),setSizeMode:sizeMode=>set({sizeMode}),setBounds:(minSize,maxSize)=>set({minSize,maxSize}),toggleLink:kind=>set(s=>({visibleLinks:{...s.visibleLinks,[kind]:!s.visibleLinks[kind]}})),setMaxDepth:maxDepth=>set({maxDepth}),toggleSidebar:()=>set(s=>({sidebarOpen:!s.sidebarOpen})),
  addItem:(kind,parentId=null,segmentId=null)=>{const now=stamp(),newId=id(),s=get();if(kind==='task'&&!segmentId)segmentId=parentId?(s.items.find(x=>x.id===parentId)?.kind==='segment'?parentId:s.items.find(x=>x.id===parentId)?.segmentId??null):'segment-1';const item:WorkItem={id:newId,title:kind==='segment'?'New segment':'New task',kind,parentId,segmentId,status:'active',dueDate:null,startDate:null,notes:'',position:s.items.filter(x=>x.parentId===parentId&&x.kind===kind).length,size:null,createdAt:now,updatedAt:now};const items=[...s.items,item];set({items,selectedId:newId});void persist({...s,items});return newId;},
  updateItem:(itemId,patch)=>{const s=get(),items=s.items.map(x=>x.id===itemId?{...x,...patch,updatedAt:stamp()}:x);set({items});void persist({...s,items});},
  moveItem:(itemId,parentId,segmentId)=>{const s=get();if(!canMove(s.items,itemId,parentId))return false;const moved=s.items.find(x=>x.id===itemId);if(!moved)return false;if(moved.kind==='segment'&&parentId){const p=s.items.find(x=>x.id===parentId);if(!p||p.kind!=='segment')return false;}if(moved.kind==='task'&&parentId){const p=s.items.find(x=>x.id===parentId);if(!p||p.kind!=='task')return false;segmentId=p.segmentId??segmentId;}const items=s.items.map(x=>x.id===itemId?{...x,parentId,segmentId:moved.kind==='segment'?null:segmentId,updatedAt:stamp()}:x);set({items});void persist({...s,items});return true;},
  removeItem:itemId=>{const s=get();const remove=new Set<string>([itemId]);let changed=true;while(changed){changed=false;for(const x of s.items)if(x.parentId&&remove.has(x.parentId)&&!remove.has(x.id)){remove.add(x.id);changed=true;}}const items=s.items.filter(x=>!remove.has(x.id)),links=s.links.filter(x=>!remove.has(x.sourceId)&&!remove.has(x.targetId)),rules=s.rules.filter(x=>!remove.has(x.segmentId));set({items,links,rules,selectedId:remove.has(s.selectedId??'')?null:s.selectedId});void persist({items,links,rules});},
  addLink:(sourceId,targetId,kind,timing)=>{if(sourceId===targetId)return;const s=get();if(s.links.some(x=>x.sourceId===sourceId&&x.targetId===targetId&&x.kind===kind))return;const links=[...s.links,{id:id(),sourceId,targetId,kind,timing:kind==='timed'?(timing??'finish-to-start'):null,label:'',createdAt:stamp()}];set({links});void persist({...s,links});},
  removeLink:linkId=>{const s=get(),links=s.links.filter(x=>x.id!==linkId);set({links});void persist({...s,links});},
  setRule:rule=>{const s=get(),rules=[...s.rules.filter(r=>!(r.segmentId===rule.segmentId&&r.type===rule.type)),rule];set({rules});void persist({...s,rules});},resetDemo:()=>{const s=seed();set(s);void persist(s);},
}));
