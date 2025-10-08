import React from 'react';
import { useParams } from 'react-router-dom';
import PresenceTAStandalone from './PresenceTAStandalone';

const SupervisorPresencePage: React.FC = () => {
  const { area } = useParams<{ area: string }>();
  const isCiv = String(area).toLowerCase() === 'civ';

  if (!isCiv) {
    return (
      <div className="text-blue-200 text-sm">La présence TA est disponible uniquement pour la zone CIV.</div>
    );
  }

  return (
    <div className="h-[calc(100vh-120px)] overflow-y-auto pr-2 relative scroll-beauty scroll-fade">
      <div className="space-y-4">
        <PresenceTAStandalone title="🗓️ Présence TA — ORANGE CANAL+" persistKey="presence_ta_civ_supervisor" />
      </div>
    </div>
  );
};

export default SupervisorPresencePage;
