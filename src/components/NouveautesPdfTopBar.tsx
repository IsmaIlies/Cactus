import React, { useEffect, useRef, useState } from 'react';
import { FileText, ToggleLeft, ToggleRight } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, increment } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { storage, db, auth } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, uploadBytes } from 'firebase/storage';

// Top bar for managing "Nouveautés PDF" (upload + activate toggle for privileged users)
const NouveautesPdfTopBar: React.FC = () => {
  const { user } = useAuth();
  const EMAIL_ALLOWLIST = [
    'j.allione@mars-marketing.fr',
    'i.boultame@mars-marketing.fr',
    'i.brai@mars-marketing.fr'
  ];
  const [name, setName] = useState<string>('Nouveautés PDF');
  const [active, setActive] = useState<boolean>(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [file, setFile] = useState<File | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{id:string; name:string; size:number; active:boolean; updatedAt:Date|null; storagePath?:string;}>>([]);
  const [latestId, setLatestId] = useState<string | null>(null);
  const taskRef = useRef<ReturnType<typeof uploadBytesResumable> | null>(null);
  const privileged = !!user && (
    (user.role && ['admin','superviseur','direction'].includes(String(user.role).toLowerCase())) ||
    (user.email && EMAIL_ALLOWLIST.includes(String(user.email).toLowerCase()))
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Charger la liste (plus récent en premier)
        const col = collection(db, 'novelties');
        let list: Array<{id:string; name:string; size:number; active:boolean; updatedAt:Date|null; storagePath?:string;}> = [];
        try {
          const q = query(col, orderBy('updatedAt','desc'));
          const snap = await getDocs(q);
          snap.forEach(d => {
            const v: any = d.data();
            list.push({
              id: d.id,
              name: String(v?.name || 'Sans nom'),
              size: Number(v?.size || 0),
              active: Boolean(v?.active),
              updatedAt: v?.updatedAt?.toDate ? v.updatedAt.toDate() : null,
              storagePath: typeof v?.storagePath === 'string' ? v.storagePath : undefined,
            });
          });
        } catch {
          // fallback: sans orderBy
          const snap = await getDocs(col);
          snap.forEach(d => { const v:any = d.data(); list.push({ id:d.id, name:String(v?.name||'Sans nom'), size:Number(v?.size||0), active:Boolean(v?.active), updatedAt:v?.updatedAt?.toDate ? v.updatedAt.toDate() : null, storagePath: typeof v?.storagePath === 'string' ? v.storagePath : undefined }); });
          // trier côté client par updatedAt desc
          list.sort((a,b)=> (b.updatedAt?.getTime()||0) - (a.updatedAt?.getTime()||0));
        }
        if (!mounted) return;
        setItems(list);
        const head = list[0];
        if (head){ setLatestId(head.id); setName(head.name); setActive(head.active); setUpdatedAt(head.updatedAt||null); }
      } catch (e){ /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [user]);

  const slugify = (str: string) => str
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'-')
    .replace(/-+/g,'-')
    .replace(/^[-.]+|[-.]+$/g,'')
    .toLowerCase();

  const publish = async () => {
    if (!file || uploading || !privileged) return;
    setError(null);
    setProgress(0);
    try {
      setUploading(true);
      try { await auth.currentUser?.getIdToken(true); } catch {}
      const MAX = 30 * 1024 * 1024;
      if (file.size > MAX){ setError('Fichier trop lourd (max 30MB)'); setUploading(false); return; }

      const cleanName = slugify(file.name);
      const path = `novelties-pdf/${Date.now()}-${cleanName}`;
      const storageRef = ref(storage, path);
      let usedFallback = false;
      const task = uploadBytesResumable(storageRef, file, { contentType: 'application/pdf' });
      taskRef.current = task;
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed', (snap) => {
          if (snap.totalBytes > 0) setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }, async (err) => {
          const msg = (err?.message||'').toLowerCase();
          if (!usedFallback && (msg.includes('cors') || msg.includes('network') || msg.includes('failed'))){
            usedFallback = true;
            try { await uploadBytes(storageRef, file, { contentType: 'application/pdf' }); setProgress(100); resolve(); return; } catch {}
          }
          reject(err);
        }, () => resolve());
      });
      const url = await getDownloadURL(storageRef);
      // Créer un nouveau document (multi-PDF)
      await addDoc(collection(db,'novelties'), {
        name: file.name,
        size: file.size,
        storagePath: path,
        url,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user?.id || null,
        version: increment(1)
      });
      setFile(null);
      setProgress(100);
      setActive(true);
      setName(file.name);
      // refresh list
      try {
        const col = collection(db,'novelties');
        const q = query(col, orderBy('updatedAt','desc'));
        const snap = await getDocs(q);
        const list: any[] = [];
        snap.forEach(d=>{ const v:any=d.data(); list.push({ id:d.id, name:String(v?.name||'Sans nom'), size:Number(v?.size||0), active:Boolean(v?.active), updatedAt:v?.updatedAt?.toDate ? v.updatedAt.toDate() : null, storagePath: v?.storagePath }); });
        setItems(list);
        if (list[0]) setLatestId(list[0].id);
      } catch {}
    } catch (e: any){
      setError(e?.message || 'Upload échoué');
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (id?: string, current?: boolean) => {
    if (!privileged) return;
    const targetId = id || latestId;
    if (!targetId) return;
    const next = !(typeof current === 'boolean' ? current : active);
    if (!id) setActive(next);
    try {
      await updateDoc(doc(db,'novelties', targetId), { active: next, updatedAt: serverTimestamp(), updatedBy: user?.id || null });
      setItems(prev => prev.map(it => it.id===targetId ? { ...it, active: next, updatedAt: new Date() } : it));
    } catch (e){ if (!id) setActive(!next); }
  };

  const deletePdf = async (id?: string) => {
    if (!privileged || uploading) return;
    const targetId = id || latestId;
    if (!targetId) return;
    if (!confirm('Supprimer ce PDF Nouveautés ?')) return;
    try {
      setUploading(true);
      // Find storage path from local items (fallback get)
      let sp: string | undefined = items.find(i=>i.id===targetId)?.storagePath;
      if (!sp) {
        try { const s = await getDoc(doc(db,'novelties', targetId)); const v:any = s.data(); sp = v?.storagePath; } catch {}
      }
      try { if (sp) await deleteObject(ref(storage, sp)); } catch {}
      await deleteDoc(doc(db,'novelties', targetId));
      setItems(prev => prev.filter(i=> i.id!==targetId));
      if (latestId === targetId) {
        const head = items.filter(i=> i.id!==targetId)[0];
        setLatestId(head?.id || null);
        setName(head?.name || 'Nouveautés PDF');
        setActive(!!head?.active);
        setUpdatedAt(head?.updatedAt || null);
      }
    } finally { setUploading(false); }
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
        <div className="flex items-center gap-2 text-emerald-100 text-sm">
          <FileText className="h-4 w-4" />
          <span>{name}</span>
          {updatedAt && (Date.now() - updatedAt.getTime()) < 24*60*60*1000 && (
            <span className="text-[9px] bg-emerald-600/80 px-2 py-[1px] rounded-full">NEW</span>
          )}
          <span className={`ml-2 text-[10px] px-2 py-[2px] rounded-full border ${active? 'bg-emerald-600/70 text-white border-emerald-400/40':'bg-white/10 text-white/70 border-white/20'}`}>
            {active? 'Activé':'Désactivé'}
          </span>
        </div>
        {privileged && (
          <div className="flex items-center gap-2">
            <button onClick={()=>toggleActive()} className="text-xs font-semibold px-3 py-1 rounded-md bg-black/40 text-white border border-white/10 hover:bg-black/60 inline-flex items-center gap-1">
              {active? <ToggleRight className="h-4 w-4"/> : <ToggleLeft className="h-4 w-4"/>}
              {active? 'Désactiver':'Activer'}
            </button>
            <label className="text-[10px] cursor-pointer font-medium bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1 rounded shadow inline-flex items-center gap-1">
              <input type="file" accept="application/pdf" onChange={e=>{ const f=e.target.files?.[0]; if(f && f.type==='application/pdf'){ setFile(f);} }} className="hidden" />
              Choisir un PDF
            </label>
            {file && !uploading && (
              <span className="max-w-[180px] truncate text-[10px] px-2 py-1 rounded bg-emerald-800/40 text-emerald-100 border border-emerald-600/40" title={file.name}>{file.name}</span>
            )}
            {uploading && (
              <div className="w-32 h-2 bg-emerald-900/40 rounded overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all" style={{width: progress+'%'}} /></div>
            )}
            <button disabled={!file || uploading} onClick={publish} className="text-[10px] px-3 py-1 rounded bg-emerald-700 disabled:opacity-40 text-white hover:bg-emerald-600 font-semibold">Publier</button>
            {!uploading && (
              <button onClick={()=>deletePdf()} className="text-[10px] px-3 py-1 rounded bg-red-700 hover:bg-red-600 text-white font-semibold">Supprimer</button>
            )}
          </div>
        )}
      </div>
      {error && <div className="text-[10px] mt-1 text-red-300 whitespace-pre-line">{error}</div>}
      {privileged && items.length > 0 && (
        <div className="mt-2 rounded border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-3 py-2 text-[11px] text-emerald-200/80">Historique des PDF publiés ({items.length})</div>
          <ul className="divide-y divide-white/10">
            {items.map(it => (
              <li key={it.id} className="px-3 py-2 text-[11px] flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="truncate">{it.name}</span>
                  {it.updatedAt && <span className="text-white/50">· {it.updatedAt.toLocaleDateString('fr-FR')} {it.updatedAt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>toggleActive(it.id, it.active)} className="px-2 py-0.5 rounded border border-white/10 text-white/90 bg-black/30 hover:bg-black/50">
                    {it.active ? 'Désactiver' : 'Activer'}
                  </button>
                  <button onClick={()=>deletePdf(it.id)} className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white">Supprimer</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default NouveautesPdfTopBar;
