import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { 
  Users, 
  Plus, 
  Play, 
  Crown, 
  Clock, 
  Eye,
  Vote,
  Trophy,
  RefreshCw,
  UserCheck,
  Timer
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import MyCoverService, { MyCoverGame, MyCoverPlayer } from "../services/mycoverService";
import MyCoverGameRoom from "../components/MyCoverGameRoom";
import MyCoverNotification from "../components/MyCoverNotification";

const MyCoverPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [games, setGames] = useState<MyCoverGame[]>([]);
  const [currentGame, setCurrentGame] = useState<MyCoverGame | null>(null);
  const [currentPlayers, setCurrentPlayers] = useState<MyCoverPlayer[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [gameName, setGameName] = useState("");
  const [loading, setLoading] = useState(false);
  // Hold active Firestore listeners to avoid leaks when joining multiple games
  const gameUnsubRef = useRef<null | (() => void)>(null);
  const playersUnsubRef = useRef<null | (() => void)>(null);

  // Auto-join si un gameId est dans l'URL
  const joinGameId = searchParams.get("join");

  useEffect(() => {
    const unsubscribe = MyCoverService.subscribeToGames(setGames);
    return () => {
      try { unsubscribe?.(); } catch {}
      // Safety: ensure we stop any per-game listeners when leaving the page
      try { gameUnsubRef.current?.(); } catch {}
      try { playersUnsubRef.current?.(); } catch {}
      gameUnsubRef.current = null;
      playersUnsubRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (joinGameId && user) {
      handleJoinGame(joinGameId);
    }
  }, [joinGameId, user]);

  const handleCreateGame = async () => {
    if (!user || !gameName.trim()) return;
    
    setLoading(true);
    try {
      const gameId = await MyCoverService.createGame(
        user.id,
        user.displayName || "Joueur",
        gameName.trim()
      );
      setShowCreateModal(false);
      setGameName("");
      // Rejoindre automatiquement la partie créée
      navigate(`/dashboard/mycover?join=${gameId}`);
    } catch (error) {
      console.error("Erreur création partie:", error);
      alert("Erreur lors de la création de la partie");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async (gameId: string, asSpectator: boolean = false) => {
    if (!user) return;
    
    try {
      await MyCoverService.joinGame(gameId, user.id, user.displayName || "Joueur", asSpectator);
      
      // S'abonner à cette partie spécifique
      // Stop previous listeners if any to avoid duplicates
      try { gameUnsubRef.current?.(); } catch {}
      try { playersUnsubRef.current?.(); } catch {}
      const gameUnsub = MyCoverService.subscribeToGame(gameId, (game) => {
        if (!game) {
          setCurrentGame(null);
          setCurrentPlayers([]);
          return;
        }
        setCurrentGame(game);
      });
      const playersUnsub = MyCoverService.subscribeToPlayers(gameId, (players) => {
        setCurrentPlayers(players);
        
        // Vérifier si l'utilisateur est toujours dans la partie
        const userPlayer = players.find(p => p.id === user.id);
        if (!userPlayer || !userPlayer.isConnected) {
          setCurrentGame(null);
          setCurrentPlayers([]);
          try { gameUnsub(); } catch {}
          try { playersUnsub(); } catch {}
          gameUnsubRef.current = null;
          playersUnsubRef.current = null;
        }
      });
      gameUnsubRef.current = gameUnsub;
      playersUnsubRef.current = playersUnsub;

      // Nettoyer l'URL
      navigate("/dashboard/mycover", { replace: true });
    } catch (error) {
      console.error("Erreur rejoindre partie:", error);
      alert(error instanceof Error ? error.message : "Erreur lors de la connexion à la partie");
    }
  };

  const handleLeaveGame = async () => {
    if (!currentGame || !user) return;
    try {
      await MyCoverService.leaveGame(currentGame.id, user.id);
      setCurrentGame(null);
      setCurrentPlayers([]);
      try { gameUnsubRef.current?.(); } catch {}
      try { playersUnsubRef.current?.(); } catch {}
      gameUnsubRef.current = null;
      playersUnsubRef.current = null;
    } catch (error) {
      console.error("Erreur quitter partie:", error);
    }
  };

  const handleDeleteGame = async (gameId: string) => {
    if (!user) return;
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette partie ?")) return;
    
    try {
      await MyCoverService.deleteGame(gameId, user.id);
    } catch (error) {
      console.error("Erreur suppression partie:", error);
      alert(error instanceof Error ? error.message : "Erreur lors de la suppression");
    }
  };

  // helpers non utilisés supprimés


  // Ajout d'un bot (host uniquement, phase lobby)
  // Ajout d'un bot côté front (host uniquement, phase lobby)
  const handleAddBot = (gameId: string) => {
    // Chercher la partie dans games
    const game = games.find(g => g.id === gameId);
    if (!game || game.phase !== "lobby") return;
    // Générer un bot
    const botId = `bot_${Math.random().toString(36).substr(2, 8)}`;
    const botName = `Bot ${Math.floor(Math.random() * 100)}`;
    // Créer le bot localement (simule l'ajout Firestore)
    // Mock Timestamp complet
    const now = Date.now();
    const seconds = Math.floor(now / 1000);
    const nanoseconds = (now % 1000) * 1e6;
    const mockTimestamp = {
      toDate: () => new Date(now),
      toMillis: () => now,
      seconds,
      nanoseconds,
      isEqual: () => false,
      toJSON: () => ({ seconds, nanoseconds }),
      valueOf: () => String(now)
    };
    setCurrentPlayers(prev => [
      ...prev,
      {
        id: botId,
        nameSnapshot: botName,
        joinedAt: mockTimestamp,
        isHost: false,
        isConnected: true,
        hasVoted: false,
        isSpectator: false,
        isEliminated: false,
        word: null,
        role: "player",
        voteFor: null,
        revealed: false,
        isBot: true
      }
    ]);
  };

  // Si l'utilisateur est dans une partie
  if (currentGame && currentPlayers.length > 0) {
    return (
      <MyCoverGameRoom 
        game={currentGame} 
        players={currentPlayers}
        user={user!} 
        onLeave={handleLeaveGame} 
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* DEBUG: Affichage des parties récupérées */}
      <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-900 mb-2">
        <div>Parties Firestore récupérées: <b>{games.length}</b></div>
        <div>Parties affichées (non terminées): <b>{games.filter(game => game.phase !== "ended").length}</b></div>
        <div>IDs: {games.map(g => g.id).join(", ")}</div>
      </div>
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MYcover</h1>
          <p className="text-gray-600">
            Rejoignez une partie ou créez la vôtre !
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 bg-cactus-600 text-white px-4 py-2 rounded-lg hover:bg-cactus-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Créer une partie</span>
        </button>
      </div>

      {/* Liste des parties actives */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.filter(game => game.phase !== "ended").map((game) => (
          <GameCard 
            key={game.id}
            game={game}
            user={user!}
            onJoin={handleJoinGame}
            onDelete={handleDeleteGame}
            onAddBot={handleAddBot}
          />
        ))}
      </div>

      {games.filter(game => game.phase !== "ended").length === 0 && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Aucune partie active
          </h3>
          <p className="text-gray-600 mb-4">
            Soyez le premier à créer une partie !
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-cactus-600 text-white px-6 py-2 rounded-lg hover:bg-cactus-700 transition-colors"
          >
            Créer une partie
          </button>
        </div>
      )}

      {/* Modal de création */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Créer une nouvelle partie MYcover
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de la partie
                </label>
                <input
                  type="text"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-cactus-500 focus:border-cactus-500"
                  placeholder="Ma super partie"
                  maxLength={50}
                />
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleCreateGame}
                disabled={!gameName.trim() || loading}
                className="flex-1 bg-cactus-600 text-white py-2 rounded-md hover:bg-cactus-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {loading ? "Création..." : "Créer"}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setGameName("");
                }}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-md hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications globales */}
      <MyCoverNotification />
    </div>
  );
};

// Composant pour afficher une carte de partie
const GameCard: React.FC<{
  game: MyCoverGame;
  user: any;
  onJoin: (gameId: string, asSpectator?: boolean) => void;
  onDelete: (gameId: string) => void;
  onAddBot: (gameId: string) => void;
}> = ({ game, user, onJoin, onDelete, onAddBot }) => {
  const [stats, setStats] = useState({
    totalPlayers: 0,
    activePlayers: 0,
    spectators: 0,
    votesCount: 0,
  });

  useEffect(() => {
    const loadStats = async () => {
      const gameStats = await MyCoverService.getGameStats(game.id);
      setStats(gameStats);
    };
    loadStats();
    
    // Recharger les stats toutes les 60s pour minimiser le trafic
    const interval = setInterval(loadStats, 60000);
    return () => clearInterval(interval);
  }, [game.id]);

  const getPhaseIcon = (phase: MyCoverGame["phase"]) => {
    switch (phase) {
      case "lobby": return <Users className="w-4 h-4" />;
      case "started": return <Play className="w-4 h-4" />;
      case "voting": return <Vote className="w-4 h-4" />;
      case "revealed": return <Eye className="w-4 h-4" />;
      case "ended": return <Trophy className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getPhaseLabel = (phase: MyCoverGame["phase"]) => {
    switch (phase) {
      case "lobby": return "En attente";
      case "started": return "En cours";
      case "voting": return "Vote";
      case "revealed": return "Révélation";
      case "ended": return "Terminé";
      default: return "Inconnu";
    }
  };

  const getPhaseColor = (phase: MyCoverGame["phase"]) => {
    switch (phase) {
      case "lobby": return "bg-blue-100 text-blue-800";
      case "started": return "bg-green-100 text-green-800";
      case "voting": return "bg-yellow-100 text-yellow-800";
      case "revealed": return "bg-purple-100 text-purple-800";
      case "ended": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const canJoinAsPlayer = game.phase === "lobby" || (game.allowJoinAfterStart && game.initialPlayerIds.includes(user.id));
  const canJoinAsSpectator = game.allowSpectators && game.phase !== "lobby";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{game.name}</h3>
          <p className="text-sm text-gray-500 flex items-center space-x-1">
            <Crown className="w-3 h-3" />
            <span>{game.hostName}</span>
          </p>
        </div>
        <div className={`px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getPhaseColor(game.phase)}`}>
          {getPhaseIcon(game.phase)}
          <span>{getPhaseLabel(game.phase)}</span>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2 text-gray-600">
            <UserCheck className="w-4 h-4" />
            <span>Joueurs actifs: {stats.activePlayers}/{game.maxPlayers}</span>
          </div>
          {stats.spectators > 0 && (
            <div className="flex items-center space-x-1 text-gray-500">
              <Eye className="w-3 h-3" />
              <span>{stats.spectators}</span>
            </div>
          )}
        </div>
        
        {game.phase === "voting" && (
          <div className="flex items-center space-x-2 text-sm text-yellow-600">
            <Timer className="w-4 h-4" />
            <span>Votes: {stats.votesCount}/{stats.activePlayers}</span>
          </div>
        )}
        
        <div className="text-xs text-gray-500">
          Créé le {game.createdAt.toDate().toLocaleDateString()} à {game.createdAt.toDate().toLocaleTimeString()}
        </div>
      </div>

      <div className="flex space-x-2">
        {canJoinAsPlayer && (
          <button
            onClick={() => onJoin(game.id, false)}
            disabled={stats.activePlayers >= game.maxPlayers}
            className="flex-1 bg-cactus-600 text-white py-2 rounded-md hover:bg-cactus-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
          >
            {stats.activePlayers >= game.maxPlayers ? "Complet" : "Rejoindre"}
          </button>
        )}
        {canJoinAsSpectator && (
          <button
            onClick={() => onJoin(game.id, true)}
            className="flex-1 bg-gray-500 text-white py-2 rounded-md hover:bg-gray-600 transition-colors text-sm"
          >
            Observer
          </button>
        )}
        {!canJoinAsPlayer && !canJoinAsSpectator && (
          <div className="flex-1 text-center py-2 text-gray-500 text-sm">
            Partie non accessible
          </div>
        )}
        {/* Bouton de suppression et ajout de bot visible uniquement pour le host, phase lobby */}
        {game.hostId === user?.id && game.phase === "lobby" && (
          <>
            <button
              onClick={() => onDelete(game.id)}
              className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm"
            >
              Supprimer
            </button>
            <button
              onClick={() => onAddBot(game.id)}
              className="px-3 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors text-sm"
            >
              Ajouter un bot
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default MyCoverPage;