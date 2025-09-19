import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, Timestamp, setDoc, serverTimestamp, updateDoc, arrayUnion } from 'firebase/firestore';

type User = { id: string; name: string; lastActive?: number; status?: string };
type Message = { id?: string; tempId?: string; channel: string; sender: string; senderId: string; text: string; timestamp?: any; fileName?: string; fileType?: string; fileUrl?: string; participants?: string[]; readers?: string[]; pending?: boolean; error?: boolean; editedAt?: any };

const ACTIVE_REGION = ((localStorage.getItem('activeRegion') as 'FR'|'CIV') || 'FR').toLowerCase();
const PUBLIC_CHANNEL = 'public_' + ACTIVE_REGION;

interface ChatInputProps { value: string; disabled?: boolean; placeholder?: string; onChange:(v:string)=>void; onSend:()=>void; onFile:(f:File)=>void; textareaRef?: React.RefObject<HTMLTextAreaElement>; users: User[]; currentUserId?: string; }
const ChatInput: React.FC<ChatInputProps> = ({value,disabled,placeholder,onChange,onSend,onFile, textareaRef, users}) => {
  const fileRef = useRef<HTMLInputElement|null>(null);
  const localRef = textareaRef || useRef<HTMLTextAreaElement|null>(null);
  const actionsDisabled = disabled || !value.trim();
  // Mention autocomplete state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionSuggestions = useMemo(()=>{
    if(!mentionQuery) return [] as User[];
    const q = mentionQuery.toLowerCase();
    return users.filter(u=> u.name.toLowerCase().startsWith(q)).slice(0,8);
  },[mentionQuery, users]);

  const closeMention = ()=>{ setMentionOpen(false); setMentionQuery(""); setMentionIndex(0); };
  const applyMention = (user:User)=>{
    const el = localRef.current; if(!el) return;
    const pos = el.selectionStart;
    const textBefore = value.slice(0,pos);
    const match = textBefore.match(/(@[^\s@]{0,30})$/); // token at caret
    if(!match) return;
    const start = pos - match[1].length;
    const insertion = '@'+user.name+' ';
    const newVal = value.slice(0,start) + insertion + value.slice(pos);
    onChange(newVal);
    requestAnimationFrame(()=>{ if(localRef.current){ const np = start + insertion.length; localRef.current.selectionStart = localRef.current.selectionEnd = np; localRef.current.focus(); }});
    closeMention();
  };

  const handleKeyDown = (e:React.KeyboardEvent<HTMLTextAreaElement>)=>{
    if(mentionOpen){
      if(e.key==='ArrowDown'){ e.preventDefault(); setMentionIndex(i=> (i+1) % (mentionSuggestions.length||1)); return; }
      if(e.key==='ArrowUp'){ e.preventDefault(); setMentionIndex(i=> (i-1 + (mentionSuggestions.length||1)) % (mentionSuggestions.length||1)); return; }
      if(e.key==='Enter'){ if(mentionSuggestions[mentionIndex]){ e.preventDefault(); applyMention(mentionSuggestions[mentionIndex]); return; } }
      if(e.key==='Tab'){ if(mentionSuggestions[mentionIndex]){ e.preventDefault(); applyMention(mentionSuggestions[mentionIndex]); return; } }
      if(e.key==='Escape'){ e.preventDefault(); closeMention(); return; }
    }
    if(e.key==='Enter' && !e.shiftKey && !mentionOpen){ e.preventDefault(); onSend(); }
  };

  const detectMention = ()=>{
    if(disabled) return; const el = localRef.current; if(!el) return;
    const pos = el.selectionStart; const textBefore = value.slice(0,pos);
    const match = textBefore.match(/(@[^\s@]{0,30})$/);
    if(match){
      const q = match[1].slice(1); // remove @
      if(q.length===0){ setMentionOpen(true); setMentionQuery(""); setMentionIndex(0); }
      else { setMentionQuery(q); setMentionOpen(true); setMentionIndex(0); }
    } else {
      if(mentionOpen) closeMention();
    }
  };

  useEffect(()=>{ detectMention(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [value]);
  return (
    <div className='border-t border-cactus-200 bg-white/95 backdrop-blur-sm relative'>
      <div className='px-4 pt-2 pb-1 flex items-center gap-2 flex-wrap border-b border-cactus-100'>
        <div className='flex items-center gap-1 ml-2'>
          {['👍','🔥','🎯','✅','😊','🙏'].map(e=>(
            <button key={e} className='text-base leading-none px-2 py-1 rounded-md bg-cactus-100 hover:bg-cactus-200 text-cactus-700 transition disabled:opacity-40' disabled={disabled} onClick={()=>onChange(value ? value+ ' ' + e : e)}>{e}</button>
          ))}
        </div>
      </div>
      <div className='px-4 pb-4 pt-2'>
        <div className='flex items-end gap-3'>
          <div className='flex-1 relative'>
            <textarea
              ref={localRef}
              rows={1}
              className='w-full resize-none max-h-40 min-h-[64px] rounded-xl border border-cactus-300 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cactus-400/50 focus:border-cactus-500 transition disabled:opacity-50 shadow-inner'
              disabled={disabled}
              placeholder={placeholder}
              value={value}
              onChange={e=>onChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            {mentionOpen && (
              <div className='absolute left-2 bottom-[100%] mb-2 z-50 w-56 max-h-64 overflow-y-auto rounded-lg border border-cactus-300 bg-white shadow-xl text-sm divide-y divide-cactus-100 animate-fade-in'>
                {mentionSuggestions.length===0 && <div className='px-3 py-2 text-[11px] text-cactus-400'>Tape un nom…</div>}
                {mentionSuggestions.map((u,i)=>(
                  <button
                    key={u.id}
                    onMouseDown={(ev)=>{ ev.preventDefault(); applyMention(u); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition ${i===mentionIndex? 'bg-cactus-600 text-white':'hover:bg-cactus-50 text-cactus-700'}`}
                  >
                    <span className='w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white' style={{background: 'var(--cactus-accent,#059669)'}}>{u.name[0]?.toUpperCase()}</span>
                    <span className='truncate text-[12px] font-medium'>{u.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <input ref={fileRef} type='file' className='hidden' onChange={e=>{const f=e.target.files?.[0]; if(f) onFile(f); if(fileRef.current) fileRef.current.value='';}} />
            <button onClick={()=>fileRef.current?.click()} disabled={disabled} className='h-11 w-11 flex items-center justify-center rounded-xl border border-cactus-300 text-cactus-600 hover:bg-cactus-100 active:scale-95 transition disabled:opacity-40'>📎</button>
            <button onClick={onSend} disabled={actionsDisabled} className='h-11 px-6 rounded-xl font-semibold bg-cactus-600 text-white hover:bg-cactus-700 active:scale-95 shadow disabled:opacity-40 flex items-center gap-2'>
              <span>Envoyer</span>
              <span className='text-lg'>➡️</span>
            </button>
          </div>
        </div>
        <p className='text-[11px] text-cactus-400 mt-2 font-medium'>Entrée pour envoyer • Maj+Entrée pour nouvelle ligne</p>
      </div>
    </div>
  );
};

const TeamChatPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User|null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string|null>(null); // if set => private mode
  const isPrivate = !!selectedUser;
  const [userSearch, setUserSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState<number>(-1);
  // Flux séparés pour éviter état incohérent interne Firestore (erreur Unexpected state)
  const [publicMessages, setPublicMessages] = useState<Message[]>([]);
  const [privateMessages, setPrivateMessages] = useState<Message[]>([]);
  // messages combinés (memoisé)
  const messages = useMemo(()=>{
    if(!isPrivate) return publicMessages;
    return privateMessages;
  },[publicMessages, privateMessages, isPrivate]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [lastRead, setLastRead] = useState<number>(()=> Date.now());
  const [now, setNow] = useState<number>(()=> Date.now());
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [recentPrivates, setRecentPrivates] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<{url:string; name?:string}|null>(null);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>("");
  const inputRef = useRef<HTMLTextAreaElement|null>(null);
  const typingRef = useRef<any>(null);
  const channelKeyRef = useRef<string>('');
  const messagesEndRef = useRef<HTMLDivElement|null>(null);

  useEffect(()=>{
    const unsubAuth = auth.onAuthStateChanged(u=>{ if(u) setCurrentUser({id:u.uid, name: u.displayName || u.email || 'Utilisateur'}); else setCurrentUser(null); });
  const unsubUsers = onSnapshot(collection(db,'users'), snap => {
      const mapped = snap.docs.map(d=>{
        const data:any = d.data();
    const compositeName = data.name || [data.firstName, data.lastName].filter(Boolean).join(' ').trim();
    const lastActiveMs = data.lastActive?.toMillis ? data.lastActive.toMillis() : (typeof data.lastActive === 'number'? data.lastActive : 0);
    return { id:d.id, name: compositeName || 'Utilisateur', lastActive:lastActiveMs, status:data.status || 'online' } as User;
      });
      setUsers(mapped);
      // If currentUser name is fallback and we find better info update it
      setCurrentUser(prev=>{ if(!prev) return prev; if(prev.name==='Utilisateur'){ const match=mapped.find(m=>m.id===prev.id); if(match) return {...prev, name: match.name}; } return prev; });
    });

    return ()=>{unsubAuth();unsubUsers();};
  },[]);

  // Mise à jour présence (lastActive) – hook au niveau racine
  useEffect(()=>{
    if(!currentUser) return;
    const userDoc = doc(db,'users', currentUser.id);
    const touch = () => setDoc(userDoc, { lastActive: serverTimestamp() }, {merge:true}).catch(()=>{});
    touch();
    const interval = setInterval(touch, 30000);
    const onVis = () => { if(document.visibilityState==='visible') touch(); };
    window.addEventListener('visibilitychange', onVis);
    return ()=>{ clearInterval(interval); window.removeEventListener('visibilitychange', onVis); };
  },[currentUser]);

  // Tick pour rafraîchir l'affichage relatif (présence)
  useEffect(()=>{ const id = setInterval(()=> setNow(Date.now()), 30000); return ()=> clearInterval(id); },[]);

  // Listener messages publics (indépendant)
  useEffect(()=>{
    if(!currentUser) return; // besoin auth
    const col = collection(db,'messages');
    setLoading(true);
    const unsub = onSnapshot(
      query(col, where('channel','==', PUBLIC_CHANNEL)),
      snap=>{
        const list = snap.docs.map(d=>({id:d.id, ...(d.data() as any)} as Message))
          .sort((a,b)=>(a.timestamp?.toMillis?.()||0)-(b.timestamp?.toMillis?.()||0));
        setPublicMessages(list);
        if(!isPrivate) setLoading(false);
      },
      err=>{ console.error('Listener public error', err); setLoading(false); }
    );
    return ()=>unsub();
  },[currentUser]);

  // Listener privé (séparé pour éviter agrégations multiples)
  useEffect(()=>{
    if(!currentUser || !isPrivate || !selectedUser){ setPrivateMessages([]); if(isPrivate) setLoading(false); return; }
    const col = collection(db,'messages');
    setLoading(true);
    const privateChannelId = [currentUser.id, selectedUser].sort().join('_');
    let unsub: (()=>void)|null = null;
    let fallback = false;
    const attachChannel = () => {
      unsub = onSnapshot(
        query(col, where('channel','==', privateChannelId)),
        snap=>{
          const list = snap.docs.map(d=>({id:d.id, ...(d.data() as any)} as Message))
            .sort((a,b)=>(a.timestamp?.toMillis?.()||0)-(b.timestamp?.toMillis?.()||0));
          setPrivateMessages(list);
          setLoading(false);
        },
        err=>{
          console.error('Listener privé (channel) erreur', err);
          if(!fallback){
            fallback = true;
            attachParticipantsFallback();
          } else setLoading(false);
        }
      );
    };
    const attachParticipantsFallback = () => {
      unsub = onSnapshot(
        query(col, where('participants','array-contains', currentUser.id)),
        snap=>{
          const list = snap.docs
            .map(d=>({id:d.id, ...(d.data() as any)} as Message))
            .filter(m=> Array.isArray(m.participants) && m.participants.includes(selectedUser))
            .sort((a,b)=>(a.timestamp?.toMillis?.()||0)-(b.timestamp?.toMillis?.()||0));
          setPrivateMessages(list);
          setLoading(false);
        },
        err=>{ console.error('Listener privé (participants fallback) erreur', err); setLoading(false); }
      );
    };
    attachChannel();
    return ()=>{ if(unsub) unsub(); };
  },[currentUser, isPrivate, selectedUser]);

  useEffect(()=>{ messagesEndRef.current?.scrollIntoView({behavior:'smooth'}); },[messages]);
  useEffect(()=>{ const el=document.getElementById('chat-zone'); if(!el) return; const onScroll=()=>{ const atBottom= el.scrollHeight - el.scrollTop - el.clientHeight < 10; setIsUserScrolling(!atBottom); }; el.addEventListener('scroll', onScroll); return ()=> el.removeEventListener('scroll', onScroll); },[]);

  // Channel key tracking
  useEffect(()=>{
    const channel = !isPrivate? PUBLIC_CHANNEL : (currentUser && selectedUser? [currentUser.id, selectedUser].sort().join('_') : '');
    if(!channel) return; channelKeyRef.current='chat_lastread_'+channel; const stored= localStorage.getItem(channelKeyRef.current); if(stored) setLastRead(parseInt(stored)||Date.now());
  },[isPrivate, currentUser, selectedUser]);

  // Auto mark read
  // Marquage lu + read receipts
  const markTimerRef = useRef<any>(null);
  useEffect(()=>{ const zone=document.getElementById('chat-zone'); if(!zone) return; const atBottom= zone.scrollHeight - zone.scrollTop - zone.clientHeight < 10; if(atBottom && messages.length){ const newest= messages[messages.length-1]?.timestamp?.toMillis?.()||Date.now(); setLastRead(newest); if(channelKeyRef.current) localStorage.setItem(channelKeyRef.current, String(newest));
    if(currentUser){
      const unreadToMark = messages.filter(m=> m.senderId!==currentUser.id && (!m.readers || !m.readers.includes(currentUser.id))); // mark all visible unread
      if(unreadToMark.length){
        if(markTimerRef.current) clearTimeout(markTimerRef.current);
        markTimerRef.current = setTimeout(()=>{
          unreadToMark.slice(0,40).forEach(m=>{ if(m.id) updateDoc(doc(db,'messages', m.id), { readers: arrayUnion(currentUser.id) }).catch(()=>{}); });
        }, 350);
      }
    }
  } },[messages, currentUser]);

  // Typing subscription
  useEffect(()=>{ if(!currentUser) return; const unsub= onSnapshot(collection(db,'typingStatus'), snap=>{ const now=Date.now(); const channel= !isPrivate? PUBLIC_CHANNEL : (currentUser && selectedUser? [currentUser.id, selectedUser].sort().join('_'): null); const list = snap.docs.map(d=>d.data() as any).filter(d=> d.userId!==currentUser.id && d.isTyping && d.updatedAt?.toMillis && (now-d.updatedAt.toMillis())<6000 && d.channel===channel); setTypingUsers(list.map(l=> l.userName || 'Quelqu\u2019un')); }); return ()=>unsub(); },[currentUser, isPrivate, selectedUser]);

  const sendTyping = useCallback((active:boolean)=>{ if(!currentUser) return; const channel= !isPrivate? PUBLIC_CHANNEL : (currentUser && selectedUser? [currentUser.id, selectedUser].sort().join('_'): PUBLIC_CHANNEL); setDoc(doc(db,'typingStatus', currentUser.id), { userId: currentUser.id, userName: currentUser.name, channel, isTyping: active, updatedAt: serverTimestamp() }, {merge:true}).catch(()=>{}); },[currentUser, isPrivate, selectedUser]);

  const handleSend = async()=>{
    if(!currentUser || !input.trim()) return;
    let channel=PUBLIC_CHANNEL; let participants:string[]|undefined; let participantA: string|undefined; let participantB: string|undefined;
    if(isPrivate && selectedUser){ const pair=[currentUser.id, selectedUser].sort(); channel=pair.join('_'); participants=pair; participantA=pair[0]; participantB=pair[1]; }
    const textContent = input.trim(); setInput(''); sendTyping(false);
    const tempId = 'tmp_'+Date.now()+Math.random().toString(36).slice(2);
    const optimistic: Message = { tempId, channel, sender:currentUser.name, senderId:currentUser.id, text:textContent, timestamp:{ toMillis:()=>Date.now(), toDate:()=> new Date() }, participants, readers:[currentUser.id], pending:true } as any;
    if(isPrivate) setPrivateMessages(prev=>[...prev, optimistic]); else setPublicMessages(prev=>[...prev, optimistic]);
    if(isPrivate && selectedUser) setRecentPrivates(prev=> [selectedUser, ...prev.filter(p=>p!==selectedUser)].slice(0,6));
    try {
      await addDoc(collection(db,'messages'), {channel, sender:currentUser.name, senderId:currentUser.id, text:textContent, timestamp:Timestamp.now(), readers:[currentUser.id], ...(participants?{participants}: {}), ...(participantA?{participantA, participantB}: {})});
    } catch(e){ console.error('Erreur envoi message', e); const markErr=(arr:Message[])=> arr.map(m=> m.tempId===tempId? {...m, error:true, pending:false}: m); if(isPrivate) setPrivateMessages(markErr); else setPublicMessages(markErr); }
  };
  const handleFile = async(file:File)=>{
    if(!currentUser) return;
    let channel=PUBLIC_CHANNEL; let participants:string[]|undefined; let participantA:string|undefined; let participantB:string|undefined;
    if(isPrivate && selectedUser){ const pair=[currentUser.id, selectedUser].sort(); channel=pair.join('_'); participants=pair; participantA=pair[0]; participantB=pair[1]; }
    const reader=new FileReader();
    reader.onload = async ev=>{
      const fileUrl = ev.target?.result as string;
      const isImg = file.type.startsWith('image/');
      const tempId='tmp_'+Date.now()+Math.random().toString(36).slice(2);
      const optimistic: Message = { tempId, channel, sender:currentUser.name, senderId:currentUser.id, text:isImg?'[Image]':`[Fichier] ${file.name}`, fileName:file.name, fileType:file.type, fileUrl, timestamp:{ toMillis:()=>Date.now(), toDate:()=> new Date() }, readers:[currentUser.id], participants, pending:true } as any;
      if(isPrivate) setPrivateMessages(p=>[...p, optimistic]); else setPublicMessages(p=>[...p, optimistic]);
      try {
        await addDoc(collection(db,'messages'), { channel, sender:currentUser.name, senderId:currentUser.id, text:isImg?'[Image]':`[Fichier] ${file.name}`, fileName:file.name, fileType:file.type, fileUrl, timestamp:Timestamp.now(), readers:[currentUser.id], ...(participants?{participants}: {}), ...(participantA?{participantA, participantB}: {})});
      } catch(e){ console.error('Erreur fichier message', e); const markErr=(arr:Message[])=> arr.map(m=> m.tempId===tempId? {...m, error:true, pending:false}: m); if(isPrivate) setPrivateMessages(markErr); else setPublicMessages(markErr); }
    };
    reader.readAsDataURL(file);
  };
  const handleDelete = async(id:string)=>{ try{ await deleteDoc(doc(db,'messages',id)); }catch(e){ console.error(e);} };
  const startEdit = (m:Message)=>{ if(m.id){ setEditingId(m.id); setEditingValue(m.text); } };
  const cancelEdit = ()=>{ if(savingEdit) return; setEditingId(null); setEditingValue(''); };
  const saveEdit = async()=>{
    if(!editingId || !editingValue.trim() || savingEdit) return; setSavingEdit(true);
    try {
      await updateDoc(doc(db,'messages', editingId), { text: editingValue.trim(), editedAt: serverTimestamp() });
      // Optimistic local update (optional, snapshot will refresh anyway)
      const applyLocal = (arr:Message[])=> arr.map(m=> m.id===editingId? {...m, text: editingValue.trim(), editedAt:{ toDate:()=> new Date(), toMillis:()=>Date.now() }}: m);
      setPublicMessages(prev=> applyLocal(prev));
      setPrivateMessages(prev=> applyLocal(prev));
      setEditingId(null); setEditingValue('');
    } catch(e){ console.error('Erreur édition', e);} finally { setSavingEdit(false);} };

  const privateChannelId = (isPrivate && selectedUser && currentUser) ? [currentUser.id, selectedUser].sort().join('_') : null;
  const visible = useMemo(()=>{
    if(!isPrivate) return messages.filter(m=> m.channel===PUBLIC_CHANNEL);
    if(!privateChannelId || !currentUser || !selectedUser) return [];
    const list = messages.filter(m=>{
      if(m.channel===privateChannelId) return true;
      if(Array.isArray(m.participants) && m.participants.length===2 && m.participants.includes(currentUser.id) && m.participants.includes(selectedUser)) return true;
      return false;
    });
    if(list.length===0){
      console.debug('DEBUG private visible empty', {privateChannelId, totalMessages: messages.length, sample: messages.slice(0,5).map(x=>({id:x.id, channel:x.channel, participants:x.participants}))});
    }
    return list;
  },[isPrivate, privateChannelId, messages, currentUser, selectedUser]);

  // Accessible live region announcement for screen readers (new incoming messages)
  const announceRef = useRef<{init:boolean; lastCount:number}>({init:false, lastCount:0});
  useEffect(()=>{
    const count = visible.length;
    if(!announceRef.current.init){ announceRef.current.init=true; announceRef.current.lastCount=count; return; }
    if(count > announceRef.current.lastCount){
      const newMsgs = visible.slice(announceRef.current.lastCount);
      const candidate = newMsgs.reverse().find(m=> m.senderId!==currentUser?.id);
      if(candidate){ setAriaAnnouncement(`Nouveau message de ${candidate.sender}`); }
      announceRef.current.lastCount = count;
    }
  },[visible, currentUser]);

  // Avatar / color helpers
  const colorFor = useCallback((id:string)=>{
    let hash=0; for(let i=0;i<id.length;i++){ hash = id.charCodeAt(i) + ((hash<<5)-hash); }
    const h = Math.abs(hash)%360; return `hsl(${h} 65% 45%)`;
  },[]);

  const initials = (name:string)=> name.split(/\s+/).slice(0,2).map(p=>p[0]?.toUpperCase()).join('');

  // Présence : couleur + libellé "il y a X"
  const formatAgo = useCallback((last?:number)=>{
    if(!last) return '—';
    const diff = now - last;
    if(diff < 60_000) return 'maintenant';
    if(diff < 3_600_000){ const m=Math.floor(diff/60_000); return `il y a ${m} min`; }
    if(diff < 86_400_000){ const h=Math.floor(diff/3_600_000); return `il y a ${h} h`; }
    const d = Math.floor(diff/86_400_000); return d===1? 'hier' : `il y a ${d} j`;
  },[now]);

  const presenceColor = useCallback((last?:number)=>{
    if(!last) return 'bg-gray-300';
    const diff = now - last;
    if(diff < 60_000) return 'bg-green-500 shadow-green-400/40'; // en ligne
    if(diff < 5*60_000) return 'bg-amber-400 shadow-amber-300/40'; // récent
    return 'bg-gray-300';
  },[now]);

  // Suggestions filtrées (recherche user)
  const filteredSuggestions = useMemo(()=>{
    const base = users.filter(u=> u.id!==currentUser?.id && u.name.toLowerCase().includes(userSearch.toLowerCase()));
    return base.slice(0,12);
  },[users, userSearch, currentUser]);

  // Group messages by date + sender bursts
  const grouped = useMemo(()=>{
    const out: { key:string; dateLabel?:string; items: Message[] }[] = [];
    let lastSender: string|undefined; let lastTime: number|undefined; let day: string|undefined;
    visible.forEach(m=>{
      const ts = m.timestamp?.toMillis?.() || 0;
      const d = m.timestamp?.toDate?.();
      const dayLabel = d ? d.toLocaleDateString() : '';
      if(day !== dayLabel){
        day = dayLabel; lastSender=undefined; lastTime=undefined;
        out.push({ key:'date-'+dayLabel+'-'+ts, dateLabel: dayLabel, items: [] });
      }
      const burstGap = ts - (lastTime||0);
      if(m.senderId===lastSender && burstGap < 5*60*1000 && out.length>0){
        out[out.length-1].items.push(m);
      } else {
        out.push({ key: 'grp-'+ts+'-'+m.senderId, items:[m] });
        lastSender = m.senderId; lastTime = ts;
      }
    });
    return out;
  },[visible]);

  // Determine if a message is unread (for badge)
  const isUnread = useCallback((m:Message)=> !m.senderId || !lastRead? false : (m.timestamp?.toMillis?.()||0) > lastRead, [lastRead]);

  // premier message non lu (hors messages de moi)
  const firstUnreadId = useMemo(()=>{
    for(const m of visible){ if(m.senderId!==currentUser?.id && isUnread(m)) return m.id||null; }
    return null;
  },[visible, currentUser, isUnread]);

  const privateBanner = isPrivate && !selectedUser ? (
    <div className='m-6 rounded-xl border-2 border-dashed border-cactus-300 bg-white/70 px-6 py-8 text-center shadow-sm'>
      <p className='text-cactus-500 font-medium'>Sélectionne un collaborateur dans la colonne de gauche pour démarrer une conversation privée.</p>
    </div>
  ) : null;

  return (
    <>
    <div className='flex h-screen bg-gradient-to-br from-cactus-50 via-white to-cactus-100 text-cactus-800 overflow-hidden'>
      {/* Sidebar left fixed */}
      <aside className='w-72 h-full flex flex-col border-r border-cactus-200 bg-white/90 backdrop-blur-sm relative shrink-0'>
        <div className='px-5 py-4 border-b border-cactus-200'>
          <h1 className='text-lg font-bold tracking-tight flex items-center gap-2'><span className='text-cactus-600'>💬</span> Chat</h1>
          <div className='mt-4 relative'>
            <input
              value={userSearch}
              onChange={e=>{ setUserSearch(e.target.value); setShowSuggestions(true); setSuggestionIndex(-1); }}
              onFocus={()=> { setShowSuggestions(true); if(userSearch) setSuggestionIndex(-1); }}
              onKeyDown={e=>{
                if(e.key==='ArrowDown'){
                  if(!showSuggestions) setShowSuggestions(true);
                  setSuggestionIndex(prev=>{
                    const len = filteredSuggestions.length; if(len===0) return -1; return (prev+1)%len; });
                  e.preventDefault();
                } else if(e.key==='ArrowUp'){
                  setSuggestionIndex(prev=>{
                    const len = filteredSuggestions.length; if(len===0) return -1; return (prev-1+len)%len; });
                  e.preventDefault();
                } else if(e.key==='Enter'){
                  if(suggestionIndex>=0 && filteredSuggestions[suggestionIndex]){
                    const u = filteredSuggestions[suggestionIndex];
                    setSelectedUser(u.id); setUserSearch(''); setShowSuggestions(false); setSuggestionIndex(-1);
                    e.preventDefault();
                  }
                } else if(e.key==='Escape'){
                  setShowSuggestions(false); setSuggestionIndex(-1);
                }
              }}
              placeholder='Rechercher un utilisateur...'
              className='w-full rounded-lg border border-cactus-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-cactus-400/40 focus:border-cactus-500 transition shadow-sm'
              aria-autocomplete='list'
              aria-expanded={showSuggestions}
            />
            {showSuggestions && userSearch.trim() && (
              <div className='absolute z-40 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-cactus-200 bg-white shadow-lg divide-y divide-cactus-100'>
                {filteredSuggestions.map((u,i)=> (
                  <button
                    key={u.id}
                    onClick={()=>{ setSelectedUser(u.id); setUserSearch(''); setShowSuggestions(false); setSuggestionIndex(-1); }}
                    className={`w-full text-left px-3 py-2 flex items-center gap-3 transition ${i===suggestionIndex? 'bg-cactus-600 text-white':'hover:bg-cactus-50'}`}
                  >
                    <div style={{background: colorFor(u.id)}} className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${i===suggestionIndex? 'ring-2 ring-white/60':''}`}>{initials(u.name)}</div>
                    <span className={`text-xs font-medium truncate ${i===suggestionIndex? 'text-white':'text-cactus-700'}`}>{u.name}</span>
                  </button>
                ))}
                {filteredSuggestions.length===0 && (
                  <div className='px-3 py-2 text-[10px] text-cactus-400'>Aucun résultat</div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className='flex-1 overflow-y-auto px-5 py-5 space-y-6 custom-scrollbar'>
          <div className='space-y-3'>
            <div className='text-[10px] font-semibold uppercase tracking-wide text-cactus-500'>Conversation</div>
            <div className='rounded-lg border border-cactus-200 bg-white/80 p-3 shadow-sm relative overflow-hidden'>
              <div className='absolute -right-4 -top-4 w-14 h-14 bg-cactus-100 rounded-full opacity-50' />
              <div className='flex items-center gap-2 relative'>
                <div className='w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow' style={{background:'#059669'}}>🌵</div>
                <div className='leading-tight'>
                  <p className='text-[11px] font-semibold text-cactus-700'>{!selectedUser? 'Channel public':'Privé'}</p>
                  <p className='text-[9px] text-cactus-500 mt-0.5'>{!selectedUser? 'Tous les collaborateurs':'2 participants'}</p>
                </div>
              </div>
              {selectedUser ? (
                <div className='mt-3 flex gap-2'>
                  <button onClick={()=> setSelectedUser(null)} className='flex-1 text-[10px] font-semibold bg-white text-cactus-700 rounded-md py-1.5 hover:bg-cactus-50 transition shadow-sm'>Public</button>
                  <button onClick={()=>{ const input=document.querySelector<HTMLInputElement>('aside input'); input?.focus(); }} className='text-[10px] font-semibold px-2.5 rounded-md border border-cactus-300 hover:bg-cactus-100 transition text-cactus-600 bg-white'>Changer</button>
                </div>
              ) : (
                <p className='mt-2 text-[10px] leading-snug text-cactus-500'>Recherche un nom pour démarrer un privé.</p>
              )}
            </div>
          </div>
          <div className='space-y-3'>
            <div className='text-[10px] font-semibold uppercase tracking-wide text-cactus-500'>Utilisateurs</div>
            <ul className='space-y-1'>
              {users.filter(u=> {
                if(u.id===currentUser?.id) return false;
                const last = u.lastActive || 0;
                const THIRTY_DAYS = 30*24*60*60*1000;
                // cacher si plus de 30j et qu'on ne souhaite pas afficher les inactifs
                if(!showInactive && last && (now - last > THIRTY_DAYS)) return false;
                // si jamais actif (last=0) on ne montre que si showInactive actif
                if(!showInactive && !last) return false;
                return true;
              }).map(u=>{
                const active = selectedUser===u.id;
                return (
                  <li key={u.id}>
                    <button onClick={()=> setSelectedUser(active? null : u.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition ${active? 'bg-cactus-600 text-white border-cactus-600 shadow': 'bg-white/70 border-cactus-200 hover:bg-cactus-50'}`}>
                      <div className='relative'>
                        <div style={{background: active? 'rgba(255,255,255,0.25)': colorFor(u.id)}} className='w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm'>{initials(u.name)}</div>
                        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${presenceColor(u.lastActive)} shadow`} />
                      </div>
                      <div className='flex-1 min-w-0'>
                        <div className='truncate text-xs font-medium leading-tight'>{u.name}</div>
                        <div className={`text-[9px] ${active? 'text-white/70':'text-cactus-400'} leading-tight`}>{formatAgo(u.lastActive)}</div>
                      </div>
                      {active && <span className='text-[9px] font-semibold bg-white/25 px-2 py-0.5 rounded-full uppercase tracking-wide'>Privé</span>}
                    </button>
                  </li>
                );
              })}
              {(()=>{
                const THIRTY_DAYS = 30*24*60*60*1000;
                const hiddenInactive = users.filter(u=>{
                  if(u.id===currentUser?.id) return false;
                  const last = u.lastActive || 0;
                  // inactif = last=0 ou >30j
                  if(!last) return true;
                  return now - last > THIRTY_DAYS;
                });
                const visibleCount = users.filter(u=>{
                  if(u.id===currentUser?.id) return false;
                  const last = u.lastActive || 0;
                  if(!showInactive){
                    if(!last) return false;
                    if(now - last > THIRTY_DAYS) return false;
                  }
                  return true;
                }).length;
                return (
                  <>
                    {visibleCount===0 && hiddenInactive.length===0 && (
                      <li className='text-[11px] text-cactus-400 px-1'>Aucun autre utilisateur.</li>
                    )}
                    {visibleCount===0 && hiddenInactive.length>0 && !showInactive && (
                      <li className='text-[11px] text-cactus-400 px-1'>Tous les utilisateurs sont inactifs.</li>
                    )}
                    {hiddenInactive.length>0 && (
                      <li>
                        <button onClick={()=> setShowInactive(s=>!s)} className='mt-2 w-full text-[10px] font-semibold tracking-wide uppercase bg-white/60 hover:bg-cactus-50 border border-cactus-300 text-cactus-600 rounded-md py-1.5 transition shadow-sm'>
                          {showInactive ? 'Masquer inactifs' : `Afficher inactifs (${hiddenInactive.length})`}
                        </button>
                      </li>
                    )}
                  </>
                );
              })()}
            </ul>
          </div>
          <div>
            <div className='text-[10px] font-semibold uppercase tracking-wide text-cactus-500 mb-3'>Astuce</div>
            <div className='rounded-lg border border-cactus-200 bg-white/60 p-3 text-[11px] leading-relaxed text-cactus-600'>
              Tape <span className='font-semibold text-cactus-700'>@nom</span> dans un message pour mentionner quelqu'un.
              <br/>Maj+Entrée = nouvelle ligne.
            </div>
          </div>
        </div>
        <div className='px-5 py-3 border-t border-cactus-200 text-[10px] text-cactus-400'>Connecté:<br/><span className='font-medium text-cactus-600'>{currentUser?.name || 'Invité'}</span></div>
      </aside>
  <main className='flex-1 flex flex-col relative min-w-0'>
        {/* Header */}
        <div className='h-20 px-8 flex items-center justify-between border-b border-cactus-200 bg-white/80 backdrop-blur-sm gap-8'>
          <div className='flex items-center gap-3'>
            <button onClick={()=>navigate('/dashboard')} className='group inline-flex items-center gap-2 text-cactus-600 hover:text-cactus-700 text-xs font-semibold px-3 py-2 rounded-lg border border-cactus-300 hover:bg-cactus-50 active:scale-95 transition shadow-sm'>
              <span className='text-base leading-none group-hover:-translate-x-0.5 transition'>←</span>
              <span>Dashboard</span>
            </button>
          </div>
          <div className='flex flex-col'>
            <h2 className='text-xl font-bold tracking-tight'>{!isPrivate ? 'Channel public' : (selectedUser ? `Privé avec ${(users.find(u=>u.id===selectedUser)?.name)||'…'}` : 'Privé')}</h2>
            <div className='flex items-center gap-3 mt-1'>
              <span className='text-[11px] font-medium text-cactus-500'>{visible.length} messages</span>
              {isPrivate && selectedUser && <span className='text-[10px] font-semibold uppercase tracking-wide bg-cactus-600 text-white px-2 py-0.5 rounded'>Confidentiel</span>}
              {isPrivate && <button onClick={()=> setSelectedUser(null)} className='flex items-center gap-1 text-[11px] font-medium text-cactus-500 hover:text-cactus-700 transition'>
                <span className='inline-block -ml-1 text-base'>←</span> Public
              </button>}
            </div>
          </div>
          <div className='w-[140px]' />
        </div>
        {/* Messages Area */}
  <div id='chat-zone' className='flex-1 overflow-y-auto relative bg-gradient-to-b from-white to-cactus-50 custom-scrollbar'>
          {privateBanner}
          {loading && (
            <div className='px-8 py-8 space-y-5 animate-pulse'>
              {Array.from({length:6}).map((_,i)=>(
                <div key={i} className='flex gap-3 max-w-xl'>
                  <div className='w-10 h-10 rounded-full bg-cactus-200' />
                  <div className='flex-1 space-y-2'>
                    <div className='h-3 w-24 bg-cactus-200 rounded' />
                    <div className='h-3 w-56 bg-cactus-100 rounded' />
                    <div className='h-3 w-40 bg-cactus-100 rounded' />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && visible.length===0 && !isPrivate && (
            <div className='px-8 py-16 text-center'>
              <div className='inline-flex flex-col items-center gap-4 px-8 py-10 rounded-2xl border-2 border-dashed border-cactus-300 bg-white/70 backdrop-blur-sm'>
                <span className='text-4xl'>🌵</span>
                <p className='text-sm font-medium text-cactus-500 max-w-xs'>Bienvenue dans le channel public. Lance la discussion avec un premier message.</p>
              </div>
            </div>
          )}
          {/* Render groups */}
          <div className='px-8 py-6 flex flex-col gap-5'>
            {grouped.map(group=> group.dateLabel ? (
              <div key={group.key} className='flex items-center gap-3 my-2'>
                <div className='flex-1 h-px bg-gradient-to-r from-transparent via-cactus-200 to-transparent' />
                <span className='text-[11px] font-semibold text-cactus-500 bg-cactus-100 px-3 py-1 rounded-full border border-cactus-200 shadow-sm'>{group.dateLabel}</span>
                <div className='flex-1 h-px bg-gradient-to-l from-transparent via-cactus-200 to-transparent' />
              </div>
            ) : (
              <div key={group.key} className='flex items-start gap-3 group/message'>
                {/* Avatar for first message in group */}
                <div className='pt-1'>
                  <div style={{background: colorFor(group.items[0].senderId)}} className='w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md shrink-0'>{initials(group.items[0].sender)}</div>
                </div>
                <div className='flex-1 min-w-0 space-y-1'>
                  <div className='flex items-center gap-2'>
                    <span className='text-xs font-bold tracking-wide uppercase text-cactus-600'>{group.items[0].sender}</span>
                    {group.items[0].timestamp && <span className='text-[10px] font-medium text-cactus-400'>{group.items[0].timestamp.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>}
                    {currentUser?.id===group.items[0].senderId && <span className='text-[10px] font-medium bg-cactus-600/10 text-cactus-600 px-1.5 py-0.5 rounded'>Moi</span>}
                  </div>
                  {group.items.map((m,idx)=>{
                    const mine = currentUser?.id===m.senderId;
                    const unread = !mine && isUnread(m);
                    // mention highlight logic: only highlight if matches a known user name; stronger highlight if current user
                    const nameMap = users.reduce<Record<string, User>>((acc,u)=>{ acc[u.name.toLowerCase()] = u; return acc; }, {});
                    return (
                      <React.Fragment key={m.id || idx}>
                        {firstUnreadId && firstUnreadId===m.id && (
                          <div className='flex items-center gap-3 my-3 -ml-1 animate-fade-in'>
                            <div className='flex-1 h-px bg-gradient-to-r from-transparent via-cactus-300 to-transparent' />
                            <span className='text-[10px] font-semibold uppercase tracking-wide bg-cactus-600 text-white px-2 py-0.5 rounded shadow'>Nouveaux messages</span>
                            <div className='flex-1 h-px bg-gradient-to-l from-transparent via-cactus-300 to-transparent' />
                          </div>
                        )}
                        <div className={`group relative w-fit max-w-[70%] rounded-xl px-4 py-2 text-sm leading-relaxed break-words shadow ${mine ? 'bg-cactus-600 text-white ml-auto mr-0 rounded-tr-sm' : 'bg-white border border-cactus-200 rounded-tl-sm'} ${unread? 'ring-1 ring-cactus-400/40':''} ${m.pending? 'opacity-70':''}`} style={{marginTop: idx===0? '2px':'3px'}}>
                        <div className='relative'>
                          {editingId===m.id ? (
                            <div className='space-y-2'>
                              <textarea
                                value={editingValue}
                                onChange={e=> setEditingValue(e.target.value)}
                                className='w-full text-sm rounded-lg border border-cactus-300 bg-white/90 px-2 py-1 text-cactus-800 focus:outline-none focus:ring-2 focus:ring-cactus-400/40 focus:border-cactus-500 shadow-inner min-h-[64px] resize-y'
                                disabled={savingEdit}
                                onKeyDown={e=>{ if(e.key==='Escape'){ e.preventDefault(); cancelEdit(); } else if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); saveEdit(); } }}
                                placeholder='Modifier le message...'
                              />
                              <div className='flex items-center gap-2 justify-end'>
                                <button onClick={cancelEdit} disabled={savingEdit} className='text-[10px] font-medium px-2 py-1 rounded-md border border-cactus-300 bg-white text-cactus-600 hover:bg-cactus-50 transition'>Annuler</button>
                                <button onClick={saveEdit} disabled={savingEdit || !editingValue.trim()} className='text-[10px] font-semibold px-3 py-1 rounded-md bg-cactus-600 text-white hover:bg-cactus-700 transition disabled:opacity-40'>{savingEdit? '...' : 'Enregistrer'}</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {m.text.split(/(\s+)/).map((w,i)=>{
                                if(!w.startsWith('@')) return <span key={i}>{w}</span>;
                                const raw = w.slice(1).replace(/[.,!?;:]$/,'');
                                const match = nameMap[raw.toLowerCase()];
                                if(!match) return <span key={i}>{w}</span>;
                                const isMe = currentUser && match.id===currentUser.id;
                                return <span key={i} className={(isMe? 'bg-yellow-300 text-yellow-900':'bg-cactus-100 text-cactus-700') + ' font-semibold px-1 rounded'}>{w}</span>;
                              })}
                              {m.editedAt && <span className='ml-2 text-[10px] italic opacity-70'> (modifié)</span>}
                            </>
                          )}
                        </div>
                        {m.fileUrl && m.fileType && (
                          <div className='mt-2'>
                            {m.fileType.startsWith('image/') ? (
                              <img onClick={()=> setPreviewImage({url:m.fileUrl!, name:m.fileName})} src={m.fileUrl} alt={m.fileName||'image'} className='max-w-xs max-h-56 rounded-lg border border-cactus-300 shadow-sm cursor-zoom-in hover:opacity-90 transition' />
                            ) : (
                              <a href={m.fileUrl} target='_blank' rel='noopener noreferrer' className='text-cactus-50 underline font-medium'>{m.fileName}</a>
                            )}
                          </div>
                        )}
                        {/* Accusé de lecture pour mes messages */}
                        {mine && (
                          <div className='absolute -bottom-4 right-1 text-[9px] font-medium text-cactus-400 select-none'>
                            {m.error ? '⚠️ échec' : m.pending ? '… envoi' : (m.readers && m.readers.length>1 ? '✓✓ vu' : '✓ envoyé')}
                          </div>
                        )}
                        {mine && m.error && (
                          <button onClick={()=>{ setInput(m.text); if(inputRef.current) inputRef.current.focus(); }} className='absolute -bottom-4 left-1 text-[9px] text-red-500 underline'>Renvoyer</button>
                        )}
                        {mine && m.id && editingId!==m.id && (
                          <div className='opacity-0 group-hover:opacity-100 transition flex gap-1 absolute -top-2 -right-2'>
                            <button onClick={()=> startEdit(m)} className='bg-white/80 backdrop-blur text-[10px] text-cactus-600 border border-cactus-300 px-2 py-0.5 rounded-full shadow hover:bg-white'>Éditer</button>
                            <button onClick={()=>handleDelete(m.id!)} className='bg-white/80 backdrop-blur text-[10px] text-red-600 border border-red-300 px-2 py-0.5 rounded-full shadow hover:bg-white'>Suppr</button>
                          </div>
                        )}
                        {mine && m.id && editingId===m.id && (
                          <div className='absolute -top-2 -right-2'>
                            <span className='text-[9px] font-semibold bg-cactus-600 text-white px-2 py-0.5 rounded-full shadow'>Édition</span>
                          </div>
                        )}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          {typingUsers.length>0 && (
            <div className='px-8 pb-4 -mt-2'>
              <div className='inline-flex items-center gap-2 text-[11px] font-medium text-cactus-500 bg-white/90 px-3 py-1.5 rounded-full border border-cactus-200 shadow-sm'>
                <div className='flex -space-x-1'>
                  {typingUsers.slice(0,3).map(n=> <span key={n} className='w-4 h-4 rounded-full bg-cactus-300 text-[9px] flex items-center justify-center font-bold text-cactus-700'>{n[0]?.toUpperCase()}</span>)}
                </div>
                <span>{typingUsers.length===1? `${typingUsers[0]} écrit...` : `${typingUsers.length} écrivent...`}</span>
                <span className='flex gap-0.5 ml-1'>
                  <span className='w-1.5 h-1.5 bg-cactus-400 rounded-full animate-pulse' />
                  <span className='w-1.5 h-1.5 bg-cactus-300 rounded-full animate-pulse [animation-delay:150ms]' />
                  <span className='w-1.5 h-1.5 bg-cactus-200 rounded-full animate-pulse [animation-delay:300ms]' />
                </span>
              </div>
            </div>
          )}
        </div>
        <div className='px-6 pb-2 flex flex-wrap gap-2 border-t border-cactus-200 bg-white/60'>
          <button onClick={()=> setSelectedUser(null)} className={`px-3 py-1.5 text-[11px] rounded-full border ${!isPrivate? 'bg-cactus-600 text-white border-cactus-600':'bg-white text-cactus-600 border-cactus-300 hover:bg-cactus-50'}`}>Public</button>
          {recentPrivates.filter(id=> users.find(u=>u.id===id)).map(id=>{ const u=users.find(x=>x.id===id)!; const active= selectedUser===id; return (
            <button key={id} onClick={()=> setSelectedUser(active? null : id)} className={`px-3 py-1.5 text-[11px] rounded-full border flex items-center gap-1 ${active? 'bg-cactus-600 text-white border-cactus-600':'bg-white text-cactus-600 border-cactus-300 hover:bg-cactus-50'}`}>🔒 {u.name.split(' ')[0]}</button>
          );})}
        </div>
        <ChatInput
          value={input}
          textareaRef={inputRef}
          onChange={(v)=>{ setInput(v); if(typingRef.current) clearTimeout(typingRef.current); sendTyping(true); typingRef.current=setTimeout(()=> sendTyping(false), 2500); }}
          disabled={!currentUser}
          placeholder={!isPrivate ? 'Écrire un message public...' : (selectedUser ? 'Écrire un message privé...' : 'Choisis un utilisateur...')}
          onSend={handleSend}
          onFile={handleFile}
          users={users}
        />
      </main>
      {isUserScrolling && (
        <button onClick={()=>{ const zone=document.getElementById('chat-zone'); if(zone) zone.scrollTop=zone.scrollHeight; messagesEndRef.current?.scrollIntoView({behavior:'smooth'}); }} className='fixed right-8 bottom-8 z-50 bg-cactus-600 hover:bg-cactus-700 text-white font-semibold px-5 py-3 rounded-full shadow-xl ring-1 ring-cactus-400/40 backdrop-blur'>Derniers messages ↓</button>
      )}
    </div>
    {previewImage && (
      <div className='fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200]' onClick={()=> setPreviewImage(null)}>
        <div className='max-w-3xl max-h-[85vh] relative'>
          <button onClick={()=> setPreviewImage(null)} className='absolute -top-10 right-0 text-white/80 hover:text-white text-sm px-3 py-1 rounded-md bg-white/10 border border-white/20'>Fermer ✕</button>
            <img src={previewImage.url} alt={previewImage.name||'image'} className='max-h-[85vh] rounded-lg shadow-2xl border border-white/20' />
            {previewImage.name && <div className='mt-2 text-center text-white/70 text-[12px]'>{previewImage.name}</div>}
        </div>
      </div>
    )}
  {/* Live region pour lecteurs d'écran */}
  <div aria-live="polite" aria-atomic="true" className='sr-only'>{ariaAnnouncement}</div>
    </>
  );
};
export default TeamChatPage;