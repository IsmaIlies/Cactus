import React from 'react';
import SupervisorPresenceFR from './SupervisorPresenceFR';

// Page épurée: uniquement le module quotidien demandé
const SupervisorPresenceFRPage: React.FC = () => {
  return (
    <div className="h-[calc(100vh-120px)] overflow-y-auto pr-2 relative scroll-beauty scroll-fade">
      <SupervisorPresenceFR />
    </div>
  );
};

export default SupervisorPresenceFRPage;
