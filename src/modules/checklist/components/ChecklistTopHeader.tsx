import { NavLink, useParams } from 'react-router-dom';

export default function ChecklistTopHeader({ active }: { active: 'agent' | 'admin' | 'archive' }) {
  // On garde le lien AGENT sur /dashboard/:region/checklist
  // Lien AGENT sur /checklist (route existante)
  const base = `/checklist`;
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:28, height:28, borderRadius:8, background:'#1ead79', boxShadow:'0 0 0 2px rgba(0,0,0,.2) inset' }} />
        <div style={{ display:'flex', flexDirection:'column', lineHeight:1 }}>
          <strong className="brand-title">Cactus Check</strong>
          <span className="brand-subtitle">Déclaration d'heures</span>
        </div>
      </div>
      <div className="top-tabs">
        <NavLink to={base} end className={({isActive}) => `top-tab ${active==='agent'||isActive?'top-tab--active':''}`}>AGENT</NavLink>
        <NavLink to="/checklist-archive" className={({isActive}) => `top-tab ${active==='archive'||isActive?'top-tab--active':''}`}>ARCHIVES</NavLink>
      </div>
    </div>
  );
}
