import React from "react";
import QuickAction from "./QuickAction";
import AlertsAnnouncements from "./AlertsAnnouncements";
import { Phone, BarChart2, Users, Clock, ChevronLeft } from "lucide-react";

interface RightSidebarProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
}

const RightSidebar: React.FC<RightSidebarProps> = ({ isOpen, onToggle }) => {
  // Mock data for alerts
  const alertsData: {
    id: string;
    type: "error" | "info" | "warning" | "success";
    message: string;
    date: string;
  }[] = [
    /*{
      id: "1",
      type: "info",
      message: 'Nouvelle campagne "Été 2024" disponible.',
      date: "2 avril 2024",
    },
    {
      id: "2",
      type: "warning",
      message:
        "Objectif mensuel atteint à 70% seulement. Encore 10 jours pour le compléter.",
      date: "3 avril 2024",
    },
    {
      id: "3",
      type: "success",
      message:
        "Vous avez dépassé votre objectif d'appels hebdomadaire. Félicitations!",
      date: "4 avril 2024",
    },*/
  ];

  return (
    <div
      className={`fixed right-0 top-0 h-screen bg-white border-l border-gray-200 transition-all duration-300 ease-in-out ${
        isOpen ? "w-64" : "w-4"
      }`}
    >
      <button
        onClick={() => onToggle(!isOpen)}
        className="absolute -left-3 top-1/2 transform -translate-y-1/2 bg-white border border-gray-200 rounded-full p-1 hover:bg-gray-50"
      >
        <ChevronLeft
          className={`w-4 h-4 text-gray-600 transition-transform duration-300 ${
            isOpen ? "" : "rotate-180"
          }`}
        />
      </button>

      <div
        className={`h-full overflow-y-auto ${
          isOpen ? "opacity-100" : "opacity-0"
        } transition-opacity duration-300`}
      >
        <div className="p-4 space-y-6">
          {/* Alertes & Annonces en haut */}
          {/*<div className="border-b border-gray-200 pb-6"><AlertsAnnouncements alerts={alertsData} /></div>*/}
          {/* Actions rapides en dessous */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Actions supplémentaires
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction
                icon={<Clock className="w-5 h-5 text-cactus-600" />}
                title="Checklist"
                bgColor="bg-blue-100"
                onClick={() =>
                  window.open(
                    "https://forms.office.com/pages/responsepage.aspx?id=hZG0a6Qqz0q4bMjGSdWE1izSwLDlR2NMlZgyCj-0gopURVdSUElWV1ExWlNNTFg0TkNES0k0NjNFWCQlQCN0PWcu",
                    "_blank"
                  )
                }
              />
              <QuickAction
                icon={<Phone className="w-5 h-5 text-cactus-600" />}
                title="Hermes"
                bgColor="bg-indigo-100"
                onClick={() =>
                  window.open(
                    "https://hermes.s-ie01a-product.prod1.vocalcomcx.com/hermes360/Admin/Launcher/login",
                    "_blank"
                  )
                }
              />
              <QuickAction
                icon={<Users className="w-5 h-5 text-cactus-600" />}
                title="Passerelle COM"
                bgColor="bg-cyan-100"
                onClick={() =>
                  window.open(
                    "https://rdvorange.espacerendezvous.com/passerelles",
                    "_blank"
                  )
                }
              />
              <QuickAction
                icon={<BarChart2 className="w-5 h-5 text-cactus-600" />}
                title="Passerelle TECH"
                bgColor="bg-green-100"
                onClick={() =>
                  window.open(
                    "https://rdvorange.espacerendezvous.com/assistancetechnique",
                    "_blank"
                  )
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RightSidebar;
