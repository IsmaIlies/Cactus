import React, { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { ensureDuelDoc, joinDuel, leaveDuel, listenPokerDuel, playerAction, startHand, PokerDuelDoc } from '../services/pokerService';
import { evaluateHoldem } from '../utils/pokerEvaluator';
import { listenSpectators, enterSpectator, heartbeatPresence, PokerSpectatorDoc } from '../services/pokerPresenceService';

const PokerDuelPage: React.FC = () => {
  const user = auth.currentUser;
  const [duel, setDuel] = useState<PokerDuelDoc | null>(null);
  const [stake, setStake] = useState(1000);
  const [spectators, setSpectators] = useState<PokerSpectatorDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const me = duel?.players.find(p=> p.uid === user?.uid);
  const opp = duel?.players.find(p=> p.uid !== user?.uid);

  useEffect(()=>{ const unsub = listenPokerDuel(setDuel); ensureDuelDoc(); return () => unsub(); },[]);
  useEffect(()=>{ const unsub = listenSpectators(setSpectators); enterSpectator(); const id = setInterval(()=> heartbeatPresence(), 15000); return ()=> { clearInterval(id); unsub(); }; },[]);

  const seated = !!me;
  const canStart = duel && duel.players.length===2 && ['waiting','finished'].includes(duel.phase);
  const generateChips = (value:number) => {
    const chips = Math.min(8, Math.max(0, Math.floor(value / Math.max(duel?.minBet||50,50))));
    return Array.from({length:chips}).map((_,i)=>(<div key={i} className="chip" style={{top: -i*3}} />));
  };

  // Compute showdown evaluations if finished or showdown phase
  let showdownInfo: { me?: string; opp?: string } = {};
  if (duel && ['showdown','finished'].includes(duel.phase) && me?.hole && opp?.hole) {
    try {
      const evalMe = evaluateHoldem([...me.hole, ...duel.community]);
      const evalOpp = evaluateHoldem([...opp.hole, ...duel.community]);
      showdownInfo = { me: evalMe.description, opp: evalOpp.description };
    } catch {}
  }

  return (
    <div className="relative w-full h-full bg-[#061013] text-white font-sans overflow-hidden">
      {/* Background felt + vignette */}
      <div className="absolute inset-0" style={{background:'radial-gradient(circle at 50% 45%, #093b33 0%, #05201c 55%, #02100e 85%)'}} />
      <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-30" style={{backgroundImage:'repeating-linear-gradient(45deg,rgba(255,255,255,0.04)0,rgba(255,255,255,0.04)2px,transparent 2px,transparent 6px)'}}/>
      <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(circle at 50% 120%, rgba(0,0,0,0.8), transparent 60%)'}} />
      <div className="relative z-10 h-full flex flex-col">
    <header className="p-4 flex items-center justify-between backdrop-blur-sm bg-black/20 border-b border-emerald-600/20">
          <h1 className="text-xl font-semibold tracking-wide"><span className="text-emerald-300">Poker</span> Duel</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-emerald-300/80">Phase: {duel?.phase||'--'}</span>
            {duel && <span className="text-emerald-200/70">Pot: {duel.pot}</span>}
      <div className="flex items-center gap-1 text-emerald-300/70"><span className="text-xs uppercase">Spectateurs</span><span className="px-2 py-0.5 rounded bg-emerald-800/40 text-emerald-200 text-xs font-mono">{spectators.length}</span></div>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          {/* Table ellipse */}
          <div className="relative w-[900px] max-w-full aspect-[2.2/1]">
            <div className="absolute inset-0 rounded-[50%] shadow-2xl" style={{background:'radial-gradient(circle at 50% 50%, #145c4b 0%, #0d3f34 55%, #06231d 80%)', boxShadow:'0 0 0 6px #0a2e27, 0 0 0 10px #08201b, 0 20px 50px -10px rgba(0,0,0,0.8)'}} />
            {/* Pot */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <div className="text-xs uppercase tracking-wider text-emerald-400/60 mb-1">Pot</div>
              <div className="text-2xl font-bold text-emerald-300 drop-shadow relative inline-block">
                {duel?.pot||0}
                <div className="chip-stack -mt-6 absolute left-1/2 -translate-x-1/2">{generateChips(duel?.pot||0)}</div>
              </div>
              {duel?.community && <div className="mt-8 flex gap-3 justify-center">{duel.community.map((c,i)=> <Card key={c} code={c} revealDelay={i*120} />)}</div>}
            </div>
            {/* Seats */}
            <Seat position="top" player={opp} acting={duel?.actingUid===opp?.uid} />
            <Seat position="bottom" player={me} acting={duel?.actingUid===me?.uid} highlight />
          </div>
          {/* Controls */}
          <div className="mt-10 w-full max-w-xl flex flex-col gap-4 items-center">
            {error && <div className="text-red-400 text-sm">{error}</div>}
            {!seated && (
              <div className="flex items-center gap-3">
                <input type="number" value={stake} onChange={e=> setStake(parseInt(e.target.value)||0)} className="bg-black/40 border border-emerald-600/40 rounded px-3 py-1 text-sm w-32" />
                <button onClick={()=> joinDuel(stake).catch(e=> setError(e.message))} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold shadow">Rejoindre</button>
              </div>
            )}
            {seated && duel && duel.phase==='waiting' && (<button onClick={()=> leaveDuel().catch(e=> setError(e.message))} className="text-xs text-emerald-400 hover:underline">Quitter</button>)}
            {canStart && me && (<button onClick={()=> startHand().catch(e=> setError(e.message))} className="px-6 py-2 rounded bg-gradient-to-r from-emerald-600 to-teal-500 font-semibold text-sm shadow">Lancer la main</button>)}
            {duel && ['preflop','flop','turn','river'].includes(duel.phase) && me && duel.actingUid===me.uid && (
              <div className="flex gap-3">
                <button onClick={()=> playerAction('fold').catch(e=> setError(e.message))} className="px-4 py-2 rounded bg-red-700/70 hover:bg-red-600 text-sm">Fold</button>
                <button onClick={()=> playerAction('check').catch(e=> setError(e.message))} className="px-4 py-2 rounded bg-emerald-700/70 hover:bg-emerald-600 text-sm">Check</button>
                <button onClick={()=> playerAction('call').catch(e=> setError(e.message))} className="px-4 py-2 rounded bg-emerald-800/70 hover:bg-emerald-700 text-sm">Call</button>
                <button onClick={()=> playerAction('bet', duel.minBet).catch(e=> setError(e.message))} className="px-4 py-2 rounded bg-amber-600/80 hover:bg-amber-500 text-sm">Bet {duel.minBet}</button>
              </div>
            )}
            {duel && duel.phase==='finished' && me && (
              <div className="flex flex-col gap-2 items-center text-sm text-emerald-300">
                <div className="flex gap-6">
                  {showdownInfo.me && <div>Toi: <span className="text-amber-300">{showdownInfo.me}</span></div>}
                  {showdownInfo.opp && <div>Adversaire: <span className="text-amber-300">{showdownInfo.opp}</span></div>}
                </div>
                <div className="flex gap-2 items-center">Main terminée. <button className="underline" onClick={()=> startHand().catch(e=> setError(e.message))}>Relancer</button></div>
              </div>
            )}
          </div>
          {/* Spectator list */}
          <div className="mt-8 w-full max-w-md bg-black/30 rounded-lg border border-emerald-700/30 p-3 text-xs text-emerald-200 backdrop-blur-sm">
            <div className="font-semibold mb-2 flex items-center gap-2">Spectateurs <span className="px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 font-mono">{spectators.length}</span></div>
            <div className="flex flex-wrap gap-2">
              {spectators.map(s=> <div key={s.uid} className="px-2 py-1 rounded bg-emerald-800/40 border border-emerald-600/30">{s.displayName}</div>)}
              {spectators.length===0 && <div className="italic text-emerald-500/60">Aucun spectateur</div>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

const Seat: React.FC<{ position: 'top' | 'bottom'; player?: any; acting?: boolean; highlight?: boolean; }> = ({ position, player, acting, highlight }) => {
  const isBottom = position==='bottom';
  return (
    <div className={`absolute ${isBottom? 'bottom-6 left-1/2 -translate-x-1/2':'top-6 left-1/2 -translate-x-1/2'} flex flex-col items-center gap-2`}> 
      <div className={`px-4 py-2 rounded-xl backdrop-blur bg-black/30 border ${highlight? 'border-emerald-500/50':'border-emerald-700/40'} shadow-lg min-w-[220px] ${acting? 'acting-glow timer-ring':''}`}> 
        {player ? (
          <div className="flex flex-col items-center text-sm">
            <div className={`text-emerald-200 font-semibold tracking-wide flex items-center gap-2 ${acting?'animate-pulse':''}`}>{player.displayName} {acting && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-700/60">Tour</span>}</div>
            <div className="flex gap-3 mt-2">{player.hole?.map((c:string,i:number)=> <Card key={c} code={c} hidden={!isBottom} revealDelay={i*140} />)}</div>
            <div className="mt-2 text-emerald-300 font-mono">Stack: {player.stack}</div>
          </div>
        ) : (
          <div className="text-emerald-900/60 italic">Siège libre</div>
        )}
      </div>
    </div>
  );
};

const Card: React.FC<{ code: string; hidden?: boolean; revealDelay?: number }> = ({ code, hidden, revealDelay=0 }) => {
  const flipped = !hidden;
  return (
    <div className={`card-3d w-14 h-20`} style={{transitionDelay: `${revealDelay}ms`}}>
      <div className={`card-inner ${flipped? 'card-flipped':''}`}> 
        <div className="card-face card-back">♣</div>
        <div className="card-face card-front text-lg">{code}</div>
      </div>
    </div>
  );
};

export default PokerDuelPage;
