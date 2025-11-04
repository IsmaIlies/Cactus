import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, Download, RefreshCw, Sparkles, X, ChevronDown, ChevronUp, Heart, MessageCircle, Pin } from 'lucide-react';
import { db } from '../firebase';
import { addDoc, collection, deleteDoc, doc, getCountFromServer, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

type NovItem = { id:string; name:string; size:number; updatedAt:Date|null; storagePath?:string; url?:string|null; b64?:string|null; pinned?: boolean };

// Lightweight comments box for item discussion
const CommentsBox: React.FC<{
  itemId: string;
  loading: boolean;
  comments: Array<{ id: string; txt: string; uid: string; ts: Date }>;
  onAdd: (text: string) => void;
  onRemove: (commentId: string, uid: string) => void;
  canWrite: boolean;
  currentUserId?: string | null;
}> = ({ loading, comments, onAdd, onRemove, canWrite, currentUserId }) => {
  const [text, setText] = useState('');
  return (
    <div className="rounded-md border border-white/10 bg-black/30">
      <div className="px-3 py-2 text-[11px] text-white/70 border-b border-white/10">Commentaires</div>
      {loading ? (
        <div className="p-3 text-[12px] text-white/60 flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin"/> Chargement…</div>
      ) : (
        <div className="max-h-56 overflow-auto divide-y divide-white/10">
          {comments.length === 0 ? (
            <div className="p-3 text-[12px] text-white/50">Aucun commentaire pour le moment.</div>
          ) : comments.map(c => (
            <div key={c.id} className="p-2 text-[12px] text-white/90 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-white/80 break-words">{c.txt}</div>
                <div className="text-[10px] text-white/40">par {c.uid.slice(0,6)}… · {c.ts.toLocaleDateString('fr-FR')} {c.ts.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}</div>
              </div>
              {currentUserId === c.uid && (
                <button onClick={()=> onRemove(c.id, c.uid)} className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white/70 hover:bg-white/20">Supprimer</button>
              )}
            </div>
          ))}
        </div>
      )}
      {canWrite && (
        <div className="p-2 flex items-center gap-2 border-t border-white/10">
          <input value={text} onChange={e=> setText(e.target.value)} placeholder="Ajouter un commentaire" className="flex-1 text-[12px] px-2 py-1 rounded bg-black/40 border border-white/10 text-white placeholder-white/40" />
          <button onClick={()=> { if (text.trim()) { onAdd(text); setText(''); } }} className="text-[11px] px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white">Envoyer</button>
        </div>
      )}
    </div>
  );
};

const NouveautesPdfBanner: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NovItem[]>([]);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  // Timeline style (Facebook-like)
  const [visible, setVisible] = useState(6); // nombre d'éléments visibles
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<null | { id:string; title:string; url:string }>(null);
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [commentsOpen, setCommentsOpen] = useState<Record<string, boolean>>({});
  const [commentsMap, setCommentsMap] = useState<Record<string, Array<{id:string;txt:string;uid:string;ts:Date}>>>({});
  const [commentsLoading, setCommentsLoading] = useState<Record<string, boolean>>({});
  const commentsUnsubs = useRef<Record<string, () => void>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const col = collection(db,'novelties');
        let docs: any[] = [];
        try {
          const q = query(col, where('active','==', true), orderBy('updatedAt','desc'));
          const snap = await getDocs(q);
          snap.forEach(d => { const v:any=d.data(); docs.push({ id:d.id, name:String(v?.name||'Sans nom'), size:Number(v?.size||0), updatedAt: v?.updatedAt?.toDate? v.updatedAt.toDate(): null, storagePath:v?.storagePath, url: typeof v?.url==='string'? v.url : null, b64: typeof v?.data==='string'? v.data : null, pinned: !!v?.pinned }); });
        } catch {
          const snap = await getDocs(col);
          snap.forEach(d => { const v:any=d.data(); if (v?.active){ docs.push({ id:d.id, name:String(v?.name||'Sans nom'), size:Number(v?.size||0), updatedAt: v?.updatedAt?.toDate? v.updatedAt.toDate(): null, storagePath:v?.storagePath, url: typeof v?.url==='string'? v.url : null, b64: typeof v?.data==='string'? v.data : null, pinned: !!v?.pinned }); } });
        }
        // Sort pinned first then by date desc
        docs.sort((a,b)=> (Number(b.pinned)-Number(a.pinned)) || ((b.updatedAt?.getTime()||0) - (a.updatedAt?.getTime()||0)) );
        if (!alive) return;
        setItems(docs);
        setError(null);
      } catch (err:any){
        setError(err?.message || 'Erreur chargement PDF');
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  // Développer automatiquement le plus récent
  useEffect(()=>{
    if (items.length) {
      setExpanded(e=> ({...e, [items[0].id]: true}));
      // Record view for the latest item when auto-expanded
      recordViewAndCounts(items[0].id);
    }
  }, [items]);

  const pageItems = useMemo(()=> items.slice(0, visible), [items, visible]);

  const buildPreviewUrl = (it: NovItem, bust?: number) => {
    const versionToken = it.updatedAt ? it.updatedAt.getTime() : (it.storagePath ? Number((it.storagePath.split('/').pop()||Date.now())) : Date.now());
    if (typeof it.url === 'string' && it.url) {
      const sep = it.url.includes('?') ? '&' : '?';
      const v = bust ?? versionToken;
      return `${it.url}${sep}v=${v}&response-content-disposition=inline&response-content-type=application/pdf`;
    }
    if (typeof it.b64 === 'string' && it.b64) {
      try {
        const byteChars = atob(it.b64);
        const byteNumbers = new Array(byteChars.length);
        for (let i=0;i<byteChars.length;i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type:'application/pdf' });
        return URL.createObjectURL(blob);
      } catch { return ''; }
    }
    return '';
  };

  const isNew = (d: Date | null) => d ? (Date.now() - d.getTime()) < 24*60*60*1000 : false;
  const relativeTime = (d: Date | null) => {
    if (!d) return '—';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `il y a ${diff}s`;
    const m = Math.floor(diff/60); if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m/60); if (h < 24) return `il y a ${h} h`;
    const j = Math.floor(h/24); if (j < 7) return `il y a ${j} j`;
    return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  };

  // Cleanup all active comment listeners on unmount to avoid lingering channels
  useEffect(() => {
    return () => {
      try {
        Object.values(commentsUnsubs.current).forEach(fn => { try { fn(); } catch {} });
        commentsUnsubs.current = {};
      } catch {}
    };
  }, []);

  // Likes helpers
  const refreshLikeState = async (id: string) => {
    try {
      const likesCol = collection(db, 'novelties', id, 'likes');
      const cnt = await getCountFromServer(likesCol as any);
      setLikeCounts(prev=> ({...prev, [id]: Number((cnt as any).data().count || 0)}));
      if (user) {
        const likeDoc = await getDoc(doc(db,'novelties', id, 'likes', user.id));
        setLikedMap(prev=> ({...prev, [id]: likeDoc.exists()}));
      }
    } catch { /* noop */ }
  };

  const toggleLike = async (id: string) => {
    if (!user) return;
    const prevLiked = !!likedMap[id];
    setLikedMap(m=> ({...m, [id]: !prevLiked}));
    setLikeCounts(c=> ({...c, [id]: Math.max(0, (c[id]||0) + (prevLiked?-1:1))}));
    try {
      const likeRef = doc(db,'novelties', id, 'likes', user.id);
      if (prevLiked) await deleteDoc(likeRef); else await setDoc(likeRef, { createdAt: serverTimestamp() });
    } catch {
      // rollback minimal
      setLikedMap(m=> ({...m, [id]: prevLiked}));
      setLikeCounts(c=> ({...c, [id]: Math.max(0, (c[id]||0) + (prevLiked?1:-1))}));
    }
  };

  // View counter when expanding
  const recordViewAndCounts = async (id: string) => {
    try {
      if (user) {
        const viewRef = doc(db,'novelties', id, 'views', user.id);
        const snap = await getDoc(viewRef);
        if (snap.exists()) await setDoc(viewRef, { lastAt: serverTimestamp() }, { merge: true });
        else await setDoc(viewRef, { firstAt: serverTimestamp(), lastAt: serverTimestamp() });
      }
    } catch {}
    try {
      const viewsCol = collection(db,'novelties', id, 'views');
      const cnt = await getCountFromServer(viewsCol as any);
      setViewCounts(v=> ({...v, [id]: Number((cnt as any).data().count || 0)}));
    } catch {}
    refreshLikeState(id);
  };

  // Comments
  const toggleComments = async (id: string) => {
    const willOpen = !commentsOpen[id];
    setCommentsOpen(m=> ({...m, [id]: willOpen}));
    if (willOpen) {
      setCommentsLoading(l=> ({...l, [id]: true}));
      const col = collection(db,'novelties', id, 'comments');
      const q = query(col, orderBy('createdAt','desc'), limit(30));
      commentsUnsubs.current[id]?.();
      commentsUnsubs.current[id] = onSnapshot(q, (snap)=>{
        const list = snap.docs.map(d=>{ const v:any=d.data(); return { id:d.id, txt:String(v?.text||''), uid:String(v?.userId||'?'), ts: v?.createdAt?.toDate? v.createdAt.toDate(): new Date() }; });
        setCommentsMap(m=> ({...m, [id]: list}));
        setCommentsLoading(l=> ({...l, [id]: false}));
      });
    } else {
      commentsUnsubs.current[id]?.();
      delete commentsUnsubs.current[id];
    }
  };
  const addComment = async (id: string, text: string) => {
    if (!user || !text.trim()) return;
    try {
      await addDoc(collection(db,'novelties', id, 'comments'), { userId: user.id, text: text.trim().slice(0,1000), createdAt: serverTimestamp() });
    } catch {}
  };
  const removeComment = async (id: string, commentId: string, uid: string) => {
    if (!user || user.id !== uid) return;
    try { await deleteDoc(doc(db,'novelties', id, 'comments', commentId)); } catch {}
  };

  return (
    <div id="nouveautes-pdf" className="group rounded-2xl relative overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_30%_15%,#065f46_0%,#031f18_55%,#010d0b_100%)]/80 shadow-[0_4px_18px_-4px_rgba(0,0,0,0.55)] backdrop-blur-sm">
      <div className="pointer-events-none absolute -top-24 -left-24 w-[320px] h-[320px] rounded-full bg-emerald-600/10 blur-3xl opacity-60" />
      <div className="relative p-5 flex flex-col gap-4">
  {/* En-tête */}
  <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-inner shadow-black/40 ring-2 ring-white/10">
              <FileUp className="h-6 w-6 text-white/90" />
            </div>
            <div className="flex flex-col">
              <h3 className="text-base font-semibold tracking-wide text-white flex items-center gap-2">
                Nouveautés • PDF
                {items.some(it => isNew(it.updatedAt)) && <span className="text-[10px] uppercase bg-emerald-500/90 text-black px-2 py-[3px] rounded-full font-semibold tracking-wider shadow-sm">NEW</span>}
                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-200/70 bg-emerald-900/30 px-2 py-[2px] rounded-full border border-emerald-500/20">
                  <Sparkles className="h-3 w-3 text-emerald-300" /> Live
                </span>
              </h3>
              <div className="text-[11px] text-white/60 flex gap-2 flex-wrap">{items.length} document(s)</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-[11px] text-white/60">
            <span className="hidden sm:inline">Derniers en premier</span>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-xs text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</div>
            <div className="h-2 w-1/2 max-w-[260px] bg-white/10 rounded overflow-hidden"><div className="h-full w-1/2 animate-pulse bg-white/25" /></div>
            <div className="h-[380px] rounded-xl border border-white/10 bg-black/20 animate-pulse" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-[200px] flex flex-col items-center justify-center textcenter border border-dashed border-white/15 rounded-xl bg-white/5 text-white/40">
            <p className="text-xs">Aucun PDF Nouveautés publié ou activé pour l'instant.</p>
          </div>
        ) : (
          <div className="space-y-4">
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-white/10" />
                <div className="space-y-3">
                  {pageItems.map(it => {
                    const open = !!expanded[it.id];
                    const created = relativeTime(it.updatedAt);
                    return (
                      <div key={it.id} className="pl-10">
                        <div className="relative">
                          <div className="absolute -left-[9px] top-2 h-3 w-3 rounded-full bg-emerald-500 shadow" />
                          <button
                            onClick={()=> { const next = !open; setExpanded(e=> ({...e, [it.id]: next})); if (next) recordViewAndCounts(it.id); }}
                            className="w-full text-left rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition p-3 flex items-center justify-between"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white truncate" title={it.name}>{it.name}</span>
                                {it.pinned && (
                                  <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-[1px] rounded-full border border-amber-400/30 bg-amber-500/15 text-amber-200"><Pin className="h-3 w-3"/> épinglé</span>
                                )}
                                {isNew(it.updatedAt) && (<span className="text-[9px] bg-emerald-500/90 text-black px-1.5 py-[1px] rounded-full">NEW</span>)}
                              </div>
                              <div className="text-[11px] text-white/60 flex gap-2 flex-wrap">
                                {it.size ? <span>{Math.round(it.size/1024)} Ko</span> : null}
                                <span>{created}</span>
                              </div>
                            </div>
                            <div className="text-white/70">{open ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}</div>
                          </button>
                          {open && (
                            <div className="mt-2 rounded-lg overflow-hidden border border-white/10 bg-black/40">
                              {(() => { const url = buildPreviewUrl(it); return url ? (
                                <iframe title={`Nouveautés ${it.name}`} className="w-full h-[420px] select-none" src={`${url.split('#')[0]}#toolbar=0&navpanes=0&scrollbar=0`} allow="fullscreen" allowFullScreen />
                              ) : null; })()}
                              <div className="p-2 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={()=> toggleLike(it.id)}
                                    className={`group relative inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-full border transition ${likedMap[it.id] ? 'bg-emerald-600/90 border-emerald-400/40 text-white shadow-md' : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white'}`}
                                  >
                                    <Heart className={`h-4 w-4 transition ${likedMap[it.id] ? 'fill-current text-white scale-110' : 'text-emerald-300'}`} />
                                    <span>{likeCounts[it.id] ?? 0}</span>
                                  </button>
                                  <button
                                    onClick={()=> toggleComments(it.id)}
                                    className="relative inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-full border bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
                                  >
                                    <MessageCircle className="h-4 w-4 text-emerald-300" />
                                    <span>Commentaires {commentsMap[it.id]?.length ? `(${commentsMap[it.id].length})` : ''}</span>
                                  </button>
                                  <div className="text-[11px] text-white/50">Vues {viewCounts[it.id] ?? 0}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button onClick={()=> setRefreshKey(Date.now())} className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md bg-black/55 hover:bg-black/75 text-white border border-white/10">
                                    <RefreshCw className="h-3.5 w-3.5" /> Recharger
                                  </button>
                                  {it.url && (
                                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-white">
                                      <Download className="h-3.5 w-3.5" /> Télécharger
                                    </a>
                                  )}
                                </div>
                              </div>

                              {commentsOpen[it.id] && (
                                <div className="px-3 pb-3">
                                  <CommentsBox
                                    itemId={it.id}
                                    loading={!!commentsLoading[it.id]}
                                    comments={commentsMap[it.id] || []}
                                    onAdd={(txt)=> addComment(it.id, txt)}
                                    onRemove={(cid, uid)=> removeComment(it.id, cid, uid)}
                                    canWrite={!!user}
                                    currentUserId={user?.id}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
          </div>
        )}
        {items.length > visible && (
          <div className="flex justify-center pt-1">
            <button onClick={()=> setVisible(v=> v+6)} className="text-[12px] px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white border border-white/10">Afficher plus</button>
          </div>
        )}
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>

      {/* Modal Aperçu */}
      {modal && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-5xl rounded-xl border border-white/10 bg-cactus-950/95 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <div className="text-sm font-semibold text-white truncate pr-6">{modal.title}</div>
              <div className="flex items-center gap-2">
                <button onClick={()=> setModal(m=> m ? ({...m, url: buildPreviewUrl(items.find(i=> i.id===m.id)!, Date.now())}) : m)} className="text-[11px] px-2.5 py-1.5 rounded-md bg-black/55 hover:bg-black/75 text-white border border-white/10 flex items-center gap-1">
                  <RefreshCw className="h-3.5 w-3.5" /> Recharger
                </button>
                <button onClick={()=> setModal(null)} className="p-2 rounded bg-white/10 hover:bg-white/20 text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-3">
              <iframe key={modal.url} title={modal.title} className="w-full h-[70vh] rounded-lg border border-white/10" src={`${modal.url.split('#')[0]}#toolbar=0&navpanes=0&scrollbar=0`} allow="fullscreen" allowFullScreen />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NouveautesPdfBanner;
