import React, { useEffect, useRef, useState } from 'react';
import { FileText, ToggleLeft, ToggleRight, Pin, Film } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, increment } from 'firebase/firestore';
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
  const [name, setName] = useState<string>('Nouveautés');
  const [active, setActive] = useState<boolean>(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileKind, setFileKind] = useState<'pdf'|'video'|null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{id:string; name:string; size:number; active:boolean; updatedAt:Date|null; storagePath?:string; pinned?: boolean; type?: 'pdf'|'video'; thumbnailPath?: string;}>>([]);
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
  let list: Array<{id:string; name:string; size:number; active:boolean; updatedAt:Date|null; storagePath?:string; pinned?: boolean; type?: 'pdf'|'video'; thumbnailPath?: string;}> = [];
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
              pinned: !!v?.pinned,
              type: (v?.type === 'video' ? 'video' : 'pdf'),
              thumbnailPath: typeof v?.thumbnailPath === 'string' ? v.thumbnailPath : undefined,
            });
          });
        } catch {
          // fallback: sans orderBy
          const snap = await getDocs(col);
          snap.forEach(d => { const v:any = d.data(); list.push({ id:d.id, name:String(v?.name||'Sans nom'), size:Number(v?.size||0), active:Boolean(v?.active), updatedAt:v?.updatedAt?.toDate ? v.updatedAt.toDate() : null, storagePath: typeof v?.storagePath === 'string' ? v.storagePath : undefined, pinned: !!v?.pinned, type: (v?.type === 'video' ? 'video' : 'pdf'), thumbnailPath: typeof v?.thumbnailPath === 'string' ? v.thumbnailPath : undefined }); });
          // trier côté client: épinglés d'abord puis date
          list.sort((a,b)=> (Number(b.pinned)-Number(a.pinned)) || ((b.updatedAt?.getTime()||0) - (a.updatedAt?.getTime()||0)));
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
    if (!file || uploading || !privileged || !fileKind) return;
    setError(null);
    setProgress(0);
    try {
      setUploading(true);
      try { await auth.currentUser?.getIdToken(true); } catch {}
      const cleanName = slugify(file.name);
      if (fileKind === 'pdf') {
        const MAX = 30 * 1024 * 1024;
        if (file.size > MAX){ setError('Fichier trop lourd (max 30MB)'); setUploading(false); return; }

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
        await addDoc(collection(db,'novelties'), {
          name: file.name,
          size: file.size,
          storagePath: path,
          url,
          type: 'pdf',
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: user?.id || null,
          version: increment(1)
        });
      } else if (fileKind === 'video') {
        const MAXV = 200 * 1024 * 1024;
        if (file.size > MAXV){ setError('Vidéo trop lourde (max 200MB)'); setUploading(false); return; }
        const guessedType = file.type && file.type.startsWith('video/') ? file.type : 'video/mp4';
        const path = `novelties-video/${Date.now()}-${cleanName}`;
        const storageRef = ref(storage, path);
        let usedFallback = false;
        const task = uploadBytesResumable(storageRef, file, { contentType: guessedType });
        taskRef.current = task;
        await new Promise<void>((resolve, reject) => {
          task.on('state_changed', (snap) => {
            if (snap.totalBytes > 0) setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
          }, async (err) => {
            const msg = (err?.message||'').toLowerCase();
            if (!usedFallback && (msg.includes('cors') || msg.includes('network') || msg.includes('failed'))){
              usedFallback = true;
              try { await uploadBytes(storageRef, file, { contentType: guessedType }); setProgress(100); resolve(); return; } catch {}
            }
            reject(err);
          }, () => resolve());
        });
        const url = await getDownloadURL(storageRef);

        // Try to create a thumbnail from the first second
        let thumbUrl: string | null = null;
        let thumbPath: string | undefined;
        let durationSec: number | undefined;
        try {
          const objectUrl = URL.createObjectURL(file);
          const videoEl = document.createElement('video');
          videoEl.src = objectUrl;
          videoEl.crossOrigin = 'anonymous';
          await new Promise<void>((res)=>{
            videoEl.onloadedmetadata = ()=> { try { durationSec = Math.round(videoEl.duration); } catch {}; try { videoEl.currentTime = Math.min(1, Math.max(0, videoEl.duration/10 || 0.1)); } catch {}; res(); };
            videoEl.onerror = ()=> res();
          });
          await new Promise<void>((res)=>{ videoEl.onseeked = ()=> res(); setTimeout(()=> res(), 1000); });
          const canvas = document.createElement('canvas');
          canvas.width = 640; canvas.height = Math.round((videoEl.videoHeight||360) * (640/(videoEl.videoWidth||640)));
          const ctx = canvas.getContext('2d');
          if (ctx) { ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height); }
          const blob: Blob | null = await new Promise(r=> canvas.toBlob(b=> r(b), 'image/jpeg', 0.72));
          URL.revokeObjectURL(objectUrl);
          if (blob) {
            thumbPath = `novelties-video-thumbs/${Date.now()}-${cleanName.replace(/\.[^.]+$/, '')}.jpg`;
            const tRef = ref(storage, thumbPath);
            await uploadBytes(tRef, blob, { contentType: 'image/jpeg' });
            thumbUrl = await getDownloadURL(tRef);
          }
        } catch {}

        await addDoc(collection(db,'novelties'), {
          name: file.name,
          size: file.size,
          storagePath: path,
          url,
          type: 'video',
          thumbnailUrl: thumbUrl || null,
          thumbnailPath: thumbPath || null,
          durationSec: durationSec || null,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: user?.id || null,
          version: increment(1)
        });
      }
      setFile(null);
      setFileKind(null);
      setProgress(100);
      setActive(true);
      setName(file.name);
      // refresh list
      try {
        const col = collection(db,'novelties');
        const q = query(col, orderBy('updatedAt','desc'));
        const snap = await getDocs(q);
        const list: any[] = [];
        snap.forEach(d=>{ const v:any=d.data(); list.push({ id:d.id, name:String(v?.name||'Sans nom'), size:Number(v?.size||0), active:Boolean(v?.active), updatedAt:v?.updatedAt?.toDate ? v.updatedAt.toDate() : null, storagePath: v?.storagePath, pinned: !!v?.pinned, type: (v?.type==='video' ? 'video' : 'pdf'), thumbnailPath: v?.thumbnailPath }); });
        setItems(list.sort((a,b)=> (Number(b.pinned)-Number(a.pinned)) || ((b.updatedAt?.getTime()||0) - (a.updatedAt?.getTime()||0))));
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
      let tp: string | undefined = items.find(i=>i.id===targetId)?.thumbnailPath;
      if (!sp) {
        try { const s = await getDoc(doc(db,'novelties', targetId)); const v:any = s.data(); sp = v?.storagePath; tp = v?.thumbnailPath; } catch {}
      }
      try { if (sp) await deleteObject(ref(storage, sp)); } catch {}
      try { if (tp) await deleteObject(ref(storage, tp)); } catch {}
      await deleteDoc(doc(db,'novelties', targetId));
      setItems(prev => prev.filter(i=> i.id!==targetId));
      if (latestId === targetId) {
        const head = items.filter(i=> i.id!==targetId)[0];
        setLatestId(head?.id || null);
  setName(head?.name || 'Nouveautés');
        setActive(!!head?.active);
        setUpdatedAt(head?.updatedAt || null);
      }
    } finally { setUploading(false); }
  };

  const togglePinned = async (id: string, current?: boolean) => {
    if (!privileged) return;
    const next = !current;
    try {
      await updateDoc(doc(db,'novelties', id), { pinned: next, updatedAt: serverTimestamp(), updatedBy: user?.id || null });
      setItems(prev => prev
        .map(it => it.id===id ? { ...it, pinned: next, updatedAt: new Date() } : it)
        .sort((a,b)=> (Number(b.pinned)-Number(a.pinned)) || ((b.updatedAt?.getTime()||0) - (a.updatedAt?.getTime()||0)))
      );
    } catch (e) { /* ignore */ }
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
              <input type="file" accept="application/pdf" onChange={e=>{ const f=e.target.files?.[0]; if(f && f.type==='application/pdf'){ setFile(f); setFileKind('pdf'); } }} className="hidden" />
              Choisir un PDF
            </label>
            <label className="text-[10px] cursor-pointer font-medium bg-cyan-700 hover:bg-cyan-600 text-white px-3 py-1 rounded shadow inline-flex items-center gap-1">
              <input type="file" accept="video/*" onChange={e=>{ const f=e.target.files?.[0]; if(f && (f.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(f.name))){ setFile(f); setFileKind('video'); } }} className="hidden" />
              <Film className="h-3.5 w-3.5"/> Choisir une vidéo
            </label>
            {file && !uploading && (
              <span className="max-w-[220px] truncate text-[10px] px-2 py-1 rounded bg-emerald-800/40 text-emerald-100 border border-emerald-600/40" title={file.name}>{file.name} {fileKind ? `(${fileKind.toUpperCase()})` : ''}</span>
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
          <div className="px-3 py-2 text-[11px] text-emerald-200/80">Historique des nouveautés publiées ({items.length})</div>
          <ul className="divide-y divide-white/10">
            {items.map(it => (
              <li key={it.id} className="px-3 py-2 text-[11px] flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <span className="truncate">{it.name}</span>
                  <span className={`inline-flex items-center gap-1 text-[9px] px-1.5 py-[1px] rounded-full border ${it.type==='video' ? 'border-cyan-400/30 bg-cyan-500/15 text-cyan-200' : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'}`}>{it.type==='video' ? 'VIDÉO' : 'PDF'}</span>
                  {it.pinned && (
                    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-[1px] rounded-full border border-amber-400/30 bg-amber-500/15 text-amber-200"><Pin className="h-3 w-3"/> épinglé</span>
                  )}
                  {it.updatedAt && <span className="text-white/50">· {it.updatedAt.toLocaleDateString('fr-FR')} {it.updatedAt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>togglePinned(it.id, it.pinned)} className={`px-2 py-0.5 rounded border ${it.pinned ? 'bg-amber-600/30 text-amber-100 border-amber-400/40' : 'bg-black/30 text-white/90 border-white/10 hover:bg-black/50'}`}>
                    {it.pinned ? 'Détacher' : 'Épingler'}
                  </button>
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
