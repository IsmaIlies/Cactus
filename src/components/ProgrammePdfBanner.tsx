import React, { useEffect, useMemo, useState } from 'react';
import { FileUp, Loader2, Download, RefreshCw, Heart, MessageCircle, X, Sparkles } from 'lucide-react';
import { db } from '../firebase';
import { doc, onSnapshot, collection, setDoc, deleteDoc, serverTimestamp, addDoc, query, orderBy, limit, getDoc, getCountFromServer } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

const ProgrammePdfBanner: React.FC = () => {
  useAuth(); // hook conservé si logique future (évite warning SSR absence auth), ignore la valeur
  const [loading, setLoading] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sizeKB, setSizeKB] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [version, setVersion] = useState<number>(0);
  const OBJECT_DOC = doc(db, 'shared', 'programmePdf');

  useEffect(() => {
    // Lecture one-shot (réduit la charge réseau). L'UI propose un bouton "Recharger" pour rafraîchir l'aperçu.
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const snap = await getDoc(OBJECT_DOC);
        if (!active) return;
        if (!snap.exists()) {
          setFileName(null); setB64(null); setSizeKB(null); setUpdatedAt(null); setError(null); setLoading(false); return;
        }
        const d: any = snap.data();
        setFileName(typeof d.name === 'string' ? d.name : null);
        setSizeKB(typeof d.size === 'number' ? Math.round(d.size / 1024) : null);
        setUpdatedAt(d.updatedAt?.toDate ? d.updatedAt.toDate() : null);
        setStoragePath(typeof d.storagePath === 'string' ? d.storagePath : null);
        setVersion(typeof d.version === 'number' ? d.version : (d.version? Number(d.version): 0));
        // Priorité url (Storage) sinon fallback base64
        if (typeof d.url === 'string') {
          setDirectUrl(d.url);
          setB64(null);
        } else if (typeof d.data === 'string') {
          setB64(d.data);
          setDirectUrl(null);
        } else {
          setB64(null);
          setDirectUrl(null);
        }
        setError(null);
      } catch (err: any) {
        if (err?.code === 'permission-denied') {
          setError("Accès refusé (permissions insuffisantes). Vérifie que ton compte est connecté ou demande l'ajout du rôle.");
        } else {
          setError(err?.message || 'Erreur chargement PDF');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const [directUrl, setDirectUrl] = useState<string | null>(null);

  const versionToken = useMemo(()=>{
    if (version) return version;
    if (updatedAt) return updatedAt.getTime();
    if (storagePath) return storagePath.split('/').pop() || Date.now();
    return Date.now();
  }, [updatedAt, storagePath, version]);

  const previewUrl = useMemo(() => {
    if (directUrl) {
      // Ajout d'un paramètre cache-busting basé sur updatedAt/storagePath pour forcer le rafraîchissement de l'iframe
      const sep = directUrl.includes('?') ? '&' : '?';
      return `${directUrl}${sep}v=${versionToken}`;
    }
    if (!b64) return null;
    try {
      const byteChars = atob(b64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    } catch { return null; }
  }, [b64, directUrl, versionToken]);

  useEffect(()=>{
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  // Toujours rendre un conteneur (permet au bouton "Voir dans la page" de fonctionner même si rien n'est publié)
  const noPdf = !loading && !fileName;

  const isNew = useMemo(()=>{
    if(!updatedAt) return false;
    const now = Date.now();
    return (now - updatedAt.getTime()) < 24*60*60*1000; // <24h
  }, [updatedAt]);

  // Interactions sociales persistées
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [comments, setComments] = useState<{id:string;txt:string;uid:string;ts:Date;}[]>([]);
  const [loadingLikes, setLoadingLikes] = useState(true);
  const [loadingComments, setLoadingComments] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);
  const likesCollectionPath = 'programmePdfLikes';
  const commentsCollectionPath = 'programmePdfComments';

  // Listener global compteur likes
  useEffect(()=>{
    // Utilise un comptage serveur one-shot pour éviter un listener en temps réel
    let canceled = false;
    setLoadingLikes(true);
    (async () => {
      try {
        const likesCol = collection(db, likesCollectionPath);
        const snap = await getCountFromServer(likesCol);
        if (!canceled) setLikeCount(Number(snap.data().count || 0));
      } catch (err) {
        console.warn('like count fetch error', err);
        if (!canceled) setLikeError('Impossible de charger le compteur de likes');
      } finally {
        if (!canceled) setLoadingLikes(false);
      }
    })();
    return ()=>{ canceled = true; };
  }, []);

  // Listener spécifique au like de l'utilisateur
  useEffect(()=>{
    if(!user){ setLiked(false); return; }
    let canceled = false;
    const likeDocRef = doc(db, likesCollectionPath, user.id);
    (async () => {
      try {
        const snap = await getDoc(likeDocRef);
        if (!canceled && !likePending) {
          const exists = snap.exists();
          setLiked(exists);
          try { localStorage.setItem('programmePdf_like_'+user.id, exists? '1':'0'); } catch {}
        }
      } catch (err) {
        console.warn('user like fetch error', err);
      }
    })();
    return ()=>{ canceled = true; };
  }, [user]);

  // Hydrate liked state depuis cache local pour éviter flash
  useEffect(()=>{
    if (!user) return;
    try {
      const cached = localStorage.getItem('programmePdf_like_'+user.id);
      if (cached === '1') setLiked(true);
    } catch {}
  }, [user]);

  const toggleLike = async () => {
    if (!user || likePending) return;
    const likeDocRef = doc(db, likesCollectionPath, user.id);
    const prevLiked = liked;
    const prevCount = likeCount;
    setLikePending(true);
    setLiked(!prevLiked);
    setLikeCount(c => c + (prevLiked ? -1 : 1));
    setLikeError(null);
    try {
      if (prevLiked) {
        await deleteDoc(likeDocRef);
      } else {
        await setDoc(likeDocRef, { createdAt: serverTimestamp() });
      }
    } catch (e: any) {
      console.warn('toggleLike failed (rollback)', e);
      // rollback
      setLiked(prevLiked);
      setLikeCount(prevCount);
      if (e && typeof e === 'object') {
        const code = (e as any).code || (e as any).name;
        const msg = (e as any).message || String(e);
        setLikeError(`Erreur like (${code||'unknown'}): ${msg.slice(0,140)}`);
      } else if(!navigator.onLine){
        setLikeError('Hors ligne: like sera synchronisé plus tard.');
      } else {
        setLikeError('Échec enregistrement like');
      }
    } finally {
      setTimeout(()=> setLikePending(false), 120);
    }
  };

  // Charger commentaires (temps réel)
  useEffect(()=>{
    // N'activer l'écoute temps réel des commentaires que lorsque la zone est ouverte
    if (!showComments) return;
    const commentsCol = collection(db, commentsCollectionPath);
    const q = query(commentsCol, orderBy('createdAt','desc'), limit(30));
    const unsub = onSnapshot(q, (snap)=>{
      const list = snap.docs.map(d=>{
        const data: any = d.data();
        return { id: d.id, txt: data.text || '', uid: data.userId || '?', ts: data.createdAt?.toDate ? data.createdAt.toDate() : new Date() };
      });
      setComments(list);
    });
    return ()=>unsub();
  }, [showComments]);

  const addComment = async () => {
    if(!user || !commentDraft.trim()) return;
    setLoadingComments(true);
    try {
  const commentsCol = collection(db, commentsCollectionPath);
      await addDoc(commentsCol, {
        userId: user.id,
        text: commentDraft.trim().slice(0,1000),
        createdAt: serverTimestamp()
      });
      setCommentDraft('');
    } catch (e) {
      console.warn('addComment failed', e);
    } finally { setLoadingComments(false); }
  };
  const removeComment = async (id:string, uid:string) => {
    if(!user) return;
    if (user.id !== uid) return; // seul auteur (ou admin via rules) peut supprimer
  try { await deleteDoc(doc(db, commentsCollectionPath, id)); } catch(e){ console.warn('delete comment failed', e); }
  };

  return (
    <div
      id="programme-pdf"
      className="group rounded-2xl relative overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_30%_15%,#065f46_0%,#031f18_55%,#010d0b_100%)]/80 shadow-[0_4px_18px_-4px_rgba(0,0,0,0.55)] backdrop-blur-sm transition-colors hover:border-emerald-400/40
      before:content-[''] before:absolute before:inset-0 before:pointer-events-none before:opacity-0 hover:before:opacity-100 before:transition before:bg-[conic-gradient(from_0deg,rgba(16,185,129,0.15),transparent_40%,transparent_60%,rgba(16,185,129,0.2))] before:animate-[spin_8s_linear_infinite]"
    >
      {/* Halo décoratif */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-[320px] h-[320px] rounded-full bg-emerald-600/10 blur-3xl opacity-60 group-hover:opacity-80 transition" />
      <div className="relative p-5 flex flex-col gap-4">
        <header className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-inner shadow-black/40 ring-2 ring-white/10">
            <FileUp className="h-6 w-6 text-white/90" />
          </div>
          <div className="flex flex-col">
            <h3 className="text-base font-semibold tracking-wide text-white flex items-center gap-2">
              Programme • PDF
              {isNew && <span className="text-[10px] uppercase bg-emerald-500/90 text-black px-2 py-[3px] rounded-full font-semibold tracking-wider shadow-sm">NEW</span>}
              <span className="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-200/70 bg-emerald-900/30 px-2 py-[2px] rounded-full border border-emerald-500/20">
                <Sparkles className="h-3 w-3 text-emerald-300" /> Live
              </span>
            </h3>
            <div className="text-[11px] text-white/60 flex gap-2 flex-wrap">
              {updatedAt && <span>MAJ {updatedAt.toLocaleDateString('fr-FR')} {updatedAt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>}
              {sizeKB !== null && <span>{sizeKB} Ko</span>}
              {storagePath && <span className="text-white/30">v{versionToken}</span>}
            </div>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-xs text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</div>
            <div className="h-2 w-1/2 max-w-[260px] bg-white/10 rounded overflow-hidden"><div className="h-full w-1/2 animate-pulse bg-white/25" /></div>
            <div className="h-[380px] rounded-xl border border-white/10 bg-black/20 animate-pulse" />
          </div>
        ) : noPdf ? (
          <div className="h-[200px] flex flex-col items-center justify-center text-center border border-dashed border-white/15 rounded-xl bg-white/5 text-white/40">
            <p className="text-xs">Aucun programme publié pour l'instant.</p>
          </div>
        ) : (
          previewUrl && (
            <div className="relative group/pdf rounded-xl overflow-hidden border border-white/10 bg-black/40 backdrop-brightness-[1.05]">
              {/* On masque la toolbar native PDF en utilisant #toolbar=0 si possible */}
              <iframe
                key={previewUrl}
                src={previewUrl + (previewUrl.includes('#')?'&':'#') + 'toolbar=0&navpanes=0&scrollbar=0'}
                title="Programme PDF"
                className="w-full h-[480px] select-none"
              />
              {/* Gradient overlay subtle */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40 opacity-60" />
              {/* Actions flottantes */}
              {directUrl && (
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button
                    onClick={()=>{ if (directUrl) setDirectUrl(directUrl + (directUrl.includes('?')?'&':'?') + 'r=' + Date.now()); }}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md bg-black/55 hover:bg-black/75 text-white shadow transition border border-white/10"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Recharger
                  </button>
                  <a
                    href={directUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-white font-medium shadow transition"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Télécharger
                  </a>
                </div>
              )}
              {/* Tag version discret */}
              <div className="absolute bottom-2 left-3 text-[10px] text-white/40 tracking-wide select-none bg-black/30 px-2 py-[2px] rounded-md border border-white/10">
                v:{versionToken}
              </div>
            </div>
          )
        )}

        {/* Barre d'interactions factices */}
        {!loading && !noPdf && (
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleLike}
                disabled={!user || loadingLikes || likePending}
                className={`group/like relative inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-full border transition focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:opacity-40
                  ${liked ? 'bg-emerald-600/90 border-emerald-400/40 text-white shadow-md shadow-emerald-500/20' : 'bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white'}`}
                aria-pressed={liked}
              >
                <Heart className={`h-4 w-4 transition ${liked ? 'fill-current text-white scale-110' : 'text-emerald-300'}`} />
                <span>{likeCount}</span>
                <span className="absolute -inset-px rounded-full opacity-0 group-hover/like:opacity-100 bg-gradient-to-r from-emerald-600/20 to-teal-500/10 blur-[2px]" />
              </button>
              <button
                onClick={()=>setShowComments(s=>!s)}
                className="relative inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-full border bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              >
                <MessageCircle className="h-4 w-4 text-emerald-300" />
                <span>Commentaires {comments.length ? `(${comments.length})` : ''}</span>
              </button>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-white/40">
              { (likeCount>0 || comments.length>0) && (
                <span>
                  {likeCount>0 && `${likeCount} j'${likeCount>1?'aimes':'aime'}`}
                  {likeCount>0 && comments.length>0 && ' • '}
                  {comments.length>0 && `${comments.length} commentaire${comments.length>1?'s':''}`}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Zone commentaires factices */}
        {showComments && !loading && !noPdf && (
          <div className="mt-2 border border-white/10 rounded-xl overflow-hidden bg-black/40 backdrop-blur-sm animate-fadeIn">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-white/5">
              <span className="text-[12px] font-medium text-white/80">Commentaires</span>
              <button onClick={()=>setShowComments(false)} className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 flex flex-col gap-3 max-h-[260px] overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-2">
                <input
                  value={commentDraft}
                  onChange={e=>setCommentDraft(e.target.value)}
                  onKeyDown={e=>{ if(e.key==='Enter'){ addComment(); } }}
                  placeholder={user ? 'Écrire un commentaire' : 'Connectez-vous pour commenter'}
                  className="flex-1 text-[11px] bg-white/5 focus:bg-white/10 transition rounded px-3 py-2 outline-none text-white placeholder:text-white/30 border border-white/10 focus:border-emerald-400/40"
                  disabled={!user}
                />
                <button
                  onClick={addComment}
                  disabled={!commentDraft.trim() || !user || loadingComments}
                  className="text-[11px] px-3 py-2 rounded bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium"
                >Envoyer</button>
              </div>
              {comments.length === 0 && !loadingComments && (
                <div className="text-[11px] text-white/40 italic py-4 text-center">Aucun commentaire pour l'instant.</div>
              )}
              {comments.map(c => (
                <div key={c.id} className="group/comment relative flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 p-3 text-white/80 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-200/90">{c.uid === user?.id ? 'Vous' : 'Agent'}</span>
                    <span className="text-white/30 text-[10px]">{c.ts.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                  <p className="leading-snug whitespace-pre-wrap break-words">{c.txt}</p>
                  {user?.id === c.uid && (
                    <button onClick={()=>removeComment(c.id, c.uid)} className="opacity-0 group-hover/comment:opacity-100 absolute top-1 right-1 text-white/30 hover:text-red-300">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-[11px] text-red-400">{error}</p>}
        {likeError && <p className="text-[10px] text-amber-300 mt-1">{likeError}</p>}
      </div>
    </div>
  );
};

export default ProgrammePdfBanner;