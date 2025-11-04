import React, { useEffect, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import NouveautesPdfBanner from '../components/NouveautesPdfBanner';

// Images (placer les visuels fournis dans /public ou adapter les paths)
// Exemple: <img src="/marseille-cal.png" ... />
// L'utilisateur pourra remplacer par les vrais noms.

// (Interface ScheduleEntry supprimée car non utilisée)

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
    // Ancien programme Mardi/Mercredi/Jeudi retiré selon la demande

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

  // Programme hebdomadaire retiré; conservation des utilitaires si besoin futur

  // (Anciennes aides de planning supprimées)

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
  <NouveautesPdfBanner />
  {/* Bloc régionalisation (remplace les blocs Programme mardi/mercredi/jeudi) */}
  <SectionBlock title="Régionalisation des sports — Partie 1" subtitle="Contenus localisés par régions (extraits)">
    <div className="space-y-6 text-[13px] leading-relaxed">
      <div>
        <h4 className="text-white font-semibold mb-2">Île-de-France (IDF)</h4>
        <p className="mb-2">Le football est représenté par deux clubs principaux évoluant en Ligue 1 (L1) :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Paris Saint-Germain (PSG)</strong> — récent vainqueur de la Ligue des Champions — joue au Parc des Princes; le club compte aussi une section handball au haut niveau national et européen.</li>
          <li><strong>Paris FC (PFC)</strong> — joue au Stade Jean Bouin (récemment promu).</li>
        </ul>
        <p className="mt-3 mb-2">Autres clubs pros ou semi-pros :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Red Star</strong> (Stade du Docteur Bauer) — Ligue 2 (L2), statut professionnel.</li>
          <li>En National (3e échelon) : <strong>Paris 13 Athlético</strong>, <strong>FC Versailles 78</strong>, <strong>FC Fleury 91</strong> (statuts pro et amateur).</li>
        </ul>
        <p className="mt-3 mb-2">Rugby — deux clubs phares au Top 14, présents selon les saisons en Champions Cup ou EPCR Challenge Cup :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Racing 92</strong> — joue à la Défense Arena.</li>
          <li><strong>Stade Français</strong> — joue à Jean Bouin.</li>
        </ul>
        <p className="mt-3 mb-2">Événements majeurs :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Masters 1000 (ATP)</strong> — Accor Arena.</li>
          <li><strong>Internationaux de France</strong> — Roland Garros (terre battue, Porte d’Auteuil).</li>
          <li><strong>Schneider Electric Marathon de Paris</strong> — plus de 55 000 coureurs.</li>
          <li>Arrivée finale du <strong>Tour de France</strong> sur les Champs-Élysées.</li>
        </ul>
        <p className="mt-3 mb-2">Basket — deux clubs en Betclic Élite et EuroLeague (équivalent Champions League) :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Nanterre 92</strong> — Palais des Sports Maurice Thorez.</li>
          <li><strong>Paris Basketball</strong> — Adidas Arena.</li>
        </ul>
      </div>

      <div>
        <h4 className="text-white font-semibold mb-2">🌊 Région Ouest (Bretagne – Pays de la Loire – Centre-Val de Loire)</h4>
        <p className="mb-2">⚽ <strong>Football</strong> — Région très représentée avec 10 clubs professionnels :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>Ligue 1</strong> : FC Nantes (Les Canaris), Stade Rennais, Stade Brestois 29, FC Lorient (Les Merlus).</li>
          <li><strong>Ligue 2</strong> : En Avant Guingamp, Le Mans FC (Les Mucistes), Stade Lavallois (Les Tangos).</li>
          <li><strong>National</strong> : Stade Briochin (Les Griffons), US Concarneau (Les Thoniers), La Berrichonne de Châteauroux (Les Sorciers berrichons).</li>
        </ul>
        <p className="mt-3 mb-2">⛵ <strong>Voile</strong> — Événements majeurs :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>Vendée Globe, Route du Rhum, Solitaire du Figaro.</li>
        </ul>
        <p className="mt-3 mb-2">🚴 <strong>Cyclisme</strong> — Courses emblématiques :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>Bretagne Classic (ex GP de Plouay), Tro Bro Leon.</li>
        </ul>
        <p className="mt-3 mb-2">🏉 <strong>Rugby</strong> :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>RC Vannes</strong> — La Rabine : passé par le Top 14, actuellement en Pro D2.</li>
          <li><strong>Stade Rochelais</strong> — Marcel-Deflandre : double champion d’Europe (Champions Cup), finaliste du Bouclier de Brennus — Les Maritimes.</li>
        </ul>
        <p className="mt-3 mb-2">🤾 <strong>Handball</strong> :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>HBC Nantes</strong> — H Arena : 3 Coupes de France, 2 Coupes de la Ligue, 3 Trophées des Champions.</li>
        </ul>
        <p className="mt-3 mb-2">🏃 <strong>Course à pied</strong> :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>Semi-marathon Auray–Vannes (référence nationale).</li>
        </ul>
        <p className="mt-3 mb-2">🚗 <strong>Automobile</strong> :</p>
        <ul className="list-disc ml-5 space-y-1">
          <li><strong>24 Heures du Mans</strong> — Circuit Bugatti (Sarthe), course mythique.</li>
        </ul>
      </div>
    </div>
  </SectionBlock>

  {/* Bloc Europa/Conference retiré selon la demande */}

  {/* Bloc Rugby TOP14 retiré au profit de la régionalisation */}

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







