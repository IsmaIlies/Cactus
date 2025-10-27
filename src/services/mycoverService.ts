import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  getDoc,
  getDocs,
  writeBatch,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";

export interface MyCoverPlayer {
  id: string; // UID Firebase
  nameSnapshot: string; // nom au moment de l'entrée
  joinedAt: Timestamp;
  isHost: boolean;
  isConnected: boolean;
  hasVoted: boolean;
  isSpectator: boolean;
  isEliminated: boolean;
  word: string | null; // null pour Mr White
  role: "white" | "player";
  voteFor: string | null; // UID du joueur ciblé
  revealed: boolean;
}

export interface MyCoverGame {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  phase: "lobby" | "started" | "voting" | "revealed" | "ended";
  maxPlayers: number;
  word: string | null;
  whitePlayerId: string | null;
  round: number;
  allowSpectators: boolean;
  allowJoinAfterStart: boolean;
  initialPlayerIds: string[];
  isVisible: boolean;
  winner: "white" | "players" | null;
}

export interface MyCoverGameEvent {
  id: string;
  type: "NEW_GAME" | "GAME_STARTED" | "VOTE_STARTED" | "GAME_ENDED";
  gameId: string;
  gameName: string;
  hostName: string;
  message: string;
  createdAt: Timestamp;
}

// Mots prédéfinis pour le jeu
const GAME_WORDS = [
  "CANAL+",
  "CANAL+ Ciné Séries", 
  "CANAL+ Sport",
  "CANAL+ 100%",
  "Netflix",
  "Disney+",
  "Amazon Prime Video",
  "Apple TV+",
  "Paramount+",
  "Max",
  "OCS",
  "France Télévisions",
  "TF1",
  "M6",
  "Arte"
];

class MyCoverService {
  private gamesCollection = collection(db, "games");
  private eventsCollection = collection(db, "mycover_events");

  // Créer une nouvelle partie
  async createGame(hostId: string, hostName: string, gameName: string): Promise<string> {
    try {
      const gameData: Omit<MyCoverGame, "id"> = {
        name: gameName,
        hostId,
        hostName,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        phase: "lobby",
        maxPlayers: 10,
        word: null,
        whitePlayerId: null,
        round: 1,
        allowSpectators: true,
        allowJoinAfterStart: false,
        initialPlayerIds: [hostId],
        isVisible: true,
        winner: null,
      };

      const docRef = await addDoc(this.gamesCollection, gameData);

      // Ajouter le host comme premier joueur
      await this.addPlayerToGame(docRef.id, hostId, hostName, true);

      // Créer un événement pour notifier
      await this.createGameEvent("NEW_GAME", docRef.id, gameName, hostName, 
        `${hostName} a créé une nouvelle partie MYcover "${gameName}"`);

      return docRef.id;
    } catch (error) {
      console.error("Erreur lors de la création de la partie:", error);
      throw error;
    }
  }

  // Ajouter un joueur à une partie
  private async addPlayerToGame(gameId: string, playerId: string, playerName: string, isHost: boolean = false): Promise<void> {
    const playerRef = doc(this.gamesCollection, gameId, "players", playerId);
    
    const playerData: MyCoverPlayer = {
      id: playerId,
      nameSnapshot: playerName,
      joinedAt: Timestamp.now(),
      isHost,
      isConnected: true,
      hasVoted: false,
      isSpectator: false,
      isEliminated: false,
      word: null,
      role: "player",
      voteFor: null,
      revealed: false,
    };

    await setDoc(playerRef, playerData);
  }

  // Rejoindre une partie
  async joinGame(gameId: string, playerId: string, playerName: string, asSpectator: boolean = false): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        throw new Error("Partie non trouvée");
      }

      const gameData = gameDoc.data() as MyCoverGame;
      
      // Vérifier si la partie a déjà commencé
      if (gameData.phase !== "lobby" && !asSpectator && !gameData.allowJoinAfterStart) {
        throw new Error("La partie a déjà commencé. Vous pouvez seulement rejoindre en tant que spectateur.");
      }

      // Vérifier le nombre maximum de joueurs
      const playersSnapshot = await getDocs(collection(this.gamesCollection, gameId, "players"));
      const activePlayers = playersSnapshot.docs.filter(doc => {
        const player = doc.data() as MyCoverPlayer;
        return player.isConnected && !player.isSpectator;
      });

      if (!asSpectator && activePlayers.length >= gameData.maxPlayers) {
        throw new Error("La partie est complète");
      }

      // Vérifier si le joueur était dans la partie initiale
      const wasInitialPlayer = gameData.initialPlayerIds.includes(playerId);
      const shouldBeSpectator = asSpectator || (!wasInitialPlayer && gameData.phase !== "lobby");

      const playerRef = doc(this.gamesCollection, gameId, "players", playerId);
      const playerDoc = await getDoc(playerRef);

      if (playerDoc.exists()) {
        // Le joueur existe déjà, le reconnecter
        await updateDoc(playerRef, {
          isConnected: true,
          isSpectator: shouldBeSpectator,
        });
      } else {
        // Nouveau joueur
        const playerData: MyCoverPlayer = {
          id: playerId,
          nameSnapshot: playerName,
          joinedAt: Timestamp.now(),
          isHost: false,
          isConnected: true,
          hasVoted: false,
          isSpectator: shouldBeSpectator,
          isEliminated: false,
          word: null,
          role: "player",
          voteFor: null,
          revealed: false,
        };

        await setDoc(playerRef, playerData);

        // Ajouter à la liste des joueurs initiaux si c'est en lobby
        if (gameData.phase === "lobby" && !shouldBeSpectator) {
          await updateDoc(gameRef, {
            initialPlayerIds: [...gameData.initialPlayerIds, playerId],
            updatedAt: serverTimestamp(),
          });
        }
      }

      await updateDoc(gameRef, {
        updatedAt: serverTimestamp(),
      });

    } catch (error) {
      console.error("Erreur lors de la connexion à la partie:", error);
      throw error;
    }
  }

  // Quitter une partie
  async leaveGame(gameId: string, playerId: string): Promise<void> {
    try {
      const playerRef = doc(this.gamesCollection, gameId, "players", playerId);
      
      await updateDoc(playerRef, {
        isConnected: false,
        updatedAt: serverTimestamp(),
      });

      const gameRef = doc(this.gamesCollection, gameId);
      await updateDoc(gameRef, {
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Erreur lors de la déconnexion:", error);
      throw error;
    }
  }

  // Démarrer la partie (host seulement)
  async startGame(gameId: string, hostId: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        throw new Error("Partie non trouvée");
      }

      const gameData = gameDoc.data() as MyCoverGame;
      
      if (gameData.hostId !== hostId) {
        throw new Error("Seul l'hôte peut démarrer la partie");
      }

      if (gameData.phase !== "lobby") {
        throw new Error("La partie a déjà commencé");
      }

      // Récupérer les joueurs actifs
      const playersSnapshot = await getDocs(collection(this.gamesCollection, gameId, "players"));
      const activePlayers = playersSnapshot.docs
        .map(doc => doc.data() as MyCoverPlayer)
        .filter(player => player.isConnected && !player.isSpectator && !player.isEliminated);

      if (activePlayers.length < 3) {
        throw new Error("Il faut au moins 3 joueurs pour commencer");
      }

      // Choisir un mot aléatoire
      const randomWord = GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)];
      
      // Choisir Mr White aléatoirement
      const randomIndex = Math.floor(Math.random() * activePlayers.length);
      const whitePlayer = activePlayers[randomIndex];

      // Mettre à jour la partie
      await updateDoc(gameRef, {
        phase: "started",
        word: randomWord,
        whitePlayerId: whitePlayer.id,
        updatedAt: serverTimestamp(),
      });

      // Mettre à jour les joueurs avec leurs rôles et mots
      const batch = writeBatch(db);
      
      activePlayers.forEach(player => {
        const playerRef = doc(this.gamesCollection, gameId, "players", player.id);
        
        if (player.id === whitePlayer.id) {
          // Mr White
          batch.update(playerRef, {
            role: "white",
            word: null,
          });
        } else {
          // Joueur normal
          batch.update(playerRef, {
            role: "player", 
            word: randomWord,
          });
        }
      });

      await batch.commit();

      await this.createGameEvent("GAME_STARTED", gameId, gameData.name, gameData.hostName,
        "La partie a commencé !");

    } catch (error) {
      console.error("Erreur lors du démarrage:", error);
      throw error;
    }
  }

  // Lancer un vote (host seulement)
  async startVoting(gameId: string, hostId: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        throw new Error("Partie non trouvée");
      }

      const gameData = gameDoc.data() as MyCoverGame;
      
      if (gameData.hostId !== hostId) {
        throw new Error("Seul l'hôte peut lancer un vote");
      }

      if (gameData.phase !== "started") {
        throw new Error("La partie doit être en cours pour lancer un vote");
      }

      // Réinitialiser les votes
      const playersSnapshot = await getDocs(collection(this.gamesCollection, gameId, "players"));
      const batch = writeBatch(db);
      
      playersSnapshot.docs.forEach(doc => {
        const playerRef = doc.ref;
        batch.update(playerRef, {
          hasVoted: false,
          voteFor: null,
        });
      });

      await batch.commit();

      await updateDoc(gameRef, {
        phase: "voting",
        updatedAt: serverTimestamp(),
      });

      await this.createGameEvent("VOTE_STARTED", gameId, gameData.name, gameData.hostName,
        "Le vote a commencé !");

    } catch (error) {
      console.error("Erreur lors du lancement du vote:", error);
      throw error;
    }
  }

  // Voter pour un joueur
  async voteForPlayer(gameId: string, voterId: string, targetId: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        throw new Error("Partie non trouvée");
      }

      const gameData = gameDoc.data() as MyCoverGame;
      
      if (gameData.phase !== "voting") {
        throw new Error("Ce n'est pas la phase de vote");
      }

      const voterRef = doc(this.gamesCollection, gameId, "players", voterId);
      const voterDoc = await getDoc(voterRef);
      
      if (!voterDoc.exists()) {
        throw new Error("Joueur non trouvé");
      }

      const voter = voterDoc.data() as MyCoverPlayer;
      
      if (voter.isSpectator || voter.isEliminated) {
        throw new Error("Les spectateurs et joueurs éliminés ne peuvent pas voter");
      }

      if (voter.hasVoted) {
        throw new Error("Vous avez déjà voté");
      }

      if (voterId === targetId) {
        throw new Error("Vous ne pouvez pas voter pour vous-même");
      }

      // Vérifier que la cible existe et n'est pas éliminée
      const targetRef = doc(this.gamesCollection, gameId, "players", targetId);
      const targetDoc = await getDoc(targetRef);
      
      if (!targetDoc.exists()) {
        throw new Error("Joueur cible non trouvé");
      }

      const target = targetDoc.data() as MyCoverPlayer;
      
      if (target.isEliminated || target.isSpectator) {
        throw new Error("Vous ne pouvez pas voter pour ce joueur");
      }

      // Enregistrer le vote
      await updateDoc(voterRef, {
        hasVoted: true,
        voteFor: targetId,
      });

      await updateDoc(gameRef, {
        updatedAt: serverTimestamp(),
      });

    } catch (error) {
      console.error("Erreur lors du vote:", error);
      throw error;
    }
  }

  // Terminer le vote et éliminer un joueur (host seulement)
  async endVoting(gameId: string, hostId: string): Promise<{ eliminatedPlayer: MyCoverPlayer; isWhite: boolean }> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        throw new Error("Partie non trouvée");
      }

      const gameData = gameDoc.data() as MyCoverGame;
      
      if (gameData.hostId !== hostId) {
        throw new Error("Seul l'hôte peut terminer le vote");
      }

      if (gameData.phase !== "voting") {
        throw new Error("Aucun vote en cours");
      }

      // Compter les votes
      const playersSnapshot = await getDocs(collection(this.gamesCollection, gameId, "players"));
      const players = playersSnapshot.docs.map(doc => doc.data() as MyCoverPlayer);
      
      const activePlayers = players.filter(p => p.isConnected && !p.isSpectator && !p.isEliminated);
      const voteCounts: Record<string, number> = {};

      activePlayers.forEach(player => {
        if (player.voteFor) {
          voteCounts[player.voteFor] = (voteCounts[player.voteFor] || 0) + 1;
        }
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

      if (!eliminatedPlayerId) {
        throw new Error("Aucun vote valide trouvé");
      }

      const eliminatedPlayer = players.find(p => p.id === eliminatedPlayerId);
      if (!eliminatedPlayer) {
        throw new Error("Joueur éliminé non trouvé");
      }

      const isWhite = eliminatedPlayer.role === "white";

      // Éliminer le joueur
      const eliminatedPlayerRef = doc(this.gamesCollection, gameId, "players", eliminatedPlayerId);
      await updateDoc(eliminatedPlayerRef, {
        isEliminated: true,
        revealed: true,
      });

      // Mettre à jour la phase de la partie
      await updateDoc(gameRef, {
        phase: "revealed",
        updatedAt: serverTimestamp(),
      });

      return { eliminatedPlayer, isWhite };

    } catch (error) {
      console.error("Erreur lors de la fin du vote:", error);
      throw error;
    }
  }

  // Terminer la partie (host seulement)
  async endGame(gameId: string, hostId: string, winner: "white" | "players"): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        throw new Error("Partie non trouvée");
      }

      const gameData = gameDoc.data() as MyCoverGame;
      
      if (gameData.hostId !== hostId) {
        throw new Error("Seul l'hôte peut terminer la partie");
      }

      // Révéler tous les rôles
      const playersSnapshot = await getDocs(collection(this.gamesCollection, gameId, "players"));
      const batch = writeBatch(db);
      
      playersSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          revealed: true,
        });
      });

      await batch.commit();

      await updateDoc(gameRef, {
        phase: "ended",
        winner,
        updatedAt: serverTimestamp(),
      });

      await this.createGameEvent("GAME_ENDED", gameId, gameData.name, gameData.hostName,
        `La partie est terminée ! ${winner === "white" ? "Mr White" : "Les joueurs"} ont gagné !`);

    } catch (error) {
      console.error("Erreur lors de la fin de partie:", error);
      throw error;
    }
  }

  // Supprimer une partie (host seulement)
  async deleteGame(gameId: string, hostId: string): Promise<void> {
    try {
      const gameRef = doc(this.gamesCollection, gameId);
      const gameDoc = await getDoc(gameRef);
      
      if (!gameDoc.exists()) {
        throw new Error("Partie non trouvée");
      }

      const gameData = gameDoc.data() as MyCoverGame;
      
      if (gameData.hostId !== hostId) {
        throw new Error("Seul l'hôte peut supprimer la partie");
      }

      // Supprimer tous les joueurs
      const playersSnapshot = await getDocs(collection(this.gamesCollection, gameId, "players"));
      const batch = writeBatch(db);
      
      playersSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      // Supprimer la partie
      await deleteDoc(gameRef);

    } catch (error) {
      console.error("Erreur lors de la suppression:", error);
      throw error;
    }
  }

  // Écouter les parties visibles
  subscribeToGames(callback: (games: MyCoverGame[]) => void): () => void {
    // Simplifier la requête pour éviter l'index composite
    // On filtre côté client pour éviter de créer un index Firestore
    const q = query(
      this.gamesCollection,
      orderBy("createdAt", "desc")
    );

    return onSnapshot(q, (snapshot) => {
      const games = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter(game => (game as MyCoverGame).isVisible) // Filtrer côté client
      
      const typedGames = games as MyCoverGame[];
      
      callback(typedGames);
    });
  }

  // Écouter une partie spécifique
  subscribeToGame(gameId: string, callback: (game: MyCoverGame | null) => void): () => void {
    const gameRef = doc(this.gamesCollection, gameId);
    
    return onSnapshot(gameRef, (snapshot) => {
      if (snapshot.exists()) {
        const game = { id: snapshot.id, ...snapshot.data() } as MyCoverGame;
        callback(game);
      } else {
        callback(null);
      }
    });
  }

  // Écouter les joueurs d'une partie
  subscribeToPlayers(gameId: string, callback: (players: MyCoverPlayer[]) => void): () => void {
    const playersRef = collection(this.gamesCollection, gameId, "players");
    const q = query(playersRef, orderBy("joinedAt", "asc"));
    
    return onSnapshot(q, (snapshot) => {
      const players = snapshot.docs.map(doc => ({
        ...doc.data()
      })) as MyCoverPlayer[];
      
      callback(players);
    });
  }

  // Écouter les événements globaux
  subscribeToEvents(callback: (events: MyCoverGameEvent[]) => void): () => void {
    const q = query(
      this.eventsCollection,
      orderBy("createdAt", "desc"),
      limit(20)
    );

    return onSnapshot(q, (snapshot) => {
      const events = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MyCoverGameEvent[];
      callback(events);
    });
  }

  // Créer un événement
  private async createGameEvent(
    type: MyCoverGameEvent["type"],
    gameId: string,
    gameName: string,
    hostName: string,
    message: string
  ): Promise<void> {
    try {
      const eventData: Omit<MyCoverGameEvent, "id"> = {
        type,
        gameId,
        gameName,
        hostName,
        message,
        createdAt: Timestamp.now(),
      };

      const docRef = await addDoc(this.eventsCollection, eventData);
      
      // Suppression auto après 30 secondes
      setTimeout(async () => {
        try {
          await deleteDoc(docRef);
        } catch (e) {
          // ignore
        }
      }, 30000);
    } catch (error) {
      console.error("Erreur lors de la création de l'événement:", error);
    }
  }

  // Obtenir les statistiques d'une partie
  async getGameStats(gameId: string): Promise<{
    totalPlayers: number;
    activePlayers: number;
    spectators: number;
    votesCount: number;
  }> {
    try {
      const playersSnapshot = await getDocs(collection(this.gamesCollection, gameId, "players"));
      const players = playersSnapshot.docs.map(doc => doc.data() as MyCoverPlayer);
      
      const connectedPlayers = players.filter(p => p.isConnected);
      const activePlayers = connectedPlayers.filter(p => !p.isSpectator && !p.isEliminated);
      const spectators = connectedPlayers.filter(p => p.isSpectator);
      const votesCount = players.filter(p => p.hasVoted).length;

      return {
        totalPlayers: connectedPlayers.length,
        activePlayers: activePlayers.length,
        spectators: spectators.length,
        votesCount,
      };
    } catch (error) {
      console.error("Erreur lors du calcul des stats:", error);
      return {
        totalPlayers: 0,
        activePlayers: 0,
        spectators: 0,
        votesCount: 0,
      };
    }
  }
}

export default new MyCoverService();