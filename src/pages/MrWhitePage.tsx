import React, { useState, useEffect } from "react";

// Pour typer la propriété globale window
declare global {
  interface Window {
    currentGameUnsub?: (() => void) | null;
  }
}
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
  RefreshCw
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import MrWhiteService, { GameSession, Player } from "../services/mrWhiteService";
import VotingPhase from "./VotingPhase";

const MrWhitePage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [games, setGames] = useState<GameSession[]>([]);
  const [currentGame, setCurrentGame] = useState<GameSession | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [gameName, setGameName] = useState("");
  const [loading, setLoading] = useState(false);

  // Seul l'admin peut créer une partie
  const isAdmin = user && user.role === 'admin';

  // Auto-join si un gameId est dans l'URL
  const joinGameId = searchParams.get("join");

  useEffect(() => {
    const unsubscribe = MrWhiteService.subscribeToGames(setGames);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (joinGameId && user) {
      handleJoinGame(joinGameId);
    }
  }, [joinGameId, user]);

  const handleCreateGame = async () => {
    if (!user || !gameName.trim() || !isAdmin) return;
    
    setLoading(true);
    try {
      const gameId = await MrWhiteService.createGame(
        user.id,
        user.displayName || "Joueur",
        gameName.trim()
      );
      setShowCreateModal(false);
      setGameName("");
      // Rejoindre automatiquement la partie créée
      navigate(`/dashboard/mrwhite?join=${gameId}`);
    } catch (error) {
      console.error("Erreur création partie:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGame = async (gameId: string) => {
    if (!user) return;
    
    try {
      await MrWhiteService.joinGame(gameId, user.id, user.displayName || "Joueur");
      // S'abonner à cette partie spécifique
      if (window.currentGameUnsub) window.currentGameUnsub();
      window.currentGameUnsub = MrWhiteService.subscribeToGame(gameId, (game) => {
        if (!game || !game.players.some(p => p.id === user.id)) {
          setCurrentGame(null);
          if (window.currentGameUnsub) window.currentGameUnsub();
          window.currentGameUnsub = null;
          return;
        }
        setCurrentGame(game);
      });
      // Nettoyer l'URL
      navigate("/dashboard/mrwhite", { replace: true });
    } catch (error) {
      console.error("Erreur rejoindre partie:", error);
    }
  };

  const handleLeaveGame = async () => {
    if (!currentGame || !user) return;
    try {
      await MrWhiteService.leaveGame(currentGame.id, user.id);
      setCurrentGame(null);
      if (window.currentGameUnsub) {
        window.currentGameUnsub();
        window.currentGameUnsub = null;
      }
    } catch (error) {
      console.error("Erreur quitter partie:", error);
    }
  };

  const handleStartGame = async () => {
    if (!currentGame || !user || currentGame.hostId !== user.id) return;
    
    try {
      await MrWhiteService.startGame(currentGame.id);
    } catch (error) {
      console.error("Erreur démarrage partie:", error);
    }
  };

  const handleDeleteGame = async (gameId: string) => {
    if (!user) return;
    try {
      await MrWhiteService.deleteGame(gameId);
    } catch (error) {
      console.error("Erreur suppression partie:", error);
    }
  };

  const getPhaseIcon = (phase: GameSession["phase"]) => {
    switch (phase) {
      case "lobby": return <Users className="w-4 h-4" />;
      case "playing": return <Play className="w-4 h-4" />;
      case "voting": return <Vote className="w-4 h-4" />;
      case "finished": return <Trophy className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getPhaseLabel = (phase: GameSession["phase"]) => {
    switch (phase) {
      case "lobby": return "En attente";
      case "playing": return "En cours";
      case "voting": return "Vote";
      case "finished": return "Terminé";
      default: return "Inconnu";
    }
  };

  const getPhaseColor = (phase: GameSession["phase"]) => {
    switch (phase) {
      case "lobby": return "bg-blue-100 text-blue-800";
      case "playing": return "bg-green-100 text-green-800";
      case "voting": return "bg-yellow-100 text-yellow-800";
      case "finished": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  // Si l'utilisateur est dans une partie
  if (currentGame) {
    return <GameRoom game={currentGame} user={user!} onLeave={handleLeaveGame} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MYcover</h1>
          <p className="text-gray-600">
            Rejoignez une partie ou créez la vôtre !
          </p>
        </div>
        {isAdmin ? (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 bg-cactus-600 text-white px-4 py-2 rounded-lg hover:bg-cactus-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Créer une partie</span>
          </button>
        ) : (
          <span className="text-gray-400 italic">Seul l'administrateur peut créer une partie</span>
        )}
      </div>

      {/* Liste des parties actives */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.filter(game => game.phase === "lobby").map((game) => (
          <div
            key={game.id}
            className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
          >
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

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Users className="w-4 h-4" />
                <span>{(Array.isArray(game.players) ? game.players : []).filter(p => p.isConnected).length}/{game.maxPlayers}</span>
              </div>
              <div className="text-xs text-gray-500">
                {game.createdAt.toDate().toLocaleTimeString()}
              </div>
            </div>

            <div className="flex space-x-2">
              {Array.isArray(game.players) && game.players.some(p => p.id === user?.id && p.isConnected) ? (
                <button
                  onClick={() => handleJoinGame(game.id)}
                  className="flex-1 bg-gradient-to-r from-cactus-400 via-cactus-500 to-cactus-600 text-white font-semibold py-2 rounded-md text-center shadow-md hover:from-cactus-500 hover:to-cactus-700 transition-colors border-2 border-cactus-700"
                >
                  Déjà ici
                </button>
              ) : (
                <button
                  onClick={() => handleJoinGame(game.id)}
                  disabled={(Array.isArray(game.players) ? game.players : []).filter(p => p.isConnected).length >= game.maxPlayers}
                  className="flex-1 bg-cactus-600 text-white py-2 rounded-md hover:bg-cactus-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {(Array.isArray(game.players) ? game.players : []).filter(p => p.isConnected).length >= game.maxPlayers ? "Complet" : "Rejoindre"}
                </button>
              )}
              {/* Bouton de suppression visible uniquement pour le host */}
              {game.hostId === user?.id && (
                <button
                  onClick={() => handleDeleteGame(game.id)}
                  className="flex-1 bg-red-500 text-white py-2 rounded-md hover:bg-red-600 transition-colors"
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {games.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Aucune partie active
          </h3>
          <p className="text-gray-600 mb-4">
            Soyez le premier à créer une partie !
          </p>
          {isAdmin ? (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-cactus-600 text-white px-6 py-2 rounded-lg hover:bg-cactus-700 transition-colors"
            >
              Créer une partie
            </button>
          ) : (
            <span className="text-gray-400 italic">Seul l'administrateur peut créer une partie</span>
          )}
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
    </div>
  );
};

// Composant pour la salle de jeu
const GameRoom: React.FC<{
  game: GameSession;
  user: any;
  onLeave: () => void;
}> = ({ game, user, onLeave }) => {
  const isHost = game.hostId === user.id;
  const connectedPlayers = (Array.isArray(game.players) ? game.players : []).filter(p => p.isConnected);
  const canStart = isHost && connectedPlayers.length >= 3 && game.phase === "lobby";

  const handleStartGame = async () => {
    try {
      await MrWhiteService.startGame(game.id);
    } catch (error) {
      console.error("Erreur démarrage:", error);
    }
  };

  // Gestion de l'affichage caché/affiché du mot
  const [showWord, setShowWord] = React.useState(false);
  // Détermination du rôle du joueur
  const isMrWhite = game.mrWhiteId === user.id;
  const isOddOne = game.oddOneId === user.id;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">MYcover</h1>
          <p className="text-gray-600">
            {getPhaseLabel(game.phase)} • {connectedPlayers.length} joueur{connectedPlayers.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex space-x-2">
          {canStart && (
            <button
              onClick={handleStartGame}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <Play className="w-4 h-4" />
              <span>Démarrer</span>
            </button>
          )}
          <button
            onClick={onLeave}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Quitter
          </button>
        </div>
      </div>

      {/* Phase du jeu */}
      {game.phase === "lobby" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">En attente des joueurs</h3>
          <p className="text-blue-700 text-sm">
            {isHost 
              ? `Vous pouvez démarrer la partie avec au moins 3 joueurs (${connectedPlayers.length}/10)`
              : `En attente que ${game.hostName} démarre la partie...`}
          </p>
        </div>
      )}
      {game.phase === "playing" && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-900 mb-2">Partie en cours</h3>
          <div className="space-y-2">
            {/* Affichage du rôle et du mot (uniquement pour soi) */}
            {isMrWhite && (
              <div className="bg-red-100 border border-red-300 rounded-md p-3">
                <p className="font-bold text-red-800">🕵️ Vous êtes Mister White !</p>
                <p className="text-sm text-red-700">Vous n'avez pas de mot. Essayez de deviner le mot commun en écoutant les autres.</p>
              </div>
            )}
            {isOddOne && (
              <div className="bg-yellow-100 border border-yellow-300 rounded-md p-3">
                <p className="font-bold text-yellow-800">🎭 Vous êtes le joueur piège !</p>
                <p className="text-sm text-yellow-700 mb-1">Votre mot piège :</p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowWord((v) => !v)}
                    className="text-xs px-2 py-1 border border-yellow-400 rounded hover:bg-yellow-200"
                  >
                    {showWord ? "Masquer" : "Afficher"}
                  </button>
                  <span className="font-bold text-lg text-yellow-900">{showWord ? game.oddWord : "••••••"}</span>
                </div>
              </div>
            )}
            {!isMrWhite && !isOddOne && (
              <div className="bg-white border border-green-300 rounded-md p-3">
                <p className="font-bold text-green-800">🔒 Votre mot secret :</p>
                <div className="flex items-center space-x-2 mt-1">
                  <button
                    onClick={() => setShowWord((v) => !v)}
                    className="text-xs px-2 py-1 border border-green-400 rounded hover:bg-green-100"
                  >
                    {showWord ? "Masquer" : "Afficher"}
                  </button>
                  <span className="font-bold text-lg text-green-900">{showWord ? game.secretWord : "••••••"}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phase de vote - Vérification que game et user existent */}
      {game && user && game.phase === "voting" && (
        <VotingPhase game={game} user={user} />
      )}

      {/* Liste des joueurs */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <Users className="w-5 h-5" />
          <span>Joueurs ({connectedPlayers.length})</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {connectedPlayers.map((player: Player) => (
            <div
              key={player.id}
              className={`flex items-center space-x-3 p-3 rounded-lg border ${
                player.id === user.id 
                  ? "bg-cactus-50 border-cactus-200" 
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                player.isHost ? "bg-yellow-100" : "bg-gray-100"
              }`}>
                {player.isHost ? (
                  <Crown className="w-4 h-4 text-yellow-600" />
                ) : (
                  <Users className="w-4 h-4 text-gray-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {player.name}
                  {player.id === user.id && " (Vous)"}
                  {/* Affichage du rôle */}
                  {game.mrWhiteId === player.id && <span className="ml-2 text-xs text-red-700">[Mister White]</span>}
                  {game.oddOneId === player.id && <span className="ml-2 text-xs text-yellow-700">[Piège]</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {player.isHost ? "Hôte" : "Joueur"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions du jeu */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-2">Comment jouer</h3>
        <div className="text-sm text-gray-700 space-y-1">
          <p>• Tous les joueurs sauf un (Mister White) reçoivent le même mot secret</p>
          <p>• Un joueur reçoit un mot "piège"</p>
          <p>• Chacun donne un indice sur le mot sans être trop évident</p>
          <p>• Mister White doit deviner le mot en écoutant les indices</p>
          <p>• À la fin, tout le monde vote pour identifier Mister White</p>
          <p>• Mister White gagne s'il devine le mot ou n'est pas découvert</p>
        </div>
      </div>
    </div>
  );
};

function getPhaseLabel(phase: GameSession["phase"]): string {
  switch (phase) {
    case "lobby": return "En attente";
    case "playing": return "En cours";
    case "voting": return "Vote";
    case "finished": return "Terminé";
    default: return "Inconnu";
  }
}

export default MrWhitePage;