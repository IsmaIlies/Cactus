import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

interface IncomingMsg { id:string; text:string; sender:string; channel:string; senderId:string; timestamp?:any; }

const MAX_LEN = 120;

const playPing = ()=>{
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime+0.15);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.5);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+0.55);
  } catch {}
};

const NewMessageNotifier: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [toast, setToast] = useState<IncomingMsg|null>(null);
  const firstLoadRef = useRef(true);
  const lastIdRef = useRef<string|undefined>(undefined);
  const suppressRef = useRef(false);

  // Supprimer toast après délai
  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=> setToast(null), 8000); return ()=> clearTimeout(t); },[toast]);

  useEffect(()=>{ suppressRef.current = location.pathname.includes('/teamchat'); },[location.pathname]);

  useEffect(()=>{
    if(!user) return; // wait auth
    const q = query(collection(db,'messages'), orderBy('timestamp','desc'), limit(1));
    const unsub = onSnapshot(q, snap=>{
      let newest: IncomingMsg | null = null;
      snap.forEach(d=>{ const data:any = d.data(); newest = { id:d.id, text:data.text||'', sender:data.sender||'—', channel:data.channel, senderId:data.senderId, timestamp:data.timestamp }; });
      if(!newest) return;
      const current = newest as IncomingMsg;
      if(firstLoadRef.current){ firstLoadRef.current=false; lastIdRef.current=current.id; return; }
      if(current.id===lastIdRef.current) return;
      lastIdRef.current=current.id;
      if(current.senderId=== (user as any).id) return; // ignore own
      if(suppressRef.current) return; // pas de popup sur page chat
      playPing();
      setToast(current);
    }, err=>{ console.warn('[Notifier] snapshot error', err); });
    return ()=>unsub();
  },[user]);

  if(!toast) return null;
  const short = toast.text.length>MAX_LEN ? toast.text.slice(0,MAX_LEN)+'…' : toast.text;

  return (
    <div className='fixed z-[999] bottom-6 right-6 max-w-sm'>
      <div className='relative group animate-[slideIn_.5s_ease]'>
        <div className='rounded-2xl shadow-2xl border border-cactus-300/70 bg-white/90 backdrop-blur px-5 py-4 flex flex-col gap-2 overflow-hidden ring-1 ring-cactus-400/40'>
          <div className='flex items-start gap-3'>
            <div className='w-9 h-9 rounded-full bg-cactus-600 text-white flex items-center justify-center text-sm font-bold shadow-inner'>💬</div>
            <div className='min-w-0 flex-1'>
              <p className='text-[11px] font-semibold uppercase tracking-wide text-cactus-500 flex items-center gap-1'>Nouveau message <span className='w-1.5 h-1.5 rounded-full bg-cactus-500 animate-pulse' /></p>
              <p className='text-sm font-semibold text-cactus-800 leading-snug truncate'>{toast.sender}</p>
              <p className='mt-1 text-[12px] text-cactus-700 leading-snug line-clamp-3 whitespace-pre-wrap break-words'>{short||'(Pièce jointe)'}</p>
            </div>
          </div>
          <div className='flex items-center gap-2 justify-end pt-1'>
            <button onClick={()=> setToast(null)} className='text-[10px] font-medium text-cactus-500 hover:text-cactus-700 px-2 py-1 rounded-md hover:bg-cactus-100 transition'>Fermer</button>
            <button onClick={()=>{ const r=(localStorage.getItem('activeRegion')||'FR').toLowerCase(); navigate(`/dashboard/${r}/teamchat`); setToast(null); }} className='text-[10px] font-semibold bg-cactus-600 hover:bg-cactus-700 text-white px-3 py-1 rounded-md shadow'>Ouvrir</button>
          </div>
          <div className='absolute inset-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_30%_20%,#16a34a_0%,transparent_60%)]' />
        </div>
      </div>
      <style>{`
        @keyframes slideIn { 0% { transform: translateY(20px) scale(.95); opacity:0;} 60% {opacity:1;} 100% { transform: translateY(0) scale(1); opacity:1;} }
      `}</style>
    </div>
  );
};

export default NewMessageNotifier;
