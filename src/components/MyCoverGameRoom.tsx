import React, { useState, useEffect } from "react";
import { 
  Users, 
  Crown, 
  Eye, 
  EyeOff, 
  Play, 
  Vote, 
  Trophy, 
  UserX,
  Timer,
  Target,
  RefreshCw
} from "lucide-react";
import MyCoverService, { MyCoverGame, MyCoverPlayer } from "../services/mycoverService";

interface MyCoverGameRoomProps {
  game: MyCoverGame;
  players: MyCoverPlayer[];
  user: any;
  onLeave: () => void;
}

const MyCoverGameRoom: React.FC<MyCoverGameRoomProps> = ({ 
  game, 
  players, 
  user, 
  onLeave 
}) => {
  const [showWord, setShowWord] = useState(false);
  const [votingTimer, setVotingTimer] = useState(60);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const currentPlayer = players.find(p => p.id === user.id);
  const isHost = currentPlayer?.isHost || false;
  const isSpectator = currentPlayer?.isSpectator || false;
  const activePlayers = players.filter(p => p.isConnected && !p.isSpectator && !p.isEliminated);
  const spectators = players.filter(p => p.isConnected && p.isSpectator);

  // Timer pour le vote
  useEffect(() => {
    if (game.phase === "voting") {
      setVotingTimer(60);
      const interval = setInterval(() => {
        setVotingTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [game.phase]);

  const handleStartGame = async () => {
    if (!isHost) return;
    setLoading(true);
    try {
      await MyCoverService.startGame(game.id, user.id);
    } catch (error) {
      console.error("Erreur démarrage:", error);
      alert(error instanceof Error ? error.message : "Erreur lors du démarrage");
    } finally {
      setLoading(false);
    }
  };

  const handleStartVoting = async () => {
    if (!isHost) return;
    setLoading(true);
    try {
      await MyCoverService.startVoting(game.id, user.id);
    } catch (error) {
      console.error("Erreur lancement vote:", error);
      alert(error instanceof Error ? error.message : "Erreur lors du lancement du vote");
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (targetId: string) => {
    if (isSpectator || currentPlayer?.isEliminated || currentPlayer?.hasVoted) return;
    
    setLoading(true);
    try {
      await MyCoverService.voteForPlayer(game.id, user.id, targetId);
      setSelectedVote(targetId);
    } catch (error) {
      console.error("Erreur vote:", error);
      alert(error instanceof Error ? error.message : "Erreur lors du vote");
    } finally {
      setLoading(false);
    }
  };

  const handleEndVoting = async () => {
    if (!isHost) return;
    setLoading(true);
    try {
      const result = await MyCoverService.endVoting(game.id, user.id);
      
      // Afficher le résultat
      const message = result.isWhite 
        ? `${result.eliminatedPlayer.nameSnapshot} était Mr White ! Les joueurs gagnent !`
        : `${result.eliminatedPlayer.nameSnapshot} n'était pas Mr White. Le jeu continue...`;
      
      alert(message);
      
      // Si Mr White a été éliminé, terminer la partie
      if (result.isWhite) {
        await MyCoverService.endGame(game.id, user.id, "players");
      }
    } catch (error) {
      console.error("Erreur fin vote:", error);
      alert(error instanceof Error ? error.message : "Erreur lors de la fin du vote");
    } finally {
      setLoading(false);
    }
  };

  const handleEndGame = async (winner: "white" | "players") => {
    if (!isHost) return;
    setLoading(true);
    try {
      await MyCoverService.endGame(game.id, user.id, winner);
    } catch (error) {
      console.error("Erreur fin partie:", error);
      alert(error instanceof Error ? error.message : "Erreur lors de la fin de partie");
    } finally {
      setLoading(false);
    }
  };

  const getPlayerRole = (player: MyCoverPlayer) => {
    if (!player.revealed) return null;
    return player.role === "white" ? "Mr White" : "Joueur";
  };

  const getPlayerWord = (player: MyCoverPlayer) => {
    if (!player.revealed) return null;
    return player.word || "Aucun mot";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{game.name}</h1>
          <p className="text-gray-600">
            {game.phase === "lobby" && "En attente des joueurs"}
            {game.phase === "started" && "Partie en cours - Décrivez votre mot"}
            {game.phase === "voting" && "Phase de vote"}
            {game.phase === "revealed" && "Résultats du vote"}
            {game.phase === "ended" && `Partie terminée - ${game.winner === "white" ? "Mr White" : "Les joueurs"} ont gagné !`}
          </p>
        </div>
        <div className="flex space-x-2">
          {isHost && game.phase === "lobby" && activePlayers.length >= 3 && (
            <button
              onClick={handleStartGame}
              disabled={loading}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <Play className="w-4 h-4" />
              <span>Démarrer</span>
            </button>
          )}
          
          {isHost && game.phase === "started" && (
            <button
              onClick={handleStartVoting}
              disabled={loading}
              className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors flex items-center space-x-2"
            >
              <Vote className="w-4 h-4" />
              <span>Lancer le vote</span>
            </button>
          )}
          
          {isHost && game.phase === "voting" && (
            <button
              onClick={handleEndVoting}
              disabled={loading}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
            >
              <Timer className="w-4 h-4" />
              <span>Terminer le vote</span>
            </button>
          )}
          
          {isHost && game.phase === "revealed" && (
            <div className="flex space-x-2">
              <button
                onClick={() => handleEndGame("white")}
                disabled={loading}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                Mr White gagne
              </button>
              <button
                onClick={() => handleEndGame("players")}
                disabled={loading}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                Joueurs gagnent
              </button>
            </div>
          )}
          
          <button
            onClick={onLeave}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Quitter
          </button>
        </div>
      </div>

      {/* Informations du joueur */}
      {currentPlayer && !isSpectator && (game.phase === "started" || game.phase === "voting" || game.phase === "revealed") && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Vos informations</h3>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Votre rôle :</span>
                <button
                  onMouseDown={() => setShowWord(true)}
                  onMouseUp={() => setShowWord(false)}
                  onMouseLeave={() => setShowWord(false)}
                  className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  {showWord ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span className="text-sm">
                    {showWord ? "Masquer" : "Maintenir pour voir"}
                  </span>
                </button>
              </div>
              
              <div className="p-3 bg-gray-50 rounded-md">
                <div className="font-medium text-lg">
                  {showWord ? (
                    currentPlayer.role === "white" ? (
                      <span className="text-red-600">🕵️ Vous êtes Mr White !</span>
                    ) : (
                      <span className="text-green-600">👤 Vous êtes un joueur normal</span>
                    )
                  ) : (
                    <span className="text-gray-400">████████</span>
                  )}
                </div>
                
                {currentPlayer.role !== "white" && (
                  <div className="mt-2">
                    <span className="text-sm text-gray-600">Votre mot : </span>
                    <span className="font-medium text-lg">
                      {showWord ? (
                        <span className="text-blue-600">{currentPlayer.word}</span>
                      ) : (
                        <span className="text-gray-400">████████</span>
                      )}
                    </span>
                  </div>
                )}
                
                {currentPlayer.role === "white" && showWord && (
                  <p className="text-sm text-red-600 mt-2">
                    Vous devez deviner le mot commun en écoutant les autres joueurs.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase de vote */}
      {game.phase === "voting" && !isSpectator && !currentPlayer?.isEliminated && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-yellow-900">Phase de vote</h3>
            <div className="flex items-center space-x-2 text-yellow-700">
              <Timer className="w-5 h-5" />
              <span className="font-bold text-lg">{votingTimer}s</span>
            </div>
          </div>
          
          <p className="text-yellow-800 mb-4">
            Votez pour éliminer le joueur que vous pensez être Mr White :
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {activePlayers
              .filter(p => p.id !== user.id)
              .map(player => (
                <button
                  key={player.id}
                  onClick={() => handleVote(player.id)}
                  disabled={currentPlayer?.hasVoted || loading}
                  className={`p-3 rounded-lg border transition-colors ${
                    selectedVote === player.id || currentPlayer?.voteFor === player.id
                      ? "bg-yellow-200 border-yellow-400 text-yellow-900"
                      : "bg-white border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4" />
                    <span className="font-medium">{player.nameSnapshot}</span>
                  </div>
                </button>
              ))}
          </div>
          
          {currentPlayer?.hasVoted && (
            <p className="text-green-700 mt-4 font-medium">
              ✅ Vous avez voté pour {players.find(p => p.id === currentPlayer.voteFor)?.nameSnapshot}
            </p>
          )}
          
          <div className="mt-4 text-sm text-yellow-700">
            Votes reçus : {players.filter(p => p.hasVoted).length} / {activePlayers.length}
          </div>
        </div>
      )}

      {/* Liste des joueurs */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <Users className="w-5 h-5" />
          <span>Joueurs ({activePlayers.length})</span>
          {spectators.length > 0 && (
            <>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600">Spectateurs ({spectators.length})</span>
            </>
          )}
        </h3>
        
        <div className="space-y-3">
          {/* Joueurs actifs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activePlayers.map(player => (
              <div
                key={player.id}
                className={`flex items-center space-x-3 p-3 rounded-lg border ${
                  player.id === user.id 
                    ? "bg-cactus-50 border-cactus-200" 
                    : player.isEliminated
                    ? "bg-red-50 border-red-200"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  player.isHost ? "bg-yellow-100" : "bg-gray-100"
                }`}>
                  {player.isHost ? (
                    <Crown className="w-4 h-4 text-yellow-600" />
                  ) : player.isEliminated ? (
                    <UserX className="w-4 h-4 text-red-600" />
                  ) : (
                    <Users className="w-4 h-4 text-gray-600" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {player.nameSnapshot}
                    {player.id === user.id && " (Vous)"}
                  </p>
                  
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-gray-500">
                      {player.isHost ? "Hôte" : "Joueur"}
                    </span>
                    
                    {game.phase === "voting" && player.hasVoted && (
                      <span className="text-green-600">• Voté</span>
                    )}
                    
                    {player.isEliminated && (
                      <span className="text-red-600">• Éliminé</span>
                    )}
                  </div>
                  
                  {/* Affichage du rôle révélé */}
                  {player.revealed && (
                    <div className="mt-1">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        player.role === "white" 
                          ? "bg-red-100 text-red-800" 
                          : "bg-blue-100 text-blue-800"
                      }`}>
                        {getPlayerRole(player)} - {getPlayerWord(player)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Spectateurs */}
          {spectators.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Spectateurs</h4>
              <div className="flex flex-wrap gap-2">
                {spectators.map(spectator => (
                  <div
                    key={spectator.id}
                    className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-full"
                  >
                    <Eye className="w-3 h-3 text-gray-500" />
                    <span className="text-sm text-gray-700">
                      {spectator.nameSnapshot}
                      {spectator.id === user.id && " (Vous)"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Instructions du jeu */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Comment jouer à MYcover</h3>
        <div className="text-sm text-gray-700 space-y-2">
          <p>• Tous les joueurs sauf un (Mr White) reçoivent le même mot secret</p>
          <p>• Chacun doit décrire son mot sans être trop évident (pour ne pas aider Mr White)</p>
          <p>• À la fin d'un tour, tous votent pour éliminer quelqu'un qu'ils soupçonnent être Mr White</p>
          <p>• Si Mr White est éliminé, il peut tenter de deviner le mot exact pour gagner</p>
          <p>• Sinon, les autres joueurs gagnent</p>
        </div>
      </div>
    </div>
  );
};

export default MyCoverGameRoom;