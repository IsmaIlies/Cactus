import React, { useState, useEffect } from "react";
import { X, CheckSquare, Clock } from "lucide-react";

const ChecklistReminderPopup: React.FC = () => {
  const [showPopup, setShowPopup] = useState(false);

  // URL de la checklist
  const checklistUrl =
    "https://forms.office.com/pages/responsepage.aspx?id=hZG0a6Qqz0q4bMjGSdWE1izSwLDlR2NMlZgyCj-0gopURVdSUElWV1ExWlNNTFg0TkNES0k0NjNFWCQlQCN0PWcu";

  // Vérifier l'heure pour afficher le rappel à 18h
  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Afficher le popup à 18h00 exactement
      if (currentHour === 18 && currentMinute === 0) {
        // Vérifier si le popup n'a pas déjà été montré aujourd'hui
        const today = now.toDateString();
        const lastShown = localStorage.getItem("checklistReminderShown");

        if (lastShown !== today) {
          setShowPopup(true);
          localStorage.setItem("checklistReminderShown", today);
        }
      }
    };

    // Vérifier immédiatement
    checkTime();

    // Vérifier toutes les minutes
    const interval = setInterval(checkTime, 60000);

    // Pour tester : décommenter la ligne suivante pour afficher le popup immédiatement
    // setShowPopup(true);

    return () => clearInterval(interval);
  }, []);

  const handleOpenChecklist = () => {
    window.open(checklistUrl, "_blank");
    setShowPopup(false);
  };

  const handleClosePopup = () => {
    setShowPopup(false);
  };

  if (!showPopup) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Rappel Checklist
            </h3>
          </div>
          <button
            onClick={handleClosePopup}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-gray-600 mb-4">
            Il est 18h ! N'oubliez pas de remplir votre checklist quotidienne
            pour terminer votre journée.
          </p>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <CheckSquare className="w-4 h-4" />
            <span>Checklist de fin de journée</span>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleOpenChecklist}
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Ouvrir la checklist
          </button>
          <button
            onClick={handleClosePopup}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChecklistReminderPopup;
