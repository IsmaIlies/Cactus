import React from 'react';
// Clean shim: legacy roulette removed.
const ModeTVCasino: React.FC = () => (
  <div className="p-6 text-sm text-emerald-300">Module roulette supprimé. Poker Duel actif.</div>
);
export default ModeTVCasino;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [search, setSearch] = useState('');
  const [creditFlash, setCreditFlash] = useState<Record<string, 'up' | 'down'>>({});
  const prevCreditsRef = useRef<Record<string, number>>({});
  const prevRanksRef = useRef<Record<string, number>>({});
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingCredits, setLoadingCredits] = useState(true);
  const [betFeedback, setBetFeedback] = useState<'ok' | 'error' | null>(null);
  const [recentRounds, setRecentRounds] = useState<{ roundId: string; outcome: 'red' | 'black'; totalRed?: number; totalBlack?: number; }[]>([]); // mini historique
  const [mute, setMute] = useState<boolean>(false);
  const [dailyStats, setDailyStats] = useState<{wins:number;losses:number;net:number;won:number;lost:number}>({wins:0,losses:0,net:0,won:0,lost:0});
  const [betAnim, setBetAnim] = useState<{color:'red'|'black'; ts:number} | null>(null); // déclenche animation sélection
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevOutcomeRef = useRef<string | undefined>(undefined);
  const [myRecentBets, setMyRecentBets] = useState<RouletteBet[]>([]);
  const [floatingGain, setFloatingGain] = useState<{delta:number; id:string}[]>([]);

  // ===================== FIRESTORE LISTENERS =====================
  // Users (names + photos)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const mapped = snap.docs.map(d => {
        const data: any = d.data();
        const full = (data.firstName || data.lastName)
          ? [data.firstName, data.lastName].filter(Boolean).join(' ')
          : (data.displayName || d.id.substring(0,6));
  return { id: d.id, displayName: full, photoURL: data.photoURL, firstName: data.firstName, lastName: data.lastName } as UserDoc;
      });
      setUsers(mapped);
      setLoadingUsers(false);
    });
    return () => unsub();
  }, []);

  // Round id ticker (poll every 10s -> updates when bucket changes)
  useEffect(() => {
    const interval = setInterval(() => {
      const newId = getCurrentRouletteRoundId();
      setCurrentRoundId(prev => prev === newId ? prev : newId);
    }, 10000); // check every 10s
    return () => clearInterval(interval);
  }, []);

  // Current round bets + round doc
  useEffect(() => {
    const unsub = listenRouletteBets(currentRoundId, setBetsThisRound);
    const unsubRound = listenRouletteRound(currentRoundId, setRoundInfo);
    return () => { unsub(); unsubRound(); };
  }, [currentRoundId]);

  // Extract my current bet (sets color + stake input)
  useEffect(() => {
    if (!user?.uid) { setMyColor(null); return; }
    const mine = betsThisRound.find(b => b.userId === user.uid);
    setMyColor(mine ? mine.color : null);
    if (mine) setMyStake(mine.stake);
  }, [betsThisRound, user?.uid]);

  // Personal last N bets (history panel)
  // Legacy roulette component removed. Kept as empty shim to avoid import errors.
  import React from 'react';

  const ModeTVCasino: React.FC = () => (
    <div className="p-6 text-sm text-emerald-300">Module roulette supprimé. Poker Duel actif.</div>
  );

  export default ModeTVCasino;
    if(!user?.uid) return;
    const dateKey = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const statsRef = doc(db, 'rouletteStatsDaily', `${user.uid}_${dateKey}`);
    const unsub = onSnapshot(statsRef, snap => {
      if (!snap.exists()) { setDailyStats({wins:0,losses:0,net:0,won:0,lost:0}); return; }
      const d:any = snap.data();
      setDailyStats({wins:d.wins||0, losses:d.losses||0, net:d.netProfit||0, won:d.totalWon||0, lost:d.totalLost||0});
    });
    return () => unsub();
  },[user?.uid]);

  // Recent resolved rounds (mini history)
  useEffect(() => {
    const qRef = query(collection(db, 'rouletteRounds'), orderBy('resolvedAt','desc'), limit(12));
    const unsub = onSnapshot(qRef, snap => {
      const list: { roundId: string; outcome: 'red' | 'black'; totalRed?: number; totalBlack?: number; }[] = [];
      snap.docs.forEach(d => {
        const dt: any = d.data();
        if (dt.outcome) list.push({ roundId: dt.roundId || d.id, outcome: dt.outcome, totalRed: dt.totalRed, totalBlack: dt.totalBlack });
      });
      setRecentRounds(list);
    });
    return () => unsub();
  }, []);

  // ===================== UI EFFECTS & HELPERS =====================
  // Credit change flash (▲ / ▼)
  useEffect(() => {
    const flashes: Record<string, 'up' | 'down'> = {};
    Object.entries(creditsMap).forEach(([uid, val]) => {
      const prev = prevCreditsRef.current[uid];
      if (prev !== undefined && prev !== val) flashes[uid] = val > prev ? 'up' : 'down';
    });
    prevCreditsRef.current = { ...creditsMap }; // update snapshot immediately
    if (Object.keys(flashes).length) {
      setCreditFlash(flashes);
      const timeout = setTimeout(() => setCreditFlash({}), 1500);
      return () => clearTimeout(timeout);
    }
  }, [creditsMap]);

  const pushToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  };

  /**
   * Place or update a bet for the current user.
   * - Allows stake increases (service deducts delta) & color switching.
   * - Blocks when: not logged, locked, invalid stake, insufficient credits.
   */
  const handlePlaceRouletteBet = async (color: 'red'|'black') => {
    if (!user?.uid) { setError('Non connecté'); return; }
    if (lockInSeconds > 0) { setError('Verrouillage en cours'); return; }
    if (myStake <= 0) { setError('Mise invalide'); return; }
    if (myStake > myCredits) { setError('Crédits insuffisants'); return; }
    if (myStake >= 100 && !confirmHighStake) { setConfirmHighStake(true); setError('Confirme la mise élevée'); return; }
    setError(null); setPlacing(true); setPlacingColor(color); setBetFeedback(null);
    try {
      await placeRouletteBet(user.uid, color, myStake);
      pushToast(`Pari ${color==='red'?'ROUGE':'NOIR'} (${myStake} cr)`);
      setConfirmHighStake(false);
      setBetFeedback('ok');
      setBetAnim({ color, ts: Date.now() });
  playSound('bet');
  if (!mute && 'vibrate' in navigator) { try { (navigator as any).vibrate?.(30); } catch {} }
    } catch(e:any) {
      setError(e.message || 'Erreur'); pushToast(e.message || 'Erreur','error');
      setBetFeedback('error');
    } finally { setPlacing(false); setPlacingColor(null); setTimeout(()=> setBetFeedback(null), 2500); }
  };

  // Clear bet selection FX after short delay
  useEffect(()=>{
    if (!betAnim) return;
    const t = setTimeout(()=> setBetAnim(null), 1400);
    return () => clearTimeout(t);
  }, [betAnim]);

  // Play result (sound + vibration + floating delta) when outcome appears
  useEffect(()=>{
    if (!roundInfo?.outcome) { prevOutcomeRef.current = undefined; return; }
    if (prevOutcomeRef.current === roundInfo.outcome) return;
    prevOutcomeRef.current = roundInfo.outcome;
    const myBet = betsThisRound.find(b=> b.userId === user?.uid);
    if (!myBet) return;
    if (mute) return;
    playSound(myBet.color === roundInfo.outcome ? 'win' : 'lose');
    if ('vibrate' in navigator) {
      try { (navigator as any).vibrate?.(myBet.color === roundInfo.outcome ? [40,30,40] : 80); } catch {}
    }
  // Floating gain/perte
  const delta = myBet.color === roundInfo.outcome ? myBet.stake : -myBet.stake;
  const id = Math.random().toString(36).slice(2);
  setFloatingGain(g=> [...g, { delta, id }]);
  setTimeout(()=> setFloatingGain(g=> g.filter(x=> x.id!==id)), 2200);
  }, [roundInfo?.outcome, betsThisRound, user?.uid, mute]);

  /**
   * Tiny synth sound effects (no external assets).
   */
  const playSound = (type: 'bet' | 'win' | 'lose') => {
    if (mute) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      if (type === 'bet') {
        osc.frequency.setValueAtTime(760, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
  osc.connect(gain);
  osc.start(now); osc.stop(now + 0.14);
      } else if (type === 'win') {
        // petit arpège ascendant
        const freqs = [520, 660, 880];
        freqs.forEach((f,i)=>{
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(f, now + i*0.07);
          g.gain.setValueAtTime(0.001, now + i*0.07);
          g.gain.linearRampToValueAtTime(0.22, now + i*0.07 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, now + i*0.07 + 0.35);
          o.connect(g).connect(ctx.destination);
          o.start(now + i*0.07); o.stop(now + i*0.07 + 0.36);
        });
        osc.disconnect(); gain.disconnect();
      } else { // lose
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.4);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  osc.connect(gain);
  osc.start(now); osc.stop(now + 0.46);
      }
    } catch {}
  };

  // (Polling / legacy inactivity logic removed)
  // ===================== DERIVED DATA =====================
  const leaderboard = useMemo(() => {
    const base = users.map(u => {
      const full = (u.firstName || u.lastName)
        ? [u.firstName, u.lastName].filter(Boolean).join(' ')
        : (u.displayName || u.id.substring(0,6));
      return {
        id: u.id,
        name: full,
        photo: u.photoURL,
  sales: 0,
  credits: creditsMap[u.id] ?? 100
      };
    });
    const sorted = [...base];
    if (sortMode === 'name') sorted.sort((a,b)=> a.name.localeCompare(b.name,'fr')); else sorted.sort((a,b)=> b.credits - a.credits);
    return sorted.map((p, idx) => ({ ...p, rank: idx+1, prevRank: prevRanksRef.current[p.id] }));
  }, [users, creditsMap, sortMode]);

  useEffect(()=>{
    const m: Record<string, number> = {};
    (leaderboard as any).forEach((p: any)=> { m[p.id] = p.rank; });
    prevRanksRef.current = m;
  }, [leaderboard]);

  // Backfill: create missing credits docs
  useEffect(() => {
    users.forEach(u => {
      if (creditsMap[u.id] === undefined) {
        ensureUserCredits(u.id).catch(()=>{});
      }
    });
  }, [users, creditsMap]);

  const totalRed = betsThisRound.filter(b=>b.color==='red').reduce((a,b)=>a+b.stake,0);
  const totalBlack = betsThisRound.filter(b=>b.color==='black').reduce((a,b)=>a+b.stake,0);
  const myBet = betsThisRound.find(b=> b.userId === user?.uid);
  const outcome = roundInfo?.outcome;

  return (
    <div className="relative p-4 w-full min-h-screen text-white font-sans overflow-hidden" style={{
      background: `linear-gradient(140deg,#070312,#0d031d 30%,#16052a 55%,#1d0635 70%,#0b0216), radial-gradient(circle at 15% 20%,rgba(168,85,247,0.18),transparent 60%), radial-gradient(circle at 85% 75%,rgba(236,72,153,0.18),transparent 55%)`,
      backgroundBlendMode: 'screen,normal'
    }}>
  <style>{`@keyframes bgmove{0%{transform:translate3d(0,0,0)}50%{transform:translate3d(-3%,2%,0)}100%{transform:translate3d(0,0,0)}}@keyframes fadeInUp{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:translateY(0)}}.animate-fade-in-up{animation:fadeInUp .35s ease both}.bg-animate{animation:bgmove 28s ease-in-out infinite;} .skeleton{background:linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.15),rgba(255,255,255,0.06));background-size:200% 100%;animation:skeleton 1.2s linear infinite;}@keyframes skeleton{0%{background-position:0 0}100%{background-position:-200% 0}}
@keyframes rouletteRipple{0%{transform:scale(.2);opacity:.7}60%{opacity:.25}100%{transform:scale(2.4);opacity:0}}
@keyframes rouletteGlow{0%,100%{filter:drop-shadow(0 0 0 rgba(255,255,255,0))}50%{filter:drop-shadow(0 0 12px rgba(255,255,255,0.45))}}
@keyframes particle{0%{transform:translate(0,0) scale(.6);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.6);opacity:0}}
.bet-anim-layer{pointer-events:none;position:absolute;inset:0;}
.bet-particle{position:absolute;top:50%;left:50%;width:6px;height:6px;border-radius:50%;background:linear-gradient(135deg,#fff,#f0f);animation:particle 0.9s ease-out forwards;}
.bet-ripple{position:absolute;inset:0;border:2px solid rgba(255,255,255,.45);border-radius:12px;animation:rouletteRipple 1s ease-out forwards;mix-blend-mode:screen;}
.bet-glow{position:absolute;inset:-2px;border-radius:14px;animation:rouletteGlow 1.2s ease-in-out 2;}
`}</style>
      <div className="absolute inset-0 bg-animate opacity-40 pointer-events-none" />
      {/* Soft vignette */}
      <div className="pointer-events-none absolute inset-0" style={{background:'radial-gradient(circle at 50% 60%,rgba(0,0,0,0) 0%,rgba(0,0,0,0.35) 70%)'}}/>
      {/* Noise overlay */}
      <div className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-[0.07]" style={{backgroundImage:'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'140\' height=\'140\' fill=\'none\'><rect width=\'1\' height=\'1\' fill=\'%23ffffff\' opacity=\'0.6\'/></svg>")', backgroundSize:'140px 140px'}}/>
  {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2 rounded-md text-sm shadow border backdrop-blur bg-neutral-900/80 ${t.type==='success'?'border-green-500/40 text-green-300':'border-red-500/40 text-red-300'}`}>{t.message}</div>
        ))}
      </div>
      {/* Floating gain/perte */}
      <div className="pointer-events-none fixed left-1/2 top-24 z-40 -translate-x-1/2 flex flex-col items-center gap-1">
        {floatingGain.map(f => (
          <span key={f.id} className={`text-lg font-bold font-mono animate-fade-in-up ${f.delta>=0?'text-green-400':'text-red-400'}`} style={{animationDuration:'2.1s', transform:'translateY(0)'}}>
            {f.delta>0?`+${f.delta}`:f.delta}
          </span>
        ))}
      </div>
  {/* Header + Betting panel */}
  <div className="flex flex-col lg:flex-row lg:items-start gap-4 mb-6">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-wide bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">Roulette 3 min</h1>
            <span className="px-2 py-1 text-[10px] rounded bg-neutral-800 border border-neutral-700 uppercase tracking-wider text-neutral-400">BETA</span>
          </div>
          <p className="text-xs text-neutral-500 max-w-xl">Choisis ROUGE ou NOIR avant la fin du compte à rebours. La roulette tombe toutes les 3 minutes (lock 5s avant).</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-300 bg-neutral-900/80 rounded-md px-3 py-2 border border-neutral-800 min-h-[40px] backdrop-blur-sm">
            <span className="uppercase tracking-wider text-neutral-500">En direct :</span>
            {presentUsers.length === 0 && <span className="text-neutral-500 italic">Personne en ligne</span>}
            {presentUsers.map(p => (
              <span key={p.id} className="relative pl-5 pr-2 py-0.5 bg-neutral-800/70 hover:bg-neutral-700/70 border border-neutral-700 rounded-full text-[11px] font-medium transition">
                <span className="absolute left-1 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 animate-pulse"></span>
                {p.displayName || p.id.substring(0,6)}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 self-start">
          <button onClick={()=>setSortMode(s => s==='credits' ? 'name' : 'credits')} className="text-xs px-3 py-2 rounded-md bg-neutral-900 border border-neutral-800 hover:border-neutral-600 transition">
            Tri: {sortMode === 'credits' ? 'Crédits' : 'Nom'}
          </button>
          <button onClick={()=>setShowAdvanced(s=>!s)} className="text-xs px-3 py-2 rounded-md bg-neutral-900 border border-neutral-800 hover:border-neutral-600 transition">
            {showAdvanced ? 'Masquer détails' : 'Détails'}
          </button>
          <button onClick={()=>setMute(m=>!m)} className={`text-xs px-3 py-2 rounded-md bg-neutral-900 border ${mute?'border-neutral-700':'border-pink-500/50'} hover:border-neutral-600 transition`}>{mute?'Son off':'Son on'}</button>
          {/* reset button removed (auto boost) */}
        </div>
        {/* Roulette panel */}
        <div className="w-full max-w-sm bg-neutral-950/70 border border-neutral-800 rounded-lg p-4 space-y-4 self-start">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-wide">Parier sur la couleur</h3>
            <div className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">Mes crédits: <span className="text-purple-300 font-mono">{myCredits}</span></div>
          </div>
          <div className="text-[11px] text-neutral-400 flex items-center gap-2">
            <RoundTimerCircle roundId={currentRoundId} timeLeftLabel={timeLeft} remainingMs={remainingMs} />
            {!outcome && lockInSeconds>0 && <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-amber-600/20 border border-amber-500/40 text-amber-300 animate-pulse">LOCK dans {lockInSeconds}s</span>}
            {outcome && <span className={`ml-2 px-2 py-0.5 rounded text-[10px] ${outcome==='red'?'bg-red-600/30 text-red-300 border border-red-600/40':'bg-neutral-700/40 text-neutral-200 border border-neutral-600/40'}`}>Issue: {outcome==='red'?'ROUGE':'NOIR'}</span>}
          </div>
          <div className="space-y-2">
            <label className="text-[11px] text-neutral-400">Mise (crédits)</label>
            <input type="number" value={myStake} min={1} onChange={e=> setMyStake(parseInt(e.target.value)||0)} className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm outline-none focus:border-pink-500/60" />
            <div className="flex flex-wrap gap-2">
              {[5,10,20,50,100,150].map(v => <button key={v} onClick={()=>setMyStake(v)} className={`px-2 py-1 text-[11px] rounded border ${myStake===v?'bg-pink-600/30 border-pink-500/50 text-pink-200':'bg-neutral-900 border-neutral-800 hover:border-neutral-600 text-neutral-400'}`}>{v}</button>)}
            </div>
          </div>
          {error && <div className="text-[11px] text-red-400">{error}</div>}
          {confirmHighStake && <div className="text-[11px] text-amber-300">Re-clique pour confirmer la grosse mise.</div>}
          <div className="grid grid-cols-2 gap-3">
            <button aria-label="Parier Rouge" disabled={placing || outcome!==undefined || lockInSeconds>0} onClick={()=>handlePlaceRouletteBet('red')} className={`relative overflow-hidden group h-20 rounded-lg border text-sm font-semibold tracking-wide transition focus:outline-none focus:ring-2 focus:ring-pink-400/70 ${myColor==='red'?'outline outline-2 outline-pink-400/60':''} ${(outcome||lockInSeconds>0)?'opacity-60 cursor-not-allowed':''} bg-gradient-to-br from-red-700 via-red-800 to-red-900 border-red-800 hover:from-red-600 hover:via-red-700 hover:to-red-800`}> 
              <span className="absolute inset-0 opacity-0 group-hover:opacity-25 transition bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.55),transparent_62%)]" />
              {placing && placingColor==='red' ? <span className="flex items-center justify-center gap-1"><span className="w-3 h-3 border-2 border-transparent border-t-white rounded-full animate-spin"/>...</span> : 'ROUGE'}
              <span className="absolute bottom-1 right-1 text-[10px] font-mono bg-red-900/60 px-1 rounded">{totalRed} cr</span>
              {betAnim?.color==='red' && <BetSelectionFX color='red' key={betAnim.ts} />}
            </button>
            <button aria-label="Parier Noir" disabled={placing || outcome!==undefined || lockInSeconds>0} onClick={()=>handlePlaceRouletteBet('black')} className={`relative overflow-hidden group h-20 rounded-lg border text-sm font-semibold tracking-wide transition focus:outline-none focus:ring-2 focus:ring-pink-400/70 ${myColor==='black'?'outline outline-2 outline-pink-400/60':''} ${(outcome||lockInSeconds>0)?'opacity-60 cursor-not-allowed':''} bg-gradient-to-br from-neutral-800 via-neutral-900 to-black border-neutral-700 hover:from-neutral-700 hover:via-neutral-800 hover:to-black`}>
              <span className="absolute inset-0 opacity-0 group-hover:opacity-25 transition bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,0.4),transparent_65%)]" />
              {placing && placingColor==='black' ? <span className="flex items-center justify-center gap-1"><span className="w-3 h-3 border-2 border-transparent border-t-white rounded-full animate-spin"/>...</span> : 'NOIR'}
              <span className="absolute bottom-1 right-1 text-[10px] font-mono bg-black/60 px-1 rounded">{totalBlack} cr</span>
              {betAnim?.color==='black' && <BetSelectionFX color='black' key={betAnim.ts} />}
            </button>
          </div>
          {betFeedback==='ok' && <div className="text-[11px] text-green-400 flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"/>Pari confirmé</div>}
          {betFeedback==='error' && <div className="text-[11px] text-red-400">Erreur pari</div>}
          {myBet && !outcome && <div className="text-[11px] text-neutral-400">Tu as parié <span className="font-semibold text-pink-300">{myBet.stake} cr</span> sur <span className={myBet.color==='red'?'text-red-400':'text-neutral-200'}>{myBet.color==='red'?'ROUGE':'NOIR'}</span>. Tu peux encore changer de couleur ou augmenter ta mise avant le lock.</div>}
          {outcome && myBet && <div className={`text-[11px] font-medium ${myBet.color===outcome?'text-green-400':'text-red-400'}`}>{myBet.color===outcome?'Gagné!':'Perdu.'}</div>}
        </div>{/* end header flex */}
      </div>
      {/* Search (still used for leaderboard) */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <input
            value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Rechercher un joueur..."
            className="w-full bg-neutral-900/70 border border-neutral-800 focus:border-pink-500/60 rounded px-3 py-2 text-sm outline-none placeholder-neutral-600"
          />
          {search && <button onClick={()=>setSearch('')} className="text-xs text-neutral-500 hover:text-neutral-300">Effacer</button>}
        </div>
  {/* Filtres avancés retirés */}
      </div>
  {/* Metrics */}
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-center text-[11px]">
        <div className="rounded-md bg-neutral-900/60 border border-neutral-800 p-3 flex flex-col gap-1"><span className="text-neutral-500 uppercase tracking-wide">Joueurs</span><span className="text-sm font-semibold text-pink-300">{users.length}</span></div>
  <div className="rounded-md bg-neutral-900/60 border border-neutral-800 p-3 flex flex-col gap-1"><span className="text-neutral-500 uppercase tracking-wide">Mises round</span><span className="text-sm font-semibold text-purple-300">{betsThisRound.length}</span></div>
        <div className="rounded-md bg-neutral-900/60 border border-neutral-800 p-3 flex flex-col gap-1"><span className="text-neutral-500 uppercase tracking-wide">Total crédits</span><span className="text-sm font-semibold text-emerald-300">{Object.values(creditsMap).reduce((a,b)=>a+b,0)|| users.length*100}</span></div>
        <div className="rounded-md bg-neutral-900/60 border border-neutral-800 p-3 flex flex-col gap-1"><span className="text-neutral-500 uppercase tracking-wide">Moy. crédits</span><span className="text-sm font-semibold text-amber-300">{users.length?Math.round((Object.values(creditsMap).reduce((a,b)=>a+b,0)|| users.length*100)/users.length):0}</span></div>
        <div className="col-span-2 md:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="rounded-md bg-neutral-900/50 border border-neutral-800 p-2 flex flex-col gap-0.5"><span className="text-[10px] text-neutral-500 uppercase tracking-wide">Gagnés aujourd'hui</span><span className="text-sm font-semibold text-green-300">{dailyStats.won}</span></div>
          <div className="rounded-md bg-neutral-900/50 border border-neutral-800 p-2 flex flex-col gap-0.5"><span className="text-[10px] text-neutral-500 uppercase tracking-wide">Perdus aujourd'hui</span><span className="text-sm font-semibold text-red-300">{dailyStats.lost}</span></div>
          <div className="rounded-md bg-neutral-900/50 border border-neutral-800 p-2 flex flex-col gap-0.5"><span className="text-[10px] text-neutral-500 uppercase tracking-wide">Wins</span><span className="text-sm font-semibold text-green-400">{dailyStats.wins}</span></div>
          <div className="rounded-md bg-neutral-900/50 border border-neutral-800 p-2 flex flex-col gap-0.5"><span className="text-[10px] text-neutral-500 uppercase tracking-wide">Net</span><span className={`text-sm font-semibold ${dailyStats.net>=0?'text-emerald-300':'text-red-400'}`}>{dailyStats.net}</span></div>
        </div>
      </div>
      {/* Leaderboard */}
      <div className="space-y-6 mb-10">
        <div>
          <h2 className="text-xl font-semibold mb-2">Leaderboard Crédit</h2>
          <div className="bg-gradient-to-b from-neutral-950 to-neutral-900 rounded-lg border border-neutral-800 overflow-hidden">
              {(loadingUsers || loadingCredits) && leaderboard.length === 0 ? (
                <div className="divide-y divide-neutral-800">
                  {Array.from({length:6}).map((_,i)=>(
                    <div key={i} className="flex items-center gap-4 p-3 text-sm">
                      <div className="w-6 h-3 rounded skeleton" />
                      <div className="w-10 h-10 rounded-full skeleton" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-40 rounded skeleton" />
                        {showAdvanced && <div className="h-2 w-24 rounded skeleton" />}
                      </div>
                      <div className="h-4 w-10 rounded skeleton" />
                    </div>
                  ))}
                </div>
              ) : (leaderboard as any)
                .filter((l: any) => l.name.toLowerCase().includes(search.toLowerCase()))
                .map((p: any) => {
                  const isMe = p.id === user?.uid;
                  const rank = p.rank;
                  const delta = p.prevRank ? p.prevRank - p.rank : 0; // positive = up
                  return (
                    <div key={p.id} className={`group flex items-center gap-4 p-3 text-sm relative ${isMe ? 'bg-neutral-800/60' : 'hover:bg-neutral-800/40'} transition`}> 
                      <div className="w-8 flex flex-col items-center justify-center text-[11px] font-mono text-neutral-500 group-hover:text-neutral-300">
                        <span>{rank}</span>
                        {delta !== 0 && <span className={`text-[9px] ${delta>0?'text-green-400':'text-red-400'}`}>{delta>0?`+${delta}`:delta}</span>}
                      </div>
                      {p.photo ? (
                        <img src={p.photo} className={`w-10 h-10 rounded-full object-cover ring-2 ${rank===1?'ring-yellow-400/70':rank===2?'ring-gray-300/60':rank===3?'ring-amber-500/60':isMe ? 'ring-pink-500/60' : 'ring-transparent'} group-hover:ring-purple-600/40 transition`}/>
                      ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ring-2 ${rank===1?'bg-gradient-to-br from-yellow-400 via-amber-300 to-yellow-500 text-black':rank===2?'bg-gradient-to-br from-gray-300 to-gray-500 text-black':rank===3?'bg-gradient-to-br from-orange-500 to-amber-600 text-black':'bg-gradient-to-br from-purple-600 to-pink-600 text-white'} ${isMe ? 'ring-pink-400/70' : 'ring-transparent'} group-hover:scale-105 transition`}>{p.name[0]}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">{p.name} {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-600/20 text-pink-300 border border-pink-500/30">Moi</span>} {rank<=3 && <span className="text-[10px] px-1 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-yellow-300">Top {rank}</span>}</div>
                        {showAdvanced && <div className="text-[10px] text-neutral-500">Round: {currentRoundId.slice(-3)}</div>}
                      </div>
                      <div className={`flex items-center gap-1 font-mono text-base relative pr-3 ${creditFlash[p.id]==='up' ? 'text-green-300' : creditFlash[p.id]==='down' ? 'text-red-300' : 'text-purple-300'}`}> 
                        <span className={`transition transform ${creditFlash[p.id]==='up' ? 'animate-pulse scale-110' : creditFlash[p.id]==='down' ? 'opacity-80' : ''}`}>{p.credits}</span>
                        <span className="text-[10px] text-neutral-500">cr</span>
                        {creditFlash[p.id] && <span className={`text-[9px] absolute -top-2 right-0 ${creditFlash[p.id]==='up'? 'text-green-400':'text-red-400'}`}>{creditFlash[p.id]==='up'?'▲':'▼'}</span>}
                      </div>
                    </div>
                  );
                })}
              {leaderboard.length === 0 && !loadingUsers && <div className="p-4 text-neutral-400 text-sm">Aucun utilisateur</div>}
            </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Distribution Round</h2>
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4 flex flex-col gap-4">
            <div className="flex items-center">
              <div className="flex-1 h-4 rounded overflow-hidden bg-neutral-800 flex">
                <div className="h-full bg-gradient-to-r from-red-600 to-red-800" style={{width: (totalRed+totalBlack)>0? `${(totalRed/(totalRed+totalBlack))*100}%` : '0%'}}/>
                <div className="h-full bg-gradient-to-r from-neutral-700 to-black" style={{width: (totalRed+totalBlack)>0? `${(totalBlack/(totalRed+totalBlack))*100}%` : '0%'}}/>
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-neutral-400">
              <span>Rouge: <span className="text-red-400 font-semibold">{totalRed} cr</span></span>
              <span>Noir: <span className="text-neutral-200 font-semibold">{totalBlack} cr</span></span>
            </div>
          </div>
        </div>
        {/* Mini historique (du plus ancien au plus récent) */}
        <div>
          <h2 className="text-xl font-semibold mb-2">Historique rapide</h2>
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-3 flex items-center gap-2 overflow-x-auto">
            {recentRounds.slice().reverse().slice(-10).map(r => (
              <div key={r.roundId} className={`w-7 h-7 flex flex-col items-center justify-center text-[10px] font-bold rounded ${r.outcome==='red'?'bg-gradient-to-br from-red-600 to-red-800 text-white':'bg-gradient-to-br from-neutral-600 to-black text-neutral-100'}`} title={`Round ${r.roundId.slice(-3)}: ${r.outcome==='red'?'Rouge':'Noir'}\nRouge: ${r.totalRed||0}  Noir: ${r.totalBlack||0}`}>
                <span>{r.outcome==='red'?'R':'N'}</span>
              </div>
            ))}
            {recentRounds.length===0 && <span className="text-[11px] text-neutral-500">Aucun résultat</span>}
          </div>
        </div>
        {/* Historique personnel détaillé */}
        <div>
          <h2 className="text-xl font-semibold mb-2">Mes 20 derniers paris</h2>
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 divide-y divide-neutral-800 overflow-hidden">
            {myRecentBets.length===0 && <div className="p-3 text-[11px] text-neutral-500">Aucun pari</div>}
            {myRecentBets.map(b => {
              const round = recentRounds.find(r=> r.roundId === b.roundId);
              const resolved = round?.outcome;
              const won = resolved && b.color === resolved;
              const delta = resolved ? (won ? b.stake : -b.stake) : 0;
              return (
                <div key={b.id} className="flex items-center gap-3 p-2 text-[12px]">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${b.color==='red'?'bg-red-700/60 text-red-200 border border-red-600/40':'bg-neutral-700/60 text-neutral-200 border border-neutral-600/40'}`}>{b.color==='red'?'ROUGE':'NOIR'}</span>
                  <span className="font-mono text-neutral-300">{b.stake} cr</span>
                  <span className="text-neutral-500 text-[10px]">Round {b.roundId.slice(-3)}</span>
                  {resolved ? (
                    <span className={`ml-auto font-mono ${delta>=0?'text-green-400':'text-red-400'}`}>{delta>=0?`+${delta}`:delta}</span>
                  ) : <span className="ml-auto text-[10px] text-neutral-500">...</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* Roue intégrée */}
      <div className="mt-8 flex justify-center">
        <FancyRoulette outcome={roundInfo?.outcome} roundEnded={remainingMs<=0} />
      </div>
    </div>
  );
};

// Nouvelle roue réaliste
const FancyRoulette: React.FC<{ outcome?: 'red' | 'black'; roundEnded: boolean }> = ({ outcome, roundEnded }) => {
  const pocketCount = 24; // simple alternance pour maintenant
  const pockets = useMemo(() => Array.from({length: pocketCount}).map((_,i)=> ({ index:i, color: i%2===0?'red':'black' })), []);
  const degPer = 360 / pocketCount;
  const [spinAngle, setSpinAngle] = useState(0); // angle courant
  const [settling, setSettling] = useState(false);
  const [burst, setBurst] = useState(false);
  const targetAngleRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  // Spin libre tant que pas d'issue
  useEffect(()=>{
    if (settling) return; // sera géré dans autre effet
    if (outcome) return; // outcome = transition vers settling déclenchée ailleurs
    const speedDegPerSec = 220; // vitesse régulière
    const loop = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      setSpinAngle(a => a + (dt/1000)*speedDegPerSec);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current=null; lastTsRef.current=null; };
  }, [outcome, settling]);

  // Lorsque outcome arrive: calculer angle final et lancer easing
  useEffect(()=>{
    if (!outcome || settling || targetAngleRef.current!=null) return;
    // choisir un pocket outcome aléatoire
    const candidates = pockets.filter(p=> p.color===outcome);
    const pick = candidates[Math.floor(Math.random()*candidates.length)];
    // On veut que le centre de ce pocket finisse à 0° (sous le pointeur en haut)
    const current = ((spinAngle % 360)+360)%360; // 0..359
    const desiredMod = - (pick.index*degPer + degPer/2); // centre pocket (négatif pour aligner)
    const normalize = (x:number)=> ((x%360)+360)%360;
    const desiredNorm = normalize(desiredMod);
    const deltaMod = normalize(desiredNorm - current);
    const extra = 360*5 + deltaMod; // 5 tours + ajustement
    targetAngleRef.current = spinAngle + extra;
    setSettling(true);
  }, [outcome, pockets, spinAngle, settling, degPer]);

  // Easing vers angle final
  useEffect(()=>{
    if (!settling || targetAngleRef.current==null) return;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current=null; }
    const start = spinAngle;
    const end = targetAngleRef.current;
    const delta = end - start;
    const dur = 4200; // ms
    const t0 = performance.now();
    const easeOutCubic = (t:number)=> 1 - Math.pow(1-t,3);
    const step = (ts:number)=>{
      const t = Math.min(1, (ts - t0)/dur);
      const e = easeOutCubic(t);
      setSpinAngle(start + delta * e);
      if (t < 1) rafRef.current = requestAnimationFrame(step); else { setBurst(true); setTimeout(()=> setBurst(false), 1200); }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [settling, spinAngle]);

  // Génération des paths SVG
  const wedgePaths = useMemo(()=>{
    const r = 100; const cx=100, cy=100; // centre
    return pockets.map(p => {
      const startA = (p.index * degPer - 90) * Math.PI/180; // -90 pour que pocket 0 soit en haut
      const endA = ((p.index+1)*degPer - 90) * Math.PI/180;
      const x1 = cx + r*Math.cos(startA); const y1 = cy + r*Math.sin(startA);
      const x2 = cx + r*Math.cos(endA);   const y2 = cy + r*Math.sin(endA);
      const largeArc = degPer > 180 ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      return { d, p };
    });
  }, [pockets, degPer]);

  return (
    <div className="relative" style={{width:340, height:340}}>
      <svg viewBox="0 0 200 200" className="drop-shadow-[0_0_25px_rgba(0,0,0,0.6)]" style={{transform:`rotate(${spinAngle}deg)`, width:340, height:340}}>
        <defs>
          <radialGradient id="wheelGlow" r="65%">
            <stop offset="0%" stopColor="#1f1f25" />
            <stop offset="85%" stopColor="#0b0b0f" />
          </radialGradient>
        </defs>
        <circle cx={100} cy={100} r={100} fill="url(#wheelGlow)" stroke="#2b2b33" strokeWidth={4} />
        {wedgePaths.map(({d,p}) => (
          <path key={p.index} d={d} fill={p.color==='red'? 'url(#gradRed)': 'url(#gradBlack)'} stroke="#222" strokeWidth={0.8} />
        ))}
        <defs>
          <linearGradient id="gradRed" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </linearGradient>
          <linearGradient id="gradBlack" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#52525b" />
            <stop offset="100%" stopColor="#18181b" />
          </linearGradient>
        </defs>
        <circle cx={100} cy={100} r={72} fill="none" stroke="#34343c" strokeWidth={3} />
        <circle cx={100} cy={100} r={46} fill="#09090b" stroke="#2e2e35" strokeWidth={1.5} />
        <text x={100} y={100} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#d4d4d8" style={{fontFamily:'monospace'}}>
          { outcome ? (outcome==='red'?'ROUGE':'NOIR') : (roundEnded? '...' : '...') }
        </text>
      </svg>
      {/* Pointeur */}
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 pointer-events-none">
        <div className="w-0 h-0 border-l-[18px] border-r-[18px] border-b-[44px] border-l-transparent border-r-transparent border-b-pink-500 drop-shadow-[0_0_12px_rgba(236,72,153,0.85)]" />
      </div>
      {burst && <OutcomeBurst color={outcome} />}
    </div>
  );
};

// Circular round timer (outside main component to keep file cohesive)
const RoundTimerCircle: React.FC<{ roundId: string; timeLeftLabel: string; remainingMs: number; }> = ({ roundId, timeLeftLabel, remainingMs }) => {
  const TOTAL = 180000; // 3 min
  const clamped = Math.max(0, Math.min(TOTAL, remainingMs));
  const progress = 1 - clamped / TOTAL; // 0 -> 1
  const radius = 14;
  const circ = 2 * Math.PI * radius;
  const dash = circ * progress;
  return (
    <span className="flex items-center gap-2">
      <span className="relative w-8 h-8 inline-flex items-center justify-center">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={4} />
          <circle cx="18" cy="18" r={radius} fill="none" stroke="url(#gradRoulette)" strokeWidth={4} strokeDasharray={`${dash},${circ}`} strokeLinecap="round" />
          <defs>
            <linearGradient id="gradRoulette" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ec4899" />
              <stop offset="50%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute text-[9px] font-mono text-neutral-300">{timeLeftLabel}</span>
      </span>
      <span className="font-mono text-neutral-300">{roundId.slice(-3)}</span>
    </span>
  );
};

// Burst effect on outcome reveal
const OutcomeBurst: React.FC<{ color?: 'red' | 'black' }> = ({ color }) => {
  const particles = Array.from({ length: 18 }).map((_, i) => {
    const angle = (Math.PI * 2 * i) / 18;
    const dist = 120 + Math.random() * 40;
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    const delay = (i % 6) * 0.01;
    return (
      <span
        key={i}
        className="absolute w-2 h-2 rounded-full"
        style={{
          left: '50%', top: '50%', transform: `translate(-50%,-50%) translate(${x}px,${y}px)`,
          background: color==='red'? 'linear-gradient(135deg,#fecaca,#ef4444)' : 'linear-gradient(135deg,#e5e7eb,#6b7280)',
          animation: `fadeOutScale 0.9s ease-out forwards`,
          animationDelay: `${delay}s`
        }}
      />
    );
  });
  return (
    <div className="pointer-events-none absolute inset-0">
      <style>{`@keyframes fadeOutScale{0%{opacity:1;transform:translate(-50%,-50%) scale(.6);}70%{opacity:.4;}100%{opacity:0;transform:translate(-50%,-50%) scale(1.4);}}`}</style>
      {particles}
    </div>
  );
};

export default ModeTVCasino;

// Effets visuels lors de la sélection d'un pari
const BetSelectionFX: React.FC<{ color: 'red' | 'black' }> = ({ color }) => {
  // Génération de petites particules aléatoires
  const particles = Array.from({ length: 10 }).map((_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 55;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const style: React.CSSProperties = {
      // @ts-ignore custom property for animation
      '--dx': `${dx}px`,
      '--dy': `${dy}px`,
      background: color === 'red' ? 'linear-gradient(135deg,#fff,#ff5b5b)' : 'linear-gradient(135deg,#fff,#7f7f7f)',
      animationDelay: `${Math.random() * 0.15}s`
    };
    return <span key={i} className="bet-particle" style={style}/>;
  });
  return (
    <span className="bet-anim-layer">
      <span className="bet-ripple" />
      <span className="bet-glow" style={{ boxShadow: color==='red' ? '0 0 18px 4px rgba(255,80,80,0.45)' : '0 0 18px 4px rgba(180,180,180,0.35)' }} />
      {particles}
    </span>
  );
};
