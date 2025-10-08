import React from 'react';
import ChecklistPage from '../../pages/ChecklistPage';
import '../styles/leadsChecklist.css';

// Render the full checklist UI with the blue theme, full screen
const LeadsChecklistPage: React.FC = () => {
  return (
    <div className="cactus-hours-theme leads-modern" style={{ minHeight: '100vh' }}>
      <ChecklistPage themeClass="leads-modern" />
    </div>
  );
};

export default LeadsChecklistPage;
