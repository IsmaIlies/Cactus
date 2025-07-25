import React, { useEffect, useState } from "react";
import MrWhiteService, { GameSession, Player } from "../services/mrWhiteService";
import { Clock } from "lucide-react";

interface VotingPhaseProps {
  game: GameSession;
  user: any;
  onPlayerEliminated?: (eliminatedPlayer: any, isCorrect: boolean) => void;
}

const VOTE_DURATION = 60; // secondes

const VotingPhase: React.FC<VotingPhaseProps> = ({ game, user, onPlayerEliminated }) => {
  const [timer, setTimer] = useState(VOTE_DURATION);
  const [votedFor, setVotedFor] = useState<string | null>(game.votes?.[user.id] || null);
  const [submitting, setSubmitting] = useState(false);
  const [allVotedTriggered, setAllVotedTriggered] = useState(false);
  const [voteResults, setVoteResults] = useState<{
    eliminatedPlayer: any;
    isCorrect: boolean;
    voteCounts: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    if (timer <= 0) {
      // Temps écoulé, calculer les résultats
      calculateVoteResults();
      return;
    }
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  // Calculer les résultats du vote
  const calculateVoteResults = () => {
    if (voteResults) return; // Déjà calculé
    
    const votes = game.votes || {};
    const voteCounts: Record<string, number> = {};
    
    // Compter les votes
    Object.values(votes).forEach(targetId => {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });
    
    // Trouver le joueur le plus voté
    let eliminatedPlayerId = "";
    let maxVotes = 0;
    
    Object.entries(voteCounts).forEach(([playerId, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedPlayerId = playerId;
      }
    });
    
    if (eliminatedPlayerId) {
      const eliminatedPlayer = game.players.find(p => p.id === eliminatedPlayerId);
      const isCorrect = eliminatedPlayerId === game.mrWhiteId;
      
      const results = {
        eliminatedPlayer,
        isCorrect,
        voteCounts
      };
      
      setVoteResults(results);
      
      // Notifier le parent
      if (onPlayerEliminated && eliminatedPlayer) {
        onPlayerEliminated(eliminatedPlayer, isCorrect);
      }
    }
  };

  // Vérifier si tous les joueurs humains ont voté
  useEffect(() => {
    if (!game) return;
    
    const humanPlayers = (game.players || []).filter(p => p.isConnected && !p.isBot);
    const humanVotes = Object.keys(game.votes || {}).filter(voterId => 
      humanPlayers.some(p => p.id === voterId)
    );
    
    if (humanVotes.length === humanPlayers.length && humanPlayers.length > 0 && !allVotedTriggered) {
      // Tous les humains ont voté, réduire le timer à 7 secondes
      setAllVotedTriggered(true);
      if (timer > 7) {
        setTimer(7);
      }
    }
  }, [game?.votes, allVotedTriggered, timer, game]);

  const handleVote = async (targetId: string) => {
    if (!game || !user) return;
    
    setSubmitting(true);
    try {
      await MrWhiteService.voteForPlayer(game.id, user.id, targetId);
      setVotedFor(targetId);
    } catch (e) {
      alert("Erreur lors du vote");
    } finally {
      setSubmitting(false);
    }
  };

  // Liste des joueurs à voter (hors soi-même)
  const players = (Array.isArray(game?.players) ? game.players : []).filter(p => p.isConnected && p.id !== user?.id);
  
  // Protection contre game undefined
  if (!game || !user) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Erreur : Données de jeu manquantes</p>
      </div>
    );
  }

  // Affichage des résultats du vote
  if (voteResults) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-4 text-center">Résultats du vote</h3>
        
        <div className="text-center mb-6">
          <div className={`inline-block px-4 py-2 rounded-lg ${
            voteResults.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            <p className="font-bold text-lg">
              {voteResults.eliminatedPlayer?.name} a été éliminé !
            </p>
            <p className="text-sm mt-1">
              {voteResults.isCorrect 
                ? "🎉 C'était bien Mister White ! Les autres joueurs gagnent !" 
                : `❌ Ce n'était pas Mister White ! ${voteResults.eliminatedPlayer?.name} était ${
                    voteResults.eliminatedPlayer?.id === game.oddOneId ? 'le joueur piège' : 'un joueur normal'
                  }`
              }
            </p>
          </div>
        </div>
        
        {/* Révéler le rôle du joueur éliminé */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <h4 className="font-medium text-gray-900 mb-2">Rôle révélé :</h4>
          <div className="flex items-center justify-center">
            {voteResults.eliminatedPlayer?.id === game.mrWhiteId && (
              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                🕵️ Mister White
              </span>
            )}
            {voteResults.eliminatedPlayer?.id === game.oddOneId && (
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                🎭 Joueur piège (mot: {game.oddWord})
              </span>
            )}
            {voteResults.eliminatedPlayer?.id !== game.mrWhiteId && voteResults.eliminatedPlayer?.id !== game.oddOneId && (
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                👤 Joueur normal (mot: {game.secretWord})
              </span>
            )}
          </div>
        </div>
        
        {/* Détail des votes */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">Détail des votes :</h4>
          <div className="space-y-1">
            {Object.entries(voteResults.voteCounts).map(([playerId, count]) => {
              const player = game.players.find(p => p.id === playerId);
              return (
                <div key={playerId} className="flex justify-between text-sm">
                  <span>{player?.name}</span>
                  <span className="font-medium">{count} vote{count > 1 ? 's' : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
        
        {!voteResults.isCorrect && (
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600 mb-2">
              Le jeu continue ! Mister White est toujours parmi vous...
            </p>
            <button
              onClick={() => {
                // Relancer un nouveau vote (à implémenter)
                setVoteResults(null);
                setTimer(VOTE_DURATION);
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Nouveau vote
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <h3 className="font-semibold text-yellow-900 mb-2">Phase de vote</h3>
      <div className="flex items-center space-x-4 mb-4">
        <Clock className="w-5 h-5 text-yellow-700" />
        <span className="text-lg font-bold text-yellow-800">{timer}s</span>
        <span className="text-sm text-yellow-700">Votez pour démasquer Mister White !</span>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-gray-700 mb-2">Choisissez le joueur que vous pensez être Mister White :</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {players.map((p) => (
            <button
              key={p.id}
              disabled={!!votedFor || submitting || p.isBot}
              onClick={() => handleVote(p.id)}
              className={`px-3 py-2 rounded border font-medium transition-colors ${
                votedFor === p.id 
                  ? "bg-yellow-400 text-white" 
                  : p.isBot 
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-white border-yellow-400 text-yellow-900 hover:bg-yellow-100"
              } disabled:opacity-60`}
            >
              {p.name} {p.isBot ? "(Bot)" : ""}
            </button>
          ))}
        </div>
        {votedFor && <p className="text-green-700 mt-2">Vous avez voté !</p>}
      </div>
      
      {/* Affichage des votes en cours */}
      <div className="mt-4 bg-gray-50 rounded-lg p-3">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Votes en cours :</h4>
        <div className="text-xs text-gray-600">
          {Object.keys(game.votes || {}).length} / {(game.players || []).filter(p => p.isConnected && !p.isBot).length} joueurs ont voté
        </div>
      </div>
    </div>
  );
};

export default VotingPhase;
