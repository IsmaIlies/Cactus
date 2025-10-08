import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  arrayUnion,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isBot?: boolean;
  hasVoted: boolean;
  votedFor?: string;
  isConnected: boolean;
  joinedAt: Timestamp;
}

export interface GameSession {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  players: Player[];
  phase: "lobby" | "playing" | "voting" | "finished";
  maxPlayers: number;
  secretWord?: string;
  mrWhiteId?: string;
  oddOneId?: string;
  oddWord?: string;
  votes: Record<string, string>; // playerId -> votedForPlayerId
  winner?: "mrwhite" | "others";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GameEvent {
  id: string;
  type: "NEW_GAME" | "GAME_STARTED" | "GAME_ENDED";
  gameId: string;
  gameName: string;
  hostName: string;
  message: string;
  createdAt: Timestamp;
}

// Mots secrets pour le jeu
const SECRET_WORDS = [
  "CANAL+",
  "CANAL+ Ciné Séries",
  "CANAL+ Sport",
  "CANAL+ 100%"
];

class MrWhiteService {
  private gamesCollection = collection(db, "mrwhite_games");
  private eventsCollection = collection(db, "mrwhite_events");

  // Créer une nouvelle session de jeu
  async createGame(hostId: string, hostName: string, gameName: string): Promise<string> {
    try {
      const gameData: Omit<GameSession, "id"> = {
        name: gameName,
        hostId,
        hostName,
        players: [{
          id: hostId,
          name: hostName,
          isHost: true,
          hasVoted: false,
          isConnected: true,
          joinedAt: Timestamp.now(),
        }],
        phase: "lobby",
        maxPlayers: 10,
        votes: {},
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await addDoc(this.gamesCollection, gameData);

      // Créer un événement pour notifier tous les utilisateurs
      await this.createGameEvent("NEW_GAME", docRef.id, gameName, hostName, 
        `${hostName} a créé une nouvelle partie "${gameName}"`);

      return docRef.id;
    } catch (error) {
      console.error("Erreur lors de la création du jeu:", error);
      throw error;
    }
  }

  // Rejoindre une session
  async joinGame(gameId: string, playerId: string, playerName: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      // Récupérer le document actuel
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) {
        throw new Error("Game not found");
      }
      const gameData = gameDoc.data() as GameSession;
      // Vérifier si le joueur est déjà dans la partie
      const alreadyInGame = Array.isArray(gameData.players) && gameData.players.some(p => p.id === playerId);
      if (alreadyInGame) {
        // Si déjà présent, on le marque comme connecté
        const updatedPlayers = gameData.players.map(p =>
          p.id === playerId ? { ...p, isConnected: true } : p
        );
        await updateDoc(gameRef, {
          players: updatedPlayers,
          updatedAt: serverTimestamp(),
        });
        return;
      }
      // Sinon, on l'ajoute
      const newPlayer: Player = {
        id: playerId,
        name: playerName,
        isHost: false,
        hasVoted: false,
        isConnected: true,
        joinedAt: Timestamp.now(),
      };
      await updateDoc(gameRef, {
        players: arrayUnion(newPlayer),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Erreur lors de la connexion au jeu:", error);
      throw error;
    }
  }

  // Quitter une session
  async leaveGame(gameId: string, playerId: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      
      // Récupérer le document actuel
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) {
        throw new Error("Game not found");
      }

      const gameData = gameDoc.data() as GameSession;
      
      // Mettre à jour le statut de connexion du joueur dans l'array
      const updatedPlayers = gameData.players.map(player => 
        player.id === playerId 
          ? { ...player, isConnected: false }
          : player
      );

      // Mettre à jour le document avec l'array modifié
      await updateDoc(gameRef, {
        players: updatedPlayers,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Erreur lors de la déconnexion du jeu:", error);
      throw error;
    }
  }

  // Démarrer le jeu
  async startGame(gameId: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      // Récupérer la partie et les joueurs connectés
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) throw new Error("Game not found");
      const gameData = gameDoc.data() as GameSession;
      const players = (gameData.players || []).filter(p => p.isConnected);
      if (players.length < 3) throw new Error("Il faut au moins 3 joueurs connectés");

      // Tirage des rôles
      const shuffled = [...players].sort(() => Math.random() - 0.5);
      const mrWhite = shuffled[0];
      let oddOne = shuffled[1];
      if (players.length === 3) {
        // Si 3 joueurs, oddOne = 2e, le reste = mot commun
        oddOne = shuffled[1];
      } else {
        // Si plus, oddOne = 2e, le reste = mot commun
        oddOne = shuffled[1];
      }
  // const others = shuffled.filter(p => p.id !== mrWhite.id && p.id !== oddOne.id);

      // Mot commun et mot différent
      const secretWord = SECRET_WORDS[Math.floor(Math.random() * SECRET_WORDS.length)];
      let oddWord = secretWord;
      while (oddWord === secretWord && SECRET_WORDS.length > 1) {
        oddWord = SECRET_WORDS[Math.floor(Math.random() * SECRET_WORDS.length)];
      }

      // Stocker les rôles/mots dans la session
      await updateDoc(gameRef, {
        phase: "playing",
        secretWord,
        mrWhiteId: mrWhite.id,
        oddOneId: oddOne.id,
        oddWord,
        updatedAt: serverTimestamp(),
      });

      await this.createGameEvent("GAME_STARTED", gameId, "", "", "La partie a commencé !");
    } catch (error) {
      console.error("Erreur lors du démarrage du jeu:", error);
      throw error;
    }
  }

  // Voter pour un joueur
  async voteForPlayer(gameId: string, voterId: string, targetId: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      
      await updateDoc(gameRef, {
        [`votes.${voterId}`]: targetId,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Erreur lors du vote:", error);
      throw error;
    }
  }

  // Terminer le jeu et calculer les résultats
  async endGame(gameId: string, winner?: "mrwhite" | "others"): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      
      await updateDoc(gameRef, {
        phase: "finished",
        winner: winner || "others",
        updatedAt: serverTimestamp(),
      });

      await this.createGameEvent("GAME_ENDED", gameId, "", "", 
        "La partie est terminée !");
    } catch (error) {
      console.error("Erreur lors de la fin du jeu:", error);
      throw error;
    }
  }

  // Éliminer un joueur et vérifier les conditions de victoire
  async eliminatePlayer(gameId: string, eliminatedPlayerId: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) throw new Error("Game not found");
      
      const gameData = gameDoc.data() as GameSession;
      
      // Marquer le joueur comme déconnecté (éliminé)
      const updatedPlayers = gameData.players.map(player => 
        player.id === eliminatedPlayerId 
          ? { ...player, isConnected: false }
          : player
      );
      
      // Vérifier si c'était Mister White
      const wasMrWhite = eliminatedPlayerId === gameData.mrWhiteId;
      
      if (wasMrWhite) {
        // Mister White éliminé = les autres gagnent
        await updateDoc(gameRef, {
          players: updatedPlayers,
          phase: "finished",
          winner: "others",
          updatedAt: serverTimestamp(),
        });
      } else {
        // Ce n'était pas Mister White, continuer le jeu
        await updateDoc(gameRef, {
          players: updatedPlayers,
          phase: "playing", // Retour en phase de jeu
          votes: {}, // Reset des votes
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("Erreur lors de l'élimination du joueur:", error);
      throw error;
    }
  }

  // Ajouter des bots pour les tests
  async addBots(gameId: string, count: number = 3): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) throw new Error("Game not found");
      
      const gameData = gameDoc.data() as GameSession;
      const currentPlayers = gameData.players || [];
      
      // Noms de bots amusants
      const botNames = [
        "Bot Alpha", "Bot Beta", "Bot Gamma", "Bot Delta", "Bot Epsilon",
        "Agent Smith", "R2-D2", "C-3PO", "Wall-E", "HAL 9000"
      ];
      
      const newBots: Player[] = [];
      for (let i = 0; i < count; i++) {
        const botName = botNames[i % botNames.length];
        const botId = `bot_${Date.now()}_${i}`;
        
        newBots.push({
          id: botId,
          name: botName,
          isHost: false,
          isBot: true,
          hasVoted: false,
          isConnected: true,
          joinedAt: Timestamp.now(),
        });
      }
      
      await updateDoc(gameRef, {
        players: [...currentPlayers, ...newBots],
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Erreur lors de l'ajout des bots:", error);
      throw error;
    }
  }

  // Faire voter automatiquement les bots
  async makeBotVote(gameId: string, botId: string, targetId: string): Promise<void> {
    try {
      await this.voteForPlayer(gameId, botId, targetId);
    } catch (error) {
      console.error("Erreur vote bot:", error);
    }
  }

  // Simuler les votes des bots automatiquement
  async simulateBotsVoting(gameId: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) return;
      
      const gameData = gameDoc.data() as GameSession;
      const bots = (gameData.players || []).filter(p => p.isBot && p.isConnected);
      const allPlayers = (gameData.players || []).filter(p => p.isConnected);
      
      // Faire voter chaque bot après un délai aléatoire
      bots.forEach((bot, index) => {
        setTimeout(() => {
          // Le bot vote pour un joueur aléatoire (pas lui-même)
          const possibleTargets = allPlayers.filter(p => p.id !== bot.id);
          if (possibleTargets.length > 0) {
            const randomTarget = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
            this.makeBotVote(gameId, bot.id, randomTarget.id);
          }
        }, (index + 1) * 2000); // Délai de 2s entre chaque vote de bot
      });
    } catch (error) {
      console.error("Erreur simulation votes bots:", error);
    }
  }

  // Démarrer la phase de vote
  async startVoting(gameId: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      
      await updateDoc(gameRef, {
        phase: "voting",
        updatedAt: serverTimestamp(),
      });
      
      // Faire voter automatiquement les bots après 3 secondes
      setTimeout(() => {
        this.simulateBotsVoting(gameId);
      }, 3000);
    } catch (error) {
      console.error("Erreur lors du démarrage du vote:", error);
      throw error;
    }
  }

  // Supprimer une session
  async deleteGame(gameId: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      await deleteDoc(gameRef);
    } catch (error) {
      console.error("Erreur lors de la suppression du jeu:", error);
      throw error;
    }
  }

  // Écouter les sessions actives
  subscribeToGames(callback: (games: GameSession[]) => void): () => void {
    // Simplifier la requête pour éviter l'erreur d'index composite
    // Utiliser seulement le filtre sur phase pour l'instant
    const q = query(
      this.gamesCollection,
      where("phase", "in", ["lobby", "playing", "voting"])
    );

    return onSnapshot(
      q,
      (snapshot) => {
        let games = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as GameSession[];
        // Trier côté client par createdAt desc
        games = games.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        callback(games);
      },
      (error) => {
        if ((error as any)?.code === "permission-denied") {
          console.warn("MrWhiteService.subscribeToGames: accès refusé (auth requise ou règles).", error);
        } else {
          console.error("MrWhiteService.subscribeToGames: erreur snapshot", error);
        }
        callback([]);
      }
    );
  }

  // Écouter une session spécifique
  subscribeToGame(gameId: string, callback: (game: GameSession | null) => void): () => void {
    const gameRef = doc(this.gamesCollection, gameId);
    return onSnapshot(
      gameRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const game = { id: snapshot.id, ...snapshot.data() } as GameSession;
          callback(game);
        } else {
          callback(null);
        }
      },
      (error) => {
        if ((error as any)?.code === "permission-denied") {
          console.warn("MrWhiteService.subscribeToGame: accès refusé (auth/règles)", error);
        } else {
          console.error("MrWhiteService.subscribeToGame: erreur snapshot", error);
        }
        callback(null);
      }
    );
  }

  // Écouter les événements globaux
  subscribeToEvents(callback: (events: GameEvent[]) => void): () => void {
    const q = query(
      this.eventsCollection,
      orderBy("createdAt", "desc")
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const events = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as GameEvent[];
        callback(events);
      },
      (error) => {
        if ((error as any)?.code === "permission-denied") {
          console.warn("MrWhiteService.subscribeToEvents: accès refusé (auth/règles)", error);
        } else {
          console.error("MrWhiteService.subscribeToEvents: erreur snapshot", error);
        }
        callback([]);
      }
    );
  }

  // Créer un événement
  private async createGameEvent(
    type: GameEvent["type"],
    gameId: string,
    gameName: string,
    hostName: string,
    message: string
  ): Promise<void> {
    try {
      const eventData: Omit<GameEvent, "id"> = {
        type,
        gameId,
        gameName,
        hostName,
        message,
        createdAt: Timestamp.now(),
      };

      const docRef = await addDoc(this.eventsCollection, eventData);
      // Suppression auto après 10s
      setTimeout(async () => {
        try {
          await deleteDoc(docRef);
        } catch (e) {
          // ignore
        }
      }, 10000);
    } catch (error) {
      console.error("Erreur lors de la création de l'événement:", error);
    }
  }

  // Choisir Mr. White aléatoirement parmi les joueurs connectés
  selectMrWhite(players: Player[]): string {
    const connectedPlayers = players.filter(p => p.isConnected);
    if (connectedPlayers.length === 0) return "";
    
    const randomIndex = Math.floor(Math.random() * connectedPlayers.length);
    return connectedPlayers[randomIndex].id;
  }

  // Calculer les résultats du vote
  calculateVoteResults(votes: Record<string, string>, mrWhiteId: string): {
    winner: "mrwhite" | "others";
    voteCounts: Record<string, number>;
    mostVotedPlayer: string;
  } {
    const voteCounts: Record<string, number> = {};
    
    // Compter les votes
    Object.values(votes).forEach(targetId => {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });

    // Trouver le joueur le plus voté
    let mostVotedPlayer = "";
    let maxVotes = 0;
    
    Object.entries(voteCounts).forEach(([playerId, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        mostVotedPlayer = playerId;
      }
    });

    // Déterminer le gagnant
    const winner = mostVotedPlayer === mrWhiteId ? "others" : "mrwhite";

    return {
      winner,
      voteCounts,
      mostVotedPlayer,
    };
  }
}

export default new MrWhiteService();