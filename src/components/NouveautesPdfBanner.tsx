import React, { useEffect, useState } from 'react';
import { FileUp, Loader2, Download, RefreshCw, Sparkles } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';

type NovItem = { id:string; name:string; size:number; updatedAt:Date|null; storagePath?:string; url?:string|null; b64?:string|null };

const NouveautesPdfBanner: React.FC = () => {
  useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NovItem[]>([]);
  const [refreshKey, setRefreshKey] = useState<number>(0);

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
          snap.forEach(d => { const v:any=d.data(); docs.push({ id:d.id, name:String(v?.name||'Sans nom'), size:Number(v?.size||0), updatedAt: v?.updatedAt?.toDate? v.updatedAt.toDate(): null, storagePath:v?.storagePath, url: typeof v?.url==='string'? v.url : null, b64: typeof v?.data==='string'? v.data : null }); });
        } catch {
          const snap = await getDocs(col);
          snap.forEach(d => { const v:any=d.data(); if (v?.active){ docs.push({ id:d.id, name:String(v?.name||'Sans nom'), size:Number(v?.size||0), updatedAt: v?.updatedAt?.toDate? v.updatedAt.toDate(): null, storagePath:v?.storagePath, url: typeof v?.url==='string'? v.url : null, b64: typeof v?.data==='string'? v.data : null }); } });
          docs.sort((a,b)=> (b.updatedAt?.getTime()||0) - (a.updatedAt?.getTime()||0));
        }
        if (!alive) return;
        setItems(docs);
        setError(null);
      } catch (err:any){
        setError(err?.message || 'Erreur chargement PDF');
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  const isNew = (d: Date | null) => d ? (Date.now() - d.getTime()) < 24*60*60*1000 : false;

  return (
    <div id="nouveautes-pdf" className="group rounded-2xl relative overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_30%_15%,#065f46_0%,#031f18_55%,#010d0b_100%)]/80 shadow-[0_4px_18px_-4px_rgba(0,0,0,0.55)] backdrop-blur-sm">
      <div className="pointer-events-none absolute -top-24 -left-24 w-[320px] h-[320px] rounded-full bg-emerald-600/10 blur-3xl opacity-60" />
      <div className="relative p-5 flex flex-col gap-4">
        <header className="flex items-center gap-3">
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
        </header>

        {loading ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-xs text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</div>
            <div className="h-2 w-1/2 max-w-[260px] bg-white/10 rounded overflow-hidden"><div className="h-full w-1/2 animate-pulse bg-white/25" /></div>
            <div className="h-[380px] rounded-xl border border-white/10 bg-black/20 animate-pulse" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-[200px] flex flex-col items-center justify-center text-center border border-dashed border-white/15 rounded-xl bg-white/5 text-white/40">
            <p className="text-xs">Aucun PDF Nouveautés publié ou activé pour l'instant.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((it) => {
              // per-item derived preview URL
              const versionToken = it.updatedAt ? it.updatedAt.getTime() : (it.storagePath ? Number((it.storagePath.split('/').pop()||Date.now())) : Date.now());
              let previewUrl: string | null = null;
              if (typeof it.url === 'string' && it.url) {
                const sep = it.url.includes('?') ? '&' : '?';
                previewUrl = `${it.url}${sep}v=${versionToken}`;
              } else if (typeof it.b64 === 'string' && it.b64) {
                try {
                  const byteChars = atob(it.b64);
                  const byteNumbers = new Array(byteChars.length);
                  for (let i=0;i<byteChars.length;i++) byteNumbers[i] = byteChars.charCodeAt(i);
                  const byteArray = new Uint8Array(byteNumbers);
                  const blob = new Blob([byteArray], { type:'application/pdf' });
                  previewUrl = URL.createObjectURL(blob);
                } catch {}
              }
              return (
                <div key={it.id} className="relative group/pdf rounded-xl overflow-hidden border border-white/10 bg-black/40">
                  {previewUrl && <iframe src={previewUrl + (previewUrl.includes('#')?'&':'#') + 'toolbar=0&navpanes=0&scrollbar=0'} title={`Nouveautés ${it.name}`} className="w-full h-[480px] select-none"/>}
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    {typeof it.url === 'string' && it.url && (
                      <>
                        <button onClick={()=> setRefreshKey(Date.now())} className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md bg-black/55 hover:bg-black/75 text-white shadow border border-white/10">
                          <RefreshCw className="h-3.5 w-3.5" />
                          Recharger
                        </button>
                        <a href={it.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md bg-emerald-600/90 hover:bg-emerald-500 text-white font-medium shadow">
                          <Download className="h-3.5 w-3.5" /> Télécharger
                        </a>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>
    </div>
  );
};

export default NouveautesPdfBanner;
