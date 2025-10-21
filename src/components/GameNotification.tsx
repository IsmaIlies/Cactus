import React, { useState, useEffect, useRef } from "react";
import { X, Users, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MrWhiteService, { GameEvent } from "../services/mrWhiteService";
import { useAuth } from "../contexts/AuthContext";

const GameNotification: React.FC = () => {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [dismissedEvents, setDismissedEvents] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let canceled = false;
    const inFlight = { v: false };

    const fetchOnce = async () => {
      if (inFlight.v || canceled) return;
      inFlight.v = true;
      try {
        const list = await MrWhiteService.getRecentEvents(10);
        if (canceled) return;
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const recent = list.filter(ev => ev.createdAt.toMillis() > fiveMinutesAgo && ev.type === "NEW_GAME");
        setEvents(recent);
      } catch (e) {
        // silencieux pour éviter le spam console
      } finally {
        inFlight.v = false;
      }
    };

    // première récupération immédiate, puis toutes les 60s
    fetchOnce();
    const id = setInterval(fetchOnce, 60_000);
    return () => { canceled = true; clearInterval(id); };
  }, [user]);

  const handleJoinGame = (gameId: string) => {
    navigate(`/dashboard/mrwhite?join=${gameId}`);
    setDismissedEvents(prev => new Set([...prev, gameId]));
  };

  const handleDismiss = (eventId: string) => {
    setDismissedEvents(prev => new Set([...prev, eventId]));
  };

  const visibleEvents = events.filter(event => !dismissedEvents.has(event.id));

  if (visibleEvents.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {visibleEvents.slice(0, 3).map((event) => (
        <div
          key={event.id}
          className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-sm animate-slide-in"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-cactus-100 rounded-full flex items-center justify-center">
                <Users className="w-4 h-4 text-cactus-600" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  Nouvelle partie Mr. White !
                </h4>
                <p className="text-xs text-gray-500">
                  {event.hostName} • {event.gameName}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDismiss(event.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <p className="text-sm text-gray-600 mb-3">
            {event.message}
          </p>
          
          <div className="flex space-x-2">
            <button
              onClick={() => handleJoinGame(event.gameId)}
              className="flex-1 bg-cactus-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-cactus-700 transition-colors flex items-center justify-center space-x-1"
            >
              <Play className="w-3 h-3" />
              <span>Rejoindre</span>
            </button>
            <button
              onClick={() => handleDismiss(event.id)}
              className="px-3 py-2 text-gray-600 hover:text-gray-800 text-sm"
            >
              Plus tard
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default GameNotification;
