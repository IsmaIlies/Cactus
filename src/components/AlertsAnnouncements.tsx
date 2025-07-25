import React, { useState } from 'react';

interface Alert {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  message: string;
  date: string;
}

interface AlertsAnnouncementsProps {
  alerts: Alert[];
}

const AlertsAnnouncements: React.FC<AlertsAnnouncementsProps> = ({ alerts }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getAlertBgColor = (type: string) => {
    switch (type) {
      case 'info':
        return 'bg-blue-50 border-blue-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const getAlertTextColor = (type: string) => {
    switch (type) {
      case 'info':
        return 'text-blue-700';
      case 'warning':
        return 'text-yellow-700';
      case 'success':
        return 'text-green-700';
      case 'error':
        return 'text-red-700';
      default:
        return 'text-gray-700';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">Alertes & Annonces</h2>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-cactus-600 hover:text-cactus-700 focus:outline-none"
        >
          <svg
            className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      
      {isExpanded && (
        <div className="space-y-3 animate-fadeIn">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-md border ${getAlertBgColor(alert.type)}`}
            >
              <div className="flex items-start">
                <div className="flex-grow">
                  <p className={`text-sm ${getAlertTextColor(alert.type)}`}>{alert.message}</p>
                  <p className="text-xs text-gray-500 mt-1">{alert.date}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {!isExpanded && alerts.length > 0 && (
        <div className="text-sm text-gray-500">
          {alerts.length} notification{alerts.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default AlertsAnnouncements;