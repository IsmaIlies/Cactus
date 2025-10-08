import ChecklistPage from '../../pages/ChecklistPage';
import '../styles/leadsChecklist.css';

// For now, reuse the same logic/markup as ChecklistPage but only override the theme wrapper class to switch to blue theme.
export default function LeadsChecklistPageImpl() {
  // We render the same component but rely on the global body wrapper to style with the 'leads-modern' theme
  return <ChecklistPage />;
}
