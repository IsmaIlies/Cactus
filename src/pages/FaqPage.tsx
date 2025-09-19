import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, addDoc, getDocs, Timestamp, query, orderBy, deleteDoc, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

// Ajout de l'interface User pour le typage
interface User {
  id?: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
}

interface Comment {
  author: string;
  text: string;
  createdAt: Timestamp;
}

interface Suggestion {
  id?: string;
  text: string;
  author: string;
  createdAt: Timestamp;
  likes?: string[];
  dislikes?: string[];
  accepted?: boolean;
  category?: string;
  comments?: Comment[];
}

// Composant SuggestionItem
interface SuggestionItemProps {
  suggestion: Suggestion;
  userId: string;
  onDelete: () => void;
  onEdit: (newText: string, newLikes?: string[], newDislikes?: string[], newComments?: Comment[]) => void;
}

const SuggestionItem: React.FC<SuggestionItemProps> = ({ suggestion, userId, onDelete, onEdit }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(suggestion.text);
  const likes = suggestion.likes || [];
  const dislikes = suggestion.dislikes || [];
  const hasLiked = userId && likes.includes(userId);
  const hasDisliked = userId && dislikes.includes(userId);
  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<Comment[]>(suggestion.comments || []);

  // Ajout : récupération du user via le contexte React
  const { user } = useAuth() as { user: User };

  // Helper pour initiales
  function getInitials(name: string) {
    if (!name) return "?";
    const parts = name.split(" ");
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const handleVote = (type: "like" | "dislike") => {
    let newLikes = likes;
    let newDislikes = dislikes;
    if (type === "like") {
      newLikes = hasLiked ? likes.filter(id => id !== userId) : [...likes, userId];
      newDislikes = dislikes.filter(id => id !== userId);
    } else {
      newDislikes = hasDisliked ? dislikes.filter(id => id !== userId) : [...dislikes, userId];
      newLikes = likes.filter(id => id !== userId);
    }
    onEdit(suggestion.text, newLikes, newDislikes, comments);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!commentText.trim()) return;
      if (!suggestion.id) return; // sécurité
      const authorName = user?.displayName || user?.email || user?.id || "Utilisateur";
      const newComment: Comment = { author: authorName, text: commentText.trim(), createdAt: Timestamp.now() };
      setCommentText("");
      // Ecriture incrémentale avec arrayUnion (évite de réécrire tout le tableau)
      await updateDoc(doc(collection(db, "suggestions"), suggestion.id), {
        comments: arrayUnion(newComment)
      });
      // Mise à jour locale immédiate
      setComments(prev => [...prev, newComment]);
      // Optionnel: synchroniser le parent sans réécriture complète (on évite de passer un gros tableau)
      onEdit(suggestion.text, likes, dislikes, [...comments, newComment]);
    } catch (err) {
      console.error("Erreur lors de l'ajout du commentaire:", err);
      // Restaure le texte si erreur
      setCommentText(prev => prev || "");
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow border relative flex flex-col">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {isEditing ? (
            <form
              onSubmit={e => {
                e.preventDefault();
                onEdit(editText, likes, dislikes, comments);
                setIsEditing(false);
              }}
              className="mb-2"
            >
              <textarea
                className="w-full p-2 border rounded mb-2"
                rows={2}
                value={editText}
                onChange={e => setEditText(e.target.value)}
              />
              <button type="submit" className="bg-cactus-600 text-white px-2 py-1 rounded mr-2">Valider</button>
              <button type="button" className="bg-gray-300 px-2 py-1 rounded" onClick={() => setIsEditing(false)}>Annuler</button>
            </form>
          ) : (
            <div className="text-gray-800 mb-2">{suggestion.text}</div>
          )}
          <div className="text-xs text-gray-500">Le {suggestion.createdAt.toDate().toLocaleString()}</div>
          {typeof suggestion === "object" && suggestion.category && (
            <div className="text-xs text-cactus-600 mt-1">Catégorie : {suggestion.category}</div>
          )}
          {/* Affichage des commentaires */}
          <div className="mt-2">
            <div className="text-xs font-semibold text-cactus-600 mb-1">Commentaires :</div>
            {comments.length === 0 && <div className="text-xs text-gray-400">Aucun commentaire.</div>}
            {comments.map((c, idx) => (
              <div key={idx} className="text-xs text-gray-700 mb-1 flex items-center gap-2">
                {/* Affiche photo si disponible, sinon initiales */}
                {user?.photoURL && c.author === (user.displayName || user.email || user.id) ? (
                  <img src={user.photoURL} alt={c.author} className="w-6 h-6 rounded-full border" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-cactus-100 flex items-center justify-center text-cactus-600 font-bold border">
                    {getInitials(c.author)}
                  </div>
                )}
                <span className="font-semibold text-cactus-600">{c.author}</span> : {c.text}
                <span className="ml-2 text-gray-400">{c.createdAt.toDate().toLocaleString()}</span>
              </div>
            ))}
            <form onSubmit={handleAddComment} className="flex gap-2 mt-2">
              <input
                type="text"
                className="flex-1 border rounded px-2 py-1 text-xs"
                placeholder="Ajouter un commentaire..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
              />
              <button type="submit" className="bg-cactus-600 text-white px-2 py-1 rounded text-xs">Commenter</button>
            </form>
          </div>
        </div>
        <div className="text-xs font-semibold text-cactus-600 ml-4 mt-1">{suggestion.author}</div>
      </div>
      <div className="flex flex-row justify-end gap-2 mt-2">
        <button
          className={`text-xs px-2 py-1 border rounded flex items-center gap-1 ${hasLiked ? "bg-green-100 text-green-700" : "text-cactus-600 hover:text-green-700"}`}
          onClick={() => handleVote("like")}
        >
          👍 {likes.length}
        </button>
        <button
          className={`text-xs px-2 py-1 border rounded flex items-center gap-1 ${hasDisliked ? "bg-red-100 text-red-700" : "text-cactus-600 hover:text-red-700"}`}
          onClick={() => handleVote("dislike")}
        >
          👎 {dislikes.length}
        </button>
        <button
          className="text-xs text-cactus-600 hover:text-red-600 px-2 py-1 border rounded"
          onClick={onDelete}
        >
          Supprimer
        </button>
        <button
          className="text-xs text-cactus-600 hover:text-blue-600 px-2 py-1 border rounded"
          onClick={() => setIsEditing(true)}
        >
          Modifier
        </button>
      </div>
    </div>
  );
};

const FaqPage = () => {
  const { user } = useAuth();
  const [suggestion, setSuggestion] = useState("");
  const [category, setCategory] = useState<string>("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // const [loading, setLoading] = useState(false); // supprimé car non utilisé
  const [successMsg, setSuccessMsg] = useState<string>("");

  const fetchSuggestions = async () => {
    try {
      const q = query(collection(db, "suggestions"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      setSuggestions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Suggestion));
    } catch (err) {
      console.error("Erreur Firestore lors de la récupération des suggestions:", err);
      setError("Erreur Firestore: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const [error, setError] = useState<string>("");
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!suggestion.trim() || !category) return;
    try {
      await addDoc(collection(db, "suggestions"), {
        text: suggestion,
        author: user?.displayName || user?.email || "Anonyme",
        createdAt: Timestamp.now(),
        likes: [],
        dislikes: [],
        category,
      });
      setSuggestion("");
      setCategory("");
      fetchSuggestions();
      setSuccessMsg("Merci ! Votre idée a été enregistrée.");
      setTimeout(() => setSuccessMsg(""), 2500);
    } catch (err) {
      setError("Erreur Firestore: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const userId = user?.id || user?.email || "";

  // Statistiques globales
  const totalIdeas = suggestions.length;
  const mostPopular = suggestions.reduce((max, curr) => {
    const currLikes = curr.likes?.length || 0;
    const maxLikes = max.likes?.length || 0;
    return currLikes > maxLikes ? curr : max;
  }, suggestions[0] || null);
  // const acceptedIdeas = suggestions.filter(s => s.accepted).length;

  // Classement des contributeurs
  const contributorStats: Record<string, { name: string; count: number; likes: number }> = {};
  suggestions.forEach(s => {
    const author = s.author || "Anonyme";
    if (!contributorStats[author]) {
      contributorStats[author] = { name: author, count: 0, likes: 0 };
    }
    contributorStats[author].count += 1;
    contributorStats[author].likes += s.likes?.length || 0;
  });
  const topContributors = Object.values(contributorStats)
    .sort((a, b) => b.likes - a.likes || b.count - a.count)
    .slice(0, 5);

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-bold mb-4">FAQ & Suggestions</h1>
      {/* Statistiques globales */}
      <div className="mb-4 p-3 bg-gray-50 rounded border flex flex-col gap-2">
        <div><span className="font-semibold">Nombre total d’idées proposées :</span> {totalIdeas}</div>
        <div>
          <span className="font-semibold">Idée la plus populaire :</span> {mostPopular ? (
            <span className="ml-1">“{mostPopular.text}” <span className="text-green-700">({mostPopular.likes?.length || 0} 👍)</span></span>
          ) : "Aucune idée"}
        </div>
      </div>
      {/* Classement compact des contributeurs - version animée */}
      <style>{`
        .contrib-anim {
          animation: contribFadeUp 0.7s cubic-bezier(.4,2,.3,1) both;
        }
        @keyframes contribFadeUp {
          0% { opacity: 0; transform: translateY(20px) scale(0.95); }
          60% { opacity: 1; transform: translateY(-4px) scale(1.04); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className="mb-2 text-xs flex flex-wrap gap-2 items-center">
        <span className="font-semibold text-yellow-700">🏆 Top :</span>
        {topContributors.length === 0 ? (
          <span className="text-gray-400">Aucun</span>
        ) : (
          topContributors.map((c, idx) => (
            <span key={c.name} className="contrib-anim flex items-center gap-1 px-2 py-1 rounded bg-yellow-50 border border-yellow-100 shadow-sm" style={{animationDelay: `${idx * 0.12}s`}}>
              <span className="w-6 h-6 rounded-full bg-cactus-100 flex items-center justify-center text-cactus-700 font-bold border mr-1">
                {c.name.split(" ").map(p => p[0]).join("").toUpperCase().slice(0,2)}
              </span>
              <span className="font-bold text-cactus-700">{c.name}</span>
              <span className="text-gray-600">{c.count} idées</span>
              <span className="text-green-700">{c.likes}👍</span>
              {idx === 0 && <span className="text-yellow-600">⭐</span>}
            </span>
          ))
        )}
      </div>
      <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
        <select
          className="border rounded px-2 py-1"
          value={category}
          onChange={e => setCategory(e.target.value)}
          required
        >
          <option value="" disabled>Choisir une catégorie</option>
          <option value="Dashboard">📊 Dashboard</option>
          <option value="Offres">🧾 Offres</option>
          <option value="Interface Appel">📞 Interface Appel</option>
          <option value="Fonctionnalités d’équipe">🧑‍🤝‍🧑 Fonctionnalités d’équipe</option>
          <option value="Autres">🗂️ Autres</option>
        </select>
        <input
          type="text"
          className="flex-1 border rounded px-2 py-1"
          placeholder="Écris ta suggestion..."
          value={suggestion}
          onChange={e => setSuggestion(e.target.value)}
        />
        <button type="submit" className="bg-cactus-600 text-white px-4 py-1 rounded">Envoyer</button>
      </form>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {successMsg && <div className="text-green-600 mb-2">{successMsg}</div>}
      <h2 className="text-lg font-semibold mb-2">Historique des suggestions</h2>
      <div className="space-y-4">
        {suggestions.length === 0 && <div className="text-gray-500">Aucune suggestion pour le moment.</div>}
        {suggestions.map(s => (
          <SuggestionItem
            key={s.id}
            suggestion={s}
            userId={userId}
            onDelete={async () => {
              if (!s.id) return;
              try {
                await deleteDoc(doc(collection(db, "suggestions"), s.id));
                setSuggestions(prev => prev.filter(sugg => sugg.id !== s.id));
              } catch (err) {
                setError("Erreur Firestore: " + (err instanceof Error ? err.message : String(err)));
              }
            }}
            onEdit={async (newText: string, newLikes?: string[], newDislikes?: string[], newComments?: Comment[]) => {
              if (!s.id) return;
              try {
                await updateDoc(doc(collection(db, "suggestions"), s.id), {
                  text: newText,
                  likes: newLikes ?? s.likes ?? [],
                  dislikes: newDislikes ?? s.dislikes ?? [],
                  comments: newComments ?? s.comments ?? [],
                });
                setSuggestions(prev => prev.map(sugg =>
                  sugg.id === s.id
                    ? { ...sugg, text: newText, likes: newLikes ?? sugg.likes ?? [], dislikes: newDislikes ?? sugg.dislikes ?? [], comments: newComments ?? sugg.comments ?? [], accepted: sugg.accepted }
                    : sugg
                ));
                setSuccessMsg("Merci ! Votre idée a été enregistrée.");
                setTimeout(() => setSuccessMsg(""), 2500);
              } catch (err) {
                setError("Erreur Firestore: " + (err instanceof Error ? err.message : String(err)));
              }
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default FaqPage;
