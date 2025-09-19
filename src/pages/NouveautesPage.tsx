import React, { useEffect, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import ProgrammePdfBanner from '../components/ProgrammePdfBanner';
import ProgrammePdfTopBar from '../components/ProgrammePdfTopBar';

// Images (placer les visuels fournis dans /public ou adapter les paths)
// Exemple: <img src="/marseille-cal.png" ... />
// L'utilisateur pourra remplacer par les vrais noms.

interface ScheduleEntry {
  time: string;
  title: string;
  channels: string;
  badge?: string;
}

const SectionBlock: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; icon?: string; gradient?: string; }>=({ title, subtitle, children, icon, gradient }) => {
  return (
    <div className={`relative rounded-2xl border border-white/10 backdrop-blur bg-white/[0.04] overflow-hidden shadow-sm`}>
      <div className={`p-4 sm:p-6 ${gradient || 'bg-gradient-to-br from-cactus-800/50 via-cactus-700/35 to-cactus-600/25'}`}>
        <div className="flex items-start gap-3 mb-4">
          {icon && <span className="text-2xl leading-none select-none">{icon}</span>}
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight flex items-center gap-3">
              {title}
              <span className="hidden md:inline-block text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-200 border border-emerald-400/20">NEW</span>
            </h2>
            {subtitle && <p className="text-xs sm:text-sm text-cactus-100/70 mt-1 leading-snug">{subtitle}</p>}
          </div>
        </div>
        <div className="space-y-4 text-sm text-cactus-50/90">
          {children}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 ring-1 ring-white/10 rounded-xl" />
    </div>
  );
};

const scheduleDay = (label: string, entries: ScheduleEntry[], highlight?: boolean) => {
  return (
    <div className={`rounded-2xl border ${highlight ? 'border-emerald-400/50 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]' : 'border-white/10'} bg-gradient-to-br from-white/10 via-white/5 to-white/0 p-4 space-y-4 transition-colors`}>
      <div className="flex items-center gap-2 pl-1">
        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]" />
        <h3 className="text-sm font-semibold text-white tracking-wide uppercase letter-spacing-wide">{label}</h3>
      </div>
      <ul className="space-y-2">
        {entries.map((e,i)=> {
          const lower = e.title.toLowerCase();
          const isShow = lower.includes('canal champions club');
          const isDebrief = lower.includes('debrief');
          const isMultiplex = lower.includes('multiplex');
          const parts = e.title.split(' - ');
          const hasTeams = parts.length === 2 && !isShow && !isDebrief && !isMultiplex;
          return (
            <li key={i} className="relative group hover-glow-item">
              {/* Séparateur délicat (sauf dernier) */}
              {i < entries.length - 1 && (
                <span className="pointer-events-none absolute -bottom-1 left-4 right-2 h-px bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent opacity-40 group-hover:opacity-70 transition" />
              )}
              <div className="absolute inset-y-0 left-0 w-1 rounded-l-md bg-gradient-to-b from-emerald-400 via-cactus-400 to-cactus-600 opacity-70 group-hover:opacity-100 transition" />
              <div className="pl-3 pr-3 py-2.5 rounded-lg bg-white/3 hover:bg-white/8 border border-white/10 hover:border-white/20 transition-colors shadow-sm flex flex-col gap-1">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-[11px] text-emerald-200 leading-none pt-0.5 w-11 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-emerald-100">{e.time}</span>
                  <div className="flex-1 min-w-0">
                    {hasTeams ? (
                      <p className="text-[13px] font-semibold text-white leading-tight flex flex-wrap gap-x-1">
                        <span className="truncate max-w-[46%]">{parts[0]}</span>
                        <span className="text-cactus-300/60">vs</span>
                        <span className="truncate max-w-[46%]">{parts[1]}</span>
                      </p>
                    ) : (
                      <p className="text-[13px] font-semibold text-white leading-tight break-words">
                        {e.title}
                      </p>
                    )}
                    <p className="text-[10px] font-medium text-cactus-100/70 mt-0.5 flex items-center gap-1">
                      <span className="hidden sm:inline text-cactus-300/60">•</span>
                      <span className="truncate">{e.channels}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 w-14 shrink-0">
                    {e.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-100 border border-indigo-400/40 uppercase font-semibold tracking-wide">
                        {e.badge}
                      </span>
                    )}
                    {isMultiplex && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-fuchsia-500/25 text-fuchsia-100 border border-fuchsia-400/40 uppercase font-semibold tracking-wide">multi</span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

// Utilitaires date dynamiques
const formatDateFR = (d: Date) => {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); // JJ/MM
};

const getNextWeekday = (targetWeekday: number, from = new Date()) => {
  // targetWeekday: 0 = Dimanche ... 6 = Samedi (comme getDay)
  const d = new Date(from);
  const diff = (targetWeekday - d.getDay() + 7) % 7; // si aujourd'hui => 0 (on garde)
  d.setDate(d.getDate() + diff);
  // Normaliser heure pour comparaisons (retirer heure courante)
  d.setHours(0, 0, 0, 0);
  return d;
};

const isSameDay = (a: Date, b: Date) => a.getTime() === b.getTime();

const NouveautesPage: React.FC = () => {
  // Lightbox pour Visuels Clubs
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  useEffect(()=>{
    const onKey = (e: KeyboardEvent) => {
      if(e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  },[]);
  // FOOT Schedules
  // (Contenu des grilles : rester statique tant que tu ne fournis pas de source dynamique)
  const mardi: ScheduleEntry[] = [
    { time: '18h45', title: 'ATHLETIC BILBAO - ARSENAL', channels: 'CANAL+FOOT / LIVE 2' },
    { time: '18h45', title: 'PSV EINDHOVEN - SAINT-GILLOISE', channels: 'CANAL+SPORT / LIVE 3' },
    { time: '19h50', title: 'CANAL CHAMPIONS CLUB', channels: 'CANAL+ / LIVE 1', badge: 'mag' },
    { time: '21h00', title: 'REAL MADRID - MARSEILLE', channels: 'CANAL+ / LIVE 1' },
    { time: '22h57', title: 'CANAL CHAMPIONS CLUB - LE DEBRIEF', channels: 'CANAL+ / LIVE 1', badge: 'debrief' },
  ];
  const mercredi: ScheduleEntry[] = [
    { time: '18h45', title: 'SLAVIA PRAGUE - BODÃ˜/GLIMT', channels: 'CANAL+SPORT / LIVE 3' },
    { time: '18h45', title: 'OLYMPIAKOS - PAFOS', channels: 'CANAL+FOOT / LIVE 2' },
    { time: '19h50', title: 'CANAL CHAMPIONS CLUB', channels: 'CANAL+ / LIVE 1', badge: 'mag' },
    { time: '21h00', title: 'PARIS SG - ATALANTA BERGAME', channels: 'CANAL+ / LIVE 1' },
    { time: '21h00', title: 'LIVERPOOL - ATLÃ‰TICO MADRID', channels: 'CANAL+FOOT / LIVE 2' },
    { time: '21h00', title: 'BAYERN MUNICH - CHELSEA', channels: 'CANAL+SPORT / LIVE 3' },
    { time: '21h00', title: 'AJAX - INTER MILAN', channels: 'LIVE 4 (Exclu)' , badge: 'exclu'},
    { time: '21h00', title: 'MULTIPLEX', channels: 'CANAL+SPORT 360' },
    { time: '22h57', title: 'CANAL CHAMPIONS CLUB - LE DEBRIEF', channels: 'CANAL+ / LIVE 1', badge: 'debrief' },
  ];
  const jeudi: ScheduleEntry[] = [
    { time: '18h15', title: 'CANAL CHAMPIONS CLUB', channels: 'CANAL+FOOT / LIVE 1', badge: 'mag' },
    { time: '18h45', title: 'CLUB BRUGES - MONACO', channels: 'CANAL+FOOT / LIVE 1' },
    { time: '18h45', title: 'COPENHAGUE - LEVERKUSEN', channels: 'CANAL+SPORT / LIVE 2' },
    { time: '20h45', title: 'CANAL CHAMPIONS CLUB', channels: 'CANAL+FOOT / LIVE 1', badge: 'mag' },
    { time: '21h00', title: 'NEWCASTLE - FC BARCELONE', channels: 'CANAL+FOOT / LIVE 1' },
    { time: '21h00', title: 'MANCHESTER CITY - NAPLES', channels: 'LIVE 2 (Exclu)', badge: 'exclu' },
    { time: '21h00', title: 'FRANCFORT - GALATASARAY', channels: 'LIVE 3 (Exclu)', badge: 'exclu' },
    { time: '21h00', title: 'SPORTING CP - KAIRAT ALMATY', channels: 'LIVE 4 (Exclu)', badge: 'exclu' },
    { time: '21h00', title: 'MULTIPLEX', channels: 'CANAL+SPORT 360' },
    { time: '22h57', title: 'CANAL CHAMPIONS CLUB - LE DEBRIEF', channels: 'CANAL+FOOT / LIVE 1', badge: 'debrief' },
  ];

  // Etat pour déclencher re-render au passage minuit
  const [today, setToday] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });

  useEffect(() => {
  // Calculer ms jusqu'à minuit prochain
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeout = nextMidnight.getTime() - now.getTime();
    const t = setTimeout(() => {
      const d = new Date(); d.setHours(0,0,0,0); setToday(d);
  }, timeout + 250); // léger offset sécurité
    return () => clearTimeout(t);
  }, [today]);

  // Calcul des dates dynamiques (Mardi=2, Mercredi=3, Jeudi=4)
  const dateMardi = getNextWeekday(2, today);
  const dateMercredi = getNextWeekday(3, today);
  const dateJeudi = getNextWeekday(4, today);

  // Label jour localisé
  const dayLabel = (d: Date) => {
    return d.toLocaleDateString('fr-FR', { weekday: 'long' }).replace(/^./, c => c.toUpperCase()) + ' ' + formatDateFR(d);
  };

  // Mettre en évidence le bloc du jour si on est exactement ce jour-là
  const highlightMardi = isSameDay(today, dateMardi);
  const highlightMercredi = isSameDay(today, dateMercredi);
  const highlightJeudi = isSameDay(today, dateJeudi);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero Header (refonte sombre) */}
      <div className="relative">
        {/* Couche principale gradient plus profonde */}
        <div className="absolute inset-0 bg-[linear-gradient(110deg,#031d17_0%,#06382d_35%,#0c5d4a_70%,#10a476_100%)] animate-parallax-slow" />
        {/* Glow directionnel */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_32%,rgba(16,185,129,0.35),transparent_60%)]" />
  {/* Grain / texture légère */}
        <div className="absolute inset-0 opacity-[0.15] mix-blend-overlay [background-image:repeating-linear-gradient(45deg,rgba(255,255,255,0.08)_0,rgba(255,255,255,0.08)_2px,transparent_2px,transparent_4px)]" />
  {/* Liseré dégradé bas */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
        <div className="relative px-5 sm:px-8 py-5 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div className="space-y-3 max-w-3xl">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/25 via-emerald-500/10 to-cactus-600/20 backdrop-blur-md border border-emerald-300/20 shadow-[0_4px_18px_-4px_rgba(16,185,129,0.45)]">
                  <span className="absolute inset-0 rounded-xl bg-gradient-to-tr from-emerald-500/30 via-transparent to-transparent" />
                  <CalendarRange className="h-6 w-6 text-emerald-100 drop-shadow" />
                  <span className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-emerald-400/15 to-emerald-600/0 blur-lg" />
                </span>
                <span className="leading-tight drop-shadow-sm">Nouveautés &amp; Programmes</span>
              </h1>
              <p className="text-[13px] sm:text-sm text-emerald-50/75 leading-snug max-w-2xl">
                Planning consolidé des matchs, émissions et compétitions.
              </p>
              {/* Chips thématiques (supprimées) */}
            </div>
            {/* Zone d'info latérale future / placeholder */}
            <div className="hidden md:flex" />
          </div>
          {/* Barre meta mobile supprimée */}
        </div>
      </div>
    <div className="flex-1 overflow-auto scroll-beauty scroll-fade p-5 sm:p-8 space-y-10 bg-gradient-to-br from-cactus-950 via-cactus-900 to-cactus-800 relative">
  <ProgrammePdfTopBar />
  <ProgrammePdfBanner />
  <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
          <SectionBlock title="Programme Mardi">
            {scheduleDay(dayLabel(dateMardi), mardi, highlightMardi)}
          </SectionBlock>
          <SectionBlock title="Programme Mercredi">
            {scheduleDay(dayLabel(dateMercredi), mercredi, highlightMercredi)}
          </SectionBlock>
          <SectionBlock title="Programme Jeudi">
            {scheduleDay(dayLabel(dateJeudi), jeudi, highlightJeudi)}
          </SectionBlock>
        </div>

  <SectionBlock title="Europa & Conference" subtitle="Prochains matchs européens (sélection)">
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2"><span className="text-cactus-200 font-mono text-xs w-28">Europa</span> <span>24 sept : Nice vs Rome</span></li>
            <li className="flex items-start gap-2"><span className="text-cactus-200 font-mono text-xs w-28">Europa</span> <span>25 sept : Lille vs Brann • Utrecht vs Lyon</span></li>
            <li className="flex items-start gap-2"><span className="text-cactus-200 font-mono text-xs w-28">Conference</span> <span>2 oct : Slovan vs Strasbourg</span></li>
          </ul>
        </SectionBlock>

  <SectionBlock title="Rugby - TOP14" subtitle="Audiences +10% vs saison précédente">
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-white/90 mb-2">Samedi 13 septembre</h4>
              <ul className="space-y-1 text-sm">
                <li>16h35 : Aviron Bayonnais – Montpellier Hérault Rugby</li>
                <li>16h35 : Section Paloise – Stade Français Paris</li>
                <li>16h35 : Stade Rochelais – ASM Clermont</li>
                <li>16h35 : Stade Toulousain – USA Perpignan</li>
                <li>21h05 : RC Toulon – Castres Olympique</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white/90 mb-2">Dimanche 14 septembre</h4>
              <ul className="space-y-1 text-sm">
                <li>21h05 : Racing 92 – Union Bordeaux-Bègles</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white/90 mb-2">Samedi 20 septembre</h4>
              <ul className="space-y-1 text-sm">
                <li>16h35 : Castres Olympique – Aviron Bayonnais</li>
                <li>16h35 : Lou Rugby – Stade Français Paris</li>
                <li>16h35 : Union Bordeaux-Bègles – US Montauban</li>
                <li>16h35 : USA Perpignan – Racing 92</li>
                <li>21h00 : Montpellier Hérault Rugby – Stade Toulousain</li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white/90 mb-2">Dimanche 21 septembre</h4>
              <ul className="space-y-1 text-sm">
                <li>21h05 : RC Toulon – Stade Rochelais</li>
              </ul>
            </div>
          </div>
        </SectionBlock>

  <SectionBlock title="Visuels Clubs" subtitle="Calendriers clubs">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <figure
              className="relative group border border-white/10 rounded-lg overflow-hidden bg-white/5 aspect-[3/4] cursor-zoom-in focus-within:ring-2 focus-within:ring-emerald-400/50"
              role="button"
              tabIndex={0}
              onClick={()=> setLightbox({ src: '/cal-marseille.jpg', alt: 'Calendrier des matchs de Marseille' })}
              onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); setLightbox({ src: '/cal-marseille.jpg', alt: 'Calendrier des matchs de Marseille' }); } }}
            >
              <img
                src="/cal-marseille.jpg"
                alt="Calendrier des matchs de Marseille"
                loading="lazy"
                className="w-full h-full object-cover object-center transition duration-300 group-hover:scale-[1.02]"
              />
              <figcaption className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-[11px] text-white/80">Marseille</figcaption>
            </figure>
            <figure
              className="relative group border border-white/10 rounded-lg overflow-hidden bg-white/5 aspect-[3/4] cursor-zoom-in focus-within:ring-2 focus-within:ring-emerald-400/50"
              role="button"
              tabIndex={0}
              onClick={()=> setLightbox({ src: '/cal-monaco.jpg', alt: 'Calendrier des matchs de Monaco' })}
              onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); setLightbox({ src: '/cal-monaco.jpg', alt: 'Calendrier des matchs de Monaco' }); } }}
            >
              <img
                src="/cal-monaco.jpg"
                alt="Calendrier des matchs de Monaco"
                loading="lazy"
                className="w-full h-full object-cover object-center transition duration-300 group-hover:scale-[1.02]"
              />
              <figcaption className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-[11px] text-white/80">Monaco</figcaption>
            </figure>
            <figure
              className="relative group border border-white/10 rounded-lg overflow-hidden bg-white/5 aspect-[3/4] cursor-zoom-in focus-within:ring-2 focus-within:ring-emerald-400/50"
              role="button"
              tabIndex={0}
              onClick={()=> setLightbox({ src: '/cal-psg.jpg', alt: 'Calendrier des matchs du PSG' })}
              onKeyDown={(e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); setLightbox({ src: '/cal-psg.jpg', alt: 'Calendrier des matchs du PSG' }); } }}
            >
              <img
                src="/cal-psg.jpg"
                alt="Calendrier des matchs du PSG"
                loading="lazy"
                className="w-full h-full object-cover object-center transition duration-300 group-hover:scale-[1.02]"
              />
              <figcaption className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-[11px] text-white/80">PSG</figcaption>
            </figure>
          </div>
          {/* Paragraphe info images retirÃ© */}
        </SectionBlock>
      {/* Lightbox overlay */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Agrandissement visuel club"
          onClick={()=> setLightbox(null)}
        >
          <div className="relative max-w-[95vw] max-h-[90vh]" onClick={e=> e.stopPropagation()}>
            <button
              onClick={()=> setLightbox(null)}
              className="absolute -top-3 -right-3 h-9 w-9 rounded-full bg-white/90 text-cactus-900 flex items-center justify-center shadow-lg hover:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Fermer"
            >
              ✕
            </button>
            <img
              src={lightbox.src}
              alt={lightbox.alt}
              className="block max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default NouveautesPage;







