import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkEmoji from "remark-emoji";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  Send,
  Film,
  Tv,
  Calendar,
  Star,
  Play,
  Clock,
  Plus,
  MessageSquare,
  Trash2,
  Edit3,
  MoreVertical,
  ChevronDown,
  History,
} from "lucide-react";
import {
  streamGeminiResponse,
  getHighlightsStructuredWithSearch as getPlatformHighlightsStructured,
  streamGeminiDetails,
  generateConversationTitleFromConversation,
} from "../services/geminiService";
import { useAuth } from "../contexts/AuthContext";
import {
  getUserHistories,
  createHistory,
  addMessageToHistory,
  getMessagesPage,
  deleteHistory,
  updateHistoryTitle,
  ChatHistory,
} from "../services/chatHistoryService";

interface Message {
  id: string;
  text: string;
  sender: "user" | "assistant";
  timestamp: Date;
}

export interface ProgramCard {
  title: string;
  type: string;
  platform?: string;
  genre?: string;
  year?: string;
  rating?: string;
  description?: string;
  duration?: string;
  releaseDate?: string;
}

function convertChatMessages(raw: any[]): Message[] {
  return (raw || []).map((msg) => ({
    ...msg,
    timestamp:
      msg.timestamp instanceof Date
        ? msg.timestamp
        : msg.timestamp && typeof msg.timestamp.toDate === "function"
        ? msg.timestamp.toDate()
        : new Date(),
  }));
}

const AiAssistantPage = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Historique Firestore
  const [histories, setHistories] = useState<ChatHistory[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(
    null
  );
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showHistoryOptions, setShowHistoryOptions] = useState<string | null>(
    null
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // État pour gérer l'espace supplémentaire en bas du chat
  const [extraBottomSpace, setExtraBottomSpace] = useState(0);

  // État pour savoir si c'est le premier chargement de la page
  const [isInitialPageLoad, setIsInitialPageLoad] = useState(true);

  // État pour savoir si on est dans une nouvelle conversation temporaire (pas encore sauvée)
  const [isTemporaryConversation, setIsTemporaryConversation] = useState(true);

  // Variable pour empêcher le rechargement automatique après création d'une conversation
  const [justCreatedConversation, setJustCreatedConversation] = useState(false);

  // Fermer le dropdown quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
        setShowHistoryOptions(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Charger les historiques à l'ouverture ou quand user change
  useEffect(() => {
    if (!user) return;
    getUserHistories(user.id).then(setHistories);
  }, [user]);

  // Ne plus sélectionner automatiquement le premier historique
  // L'utilisateur arrive toujours sur une conversation vide

  // Charger les messages de l'historique sélectionné
  useEffect(() => {
    // Ne pas charger si on est encore en mode conversation temporaire
    if (!user || !selectedHistoryId || isTemporaryConversation) return;

    // Si on vient de créer une conversation ou qu'on a déjà des messages,
    // ne pas recharger depuis Firebase pour éviter d'écraser les messages locaux
    if (justCreatedConversation || messages.length > 0) {
      setJustCreatedConversation(false);
      return;
    }

    setLoadingHistory(true);
    setLastDoc(null);
    setHasMore(true);
    setExtraBottomSpace(0); // Reset l'espace supplémentaire

    getMessagesPage(user.id, selectedHistoryId, 10)
      .then(({ messages, lastDoc }) => {
        const safeMessages = convertChatMessages(messages);
        setMessages(safeMessages.slice().reverse());
        setLastDoc(lastDoc);
        setHasMore(messages.length === 10);
      })
      .catch(() => {
        setMessages([]);
        setLastDoc(null);
        setHasMore(false);
      })
      .finally(() => {
        setLoadingHistory(false);
        // Scroll vers le bas après le chargement d'une conversation
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({
              behavior: "auto",
              block: "end",
            });
          }
          // Marquer que le premier chargement est terminé
          if (isInitialPageLoad) {
            setIsInitialPageLoad(false);
          }
        }, 100);
      });
  }, [user, selectedHistoryId, justCreatedConversation, messages.length]);

  const handleLoadMore = async () => {
    if (!user || !selectedHistoryId || !lastDoc) return;
    setLoadingHistory(true);

    // Sauvegarder la position de scroll actuelle
    const container = messagesContainerRef.current;
    const scrollHeightBefore = container?.scrollHeight || 0;

    const { messages: older, lastDoc: newLastDoc } = await getMessagesPage(
      user.id,
      selectedHistoryId,
      10,
      lastDoc
    );
    const safeOlder = convertChatMessages(older);
    setMessages((prev) => [...safeOlder.slice().reverse(), ...prev]);
    setLastDoc(newLastDoc);
    setHasMore(older.length === 10);
    setLoadingHistory(false);

    // Maintenir la position de scroll après l'ajout des nouveaux messages
    setTimeout(() => {
      if (container) {
        const scrollHeightAfter = container.scrollHeight;
        const scrollDifference = scrollHeightAfter - scrollHeightBefore;
        container.scrollTop += scrollDifference;
      }
    }, 0);
  };

  // Créer une nouvelle session de chat (mode temporaire)
  const handleNewChat = () => {
    // Passer en mode conversation temporaire sans créer dans Firebase
    setSelectedHistoryId(null);
    setIsTemporaryConversation(true);
    setJustCreatedConversation(false);
    setMessages([]);
    setLastDoc(null);
    setHasMore(true);
    setExtraBottomSpace(0);
    setIsDropdownOpen(false);
  };

  // Supprimer un historique
  const handleDeleteHistory = async (historyId: string) => {
    if (!user) return;
    if (confirm("Êtes-vous sûr de vouloir supprimer cette conversation ?")) {
      await deleteHistory(user.id, historyId);
      const updatedHistories = await getUserHistories(user.id);
      setHistories(updatedHistories);
      if (selectedHistoryId === historyId) {
        setSelectedHistoryId(
          updatedHistories.length > 0 ? updatedHistories[0].id : null
        );
      }
    }
    setShowHistoryOptions(null);
  };

  // Modifier le titre d'un historique
  const handleEditTitle = async (historyId: string) => {
    if (!user || !editingTitle.trim()) return;

    try {
      // Mettre à jour dans Firebase
      await updateHistoryTitle(user.id, historyId, editingTitle);

      // Mettre à jour localement
      setHistories((prev) =>
        prev.map((h) =>
          h.id === historyId ? { ...h, title: editingTitle } : h
        )
      );
    } catch (error) {
      console.error("Erreur lors de la mise à jour du titre:", error);
    }

    setEditingHistoryId(null);
    setEditingTitle("");
    setShowHistoryOptions(null);
  };

  // Fonction pour calculer et appliquer l'espace supplémentaire
  const addExtraSpaceForAssistant = () => {
    const container = messagesContainerRef.current;
    if (container) {
      // Calculer l'espace nécessaire pour que le message de l'IA soit en haut
      const containerHeight = container.clientHeight;
      // Ajouter un espace équivalent à la hauteur du conteneur moins un peu d'espace pour le message
      setExtraBottomSpace(containerHeight - 100);
    }
  };

  // Fonction pour scroller vers le bas avec l'espace supplémentaire
  const scrollToBottomWithExtraSpace = () => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      }
    }, 100);
  };

  // Envoi d'un message utilisateur + assistant
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isAssistantTyping) return;
    if (!user) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputMessage,
      sender: "user",
      timestamp: new Date(),
    };

    // Sauvegarder le message de l'utilisateur pour potentiellement générer un titre
    const currentUserMessage = inputMessage;
    setInputMessage("");

    // Ajouter le message localement AVANT de créer la conversation
    setMessages((prev) => [...prev, userMessage]);

    // Si on est en mode conversation temporaire, créer la conversation dans Firebase
    let currentHistoryId = selectedHistoryId;
    if (isTemporaryConversation || !selectedHistoryId) {
      try {
        currentHistoryId = await createHistory(
          user.id,
          "Nouvelle conversation"
        );

        // Important: définir l'ID et désactiver le mode temporaire
        setSelectedHistoryId(currentHistoryId);
        setIsTemporaryConversation(false);
        setJustCreatedConversation(true); // Marquer qu'on vient de créer une conversation

        // Générer immédiatement un titre temporaire basé sur le message utilisateur
        console.log(
          "🎯 Génération immédiate du titre basé sur le message utilisateur"
        );
        try {
          const tempTitle = await generateConversationTitleFromConversation(
            currentUserMessage,
            ""
          );
          console.log("📝 Titre temporaire généré:", tempTitle);

          // Mettre à jour dans Firebase
          await updateHistoryTitle(user.id, currentHistoryId, tempTitle);

          // Ajouter la nouvelle conversation à l'état local avec le titre généré
          const newHistory: ChatHistory = {
            id: currentHistoryId,
            title: tempTitle,
            createdAt: new Date(),
            messages: [],
          };
          console.log(
            "🔄 [handleSendMessage] Ajout de la nouvelle conversation avec titre:",
            newHistory
          );
          setHistories((prevHistories) => [newHistory, ...prevHistories]);
        } catch (titleError) {
          console.error(
            "❌ Erreur lors de la génération du titre initial:",
            titleError
          );
          // En cas d'erreur, utiliser le titre par défaut
          const newHistory: ChatHistory = {
            id: currentHistoryId,
            title: "Nouvelle conversation",
            createdAt: new Date(),
            messages: [],
          };
          console.log(
            "🔄 [handleSendMessage] Ajout de la nouvelle conversation avec titre par défaut:",
            newHistory
          );
          setHistories((prevHistories) => [newHistory, ...prevHistories]);
        }

        // Reset les variables de pagination pour la nouvelle conversation
        setLastDoc(null);
        setHasMore(true);

        // NE PAS vider les messages car on vient d'ajouter le message utilisateur
      } catch (error) {
        console.error("Erreur lors de la création de la conversation:", error);
        return;
      }
    }

    // À ce point, currentHistoryId ne peut pas être null
    if (!currentHistoryId) return;

    // Sauvegarder dans Firebase
    await addMessageToHistory(user.id, currentHistoryId, userMessage);

    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: assistantId,
      text: "",
      sender: "assistant",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    // Ajouter l'espace supplémentaire et scroller vers le bas
    addExtraSpaceForAssistant();
    scrollToBottomWithExtraSpace();

    const localAbort = new AbortController();
    setAbortController(localAbort);

    try {
      let assistantText = "";
      const chatHistory = [...messages, userMessage].map((msg) => ({
        role: msg.sender,
        content: msg.text,
      }));
      setIsAssistantTyping(true);
      await streamGeminiResponse(
        currentUserMessage,
        async (chunk: string) => {
          assistantText += chunk;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, text: assistantText } : msg
            )
          );
        },
        chatHistory,
        { signal: localAbort.signal }
      );
      await addMessageToHistory(user.id, currentHistoryId, {
        id: assistantId,
        text: assistantText,
        sender: "assistant",
        timestamp: new Date(),
      });

      setIsAssistantTyping(false);
      setAbortController(null);
      // Retirer l'espace supplémentaire une fois la réponse terminée
      setExtraBottomSpace(0);
    } catch (error: any) {
      setIsAssistantTyping(false);
      setAbortController(null);
      setExtraBottomSpace(0); // Retirer l'espace en cas d'erreur aussi
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                text:
                  error?.name === "AbortError" ? "__CANCELLED__" : "__ERROR__",
              }
            : msg
        )
      );
    }
  };

  const handleStructuredQuery = async (query: string) => {
    if (isAssistantTyping) return;
    if (!user) return;

    // Si on est en mode conversation temporaire, créer la conversation dans Firebase
    let currentHistoryId = selectedHistoryId;
    if (isTemporaryConversation || !selectedHistoryId) {
      try {
        currentHistoryId = await createHistory(
          user.id,
          "Nouvelle conversation"
        );
        setSelectedHistoryId(currentHistoryId);
        setIsTemporaryConversation(false);
        setJustCreatedConversation(true); // Marquer qu'on vient de créer une conversation

        // Générer immédiatement un titre basé sur la requête
        console.log(
          "🎯 [handleStructuredQuery] Génération immédiate du titre basé sur la requête"
        );
        try {
          const tempTitle = await generateConversationTitleFromConversation(
            query,
            ""
          );
          console.log("📝 [handleStructuredQuery] Titre généré:", tempTitle);

          // Mettre à jour dans Firebase
          await updateHistoryTitle(user.id, currentHistoryId, tempTitle);

          // Ajouter la nouvelle conversation à l'état local avec le titre généré
          const newHistory: ChatHistory = {
            id: currentHistoryId,
            title: tempTitle,
            createdAt: new Date(),
            messages: [],
          };
          console.log(
            "🔄 [handleStructuredQuery] Ajout de la nouvelle conversation avec titre:",
            newHistory
          );
          setHistories((prevHistories) => [newHistory, ...prevHistories]);
        } catch (titleError) {
          console.error(
            "❌ [handleStructuredQuery] Erreur lors de la génération du titre initial:",
            titleError
          );
          // En cas d'erreur, utiliser le titre par défaut
          const newHistory: ChatHistory = {
            id: currentHistoryId,
            title: "Nouvelle conversation",
            createdAt: new Date(),
            messages: [],
          };
          console.log(
            "🔄 [handleStructuredQuery] Ajout de la nouvelle conversation avec titre par défaut:",
            newHistory
          );
          setHistories((prevHistories) => [newHistory, ...prevHistories]);
        }
      } catch (error) {
        console.error("Erreur lors de la création de la conversation:", error);
        return;
      }
    }

    // À ce point, currentHistoryId ne peut pas être null
    if (!currentHistoryId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: query,
      sender: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Sauvegarder le message dans Firebase
    await addMessageToHistory(user.id, currentHistoryId, userMessage);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        text: "__TYPING__",
        sender: "assistant",
        timestamp: new Date(),
      },
    ]);

    // Ajouter l'espace supplémentaire et scroller vers le bas
    addExtraSpaceForAssistant();
    scrollToBottomWithExtraSpace();

    const localAbort = new AbortController();
    setAbortController(localAbort);
    setIsAssistantTyping(true);
    const cancelled = false;

    try {
      const cards = await getPlatformHighlightsStructured(query);
      if (cancelled || localAbort.signal.aborted) return;
      const assistantText = JSON.stringify({ type: "cards", items: cards });
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                text: assistantText,
              }
            : msg
        )
      );
      if (user && currentHistoryId) {
        await addMessageToHistory(user.id, currentHistoryId, {
          id: assistantId,
          text: assistantText,
          sender: "assistant",
          timestamp: new Date(),
        });
      }

      setIsAssistantTyping(false);
      setAbortController(null);
      setExtraBottomSpace(0); // Retirer l'espace supplémentaire
    } catch (error: any) {
      setIsAssistantTyping(false);
      setAbortController(null);
      setExtraBottomSpace(0); // Retirer l'espace en cas d'erreur
      setMessages((prev) =>
        prev
          .filter(
            (msg) =>
              !(
                msg.id === assistantId &&
                (localAbort.signal.aborted || cancelled)
              )
          )
          .map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  text:
                    error?.name === "AbortError"
                      ? "__CANCELLED__"
                      : "__ERROR__",
                }
              : msg
          )
      );
    }
  };

  const handleCardClick = async (item: ProgramCard) => {
    if (isAssistantTyping) return;
    const userMessage: Message = {
      id: Date.now().toString(),
      text: `Donne-moi plus d'informations sur ${item.title}`,
      sender: "user",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        text: "",
        sender: "assistant",
        timestamp: new Date(),
      },
    ]);

    // Ajouter l'espace supplémentaire et scroller vers le bas
    addExtraSpaceForAssistant();
    scrollToBottomWithExtraSpace();

    setIsAssistantTyping(true);
    const localAbort = new AbortController();
    setAbortController(localAbort);
    try {
      let assistantText = "";
      await streamGeminiDetails(
        item.title,
        (chunk: string) => {
          assistantText += chunk;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, text: assistantText } : msg
            )
          );
        },
        { signal: localAbort.signal }
      );
      setExtraBottomSpace(0); // Retirer l'espace supplémentaire
    } catch (error) {
      setExtraBottomSpace(0); // Retirer l'espace en cas d'erreur
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                text: "__ERROR__",
              }
            : msg
        )
      );
    } finally {
      setIsAssistantTyping(false);
      setAbortController(null);
      setExtraBottomSpace(0); // Retirer l'espace supplémentaire
    }
  };

  const handleCancel = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsAssistantTyping(false);
      setExtraBottomSpace(0); // Retirer l'espace supplémentaire
      setMessages((prev) => prev.filter((msg) => msg.text !== "__TYPING__"));
    }
  };

  const TypingIndicator = () => (
    <div className="flex items-center justify-center">
      <div className="w-4 h-4 bg-cactus-600 rounded-full animate-ping-heart"></div>
    </div>
  );

  const ErrorMessage = ({ cancelled }: { cancelled?: boolean }) => (
    <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 font-semibold">
      <svg
        className="w-5 h-5 text-red-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"
        />
      </svg>
      {cancelled
        ? "Réponse annulée par l'utilisateur."
        : "Une erreur est survenue lors de la réponse de l'assistant."}
    </div>
  );

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    let loading = false;
    const handleScroll = async () => {
      if (container.scrollTop < 80 && hasMore && !loadingHistory && !loading) {
        loading = true;
        await handleLoadMore();
        loading = false;
      }
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, loadingHistory, lastDoc, user, selectedHistoryId]);

  const getPlatformColor = (platform: string) => {
    const platformColors: {
      [key: string]: {
        bg: string;
        text: string;
        border: string;
        accent: string;
      };
    } = {
      "Canal+": {
        bg: "bg-black",
        text: "text-white",
        border: "border-black",
        accent: "bg-gray-800",
      },
      "Canal+ Box Office": {
        bg: "bg-yellow-600",
        text: "text-black",
        border: "border-yellow-600",
        accent: "bg-yellow-500",
      },
      "Canal+ Grand Ecran": {
        bg: "bg-gray-900",
        text: "text-white",
        border: "border-gray-900",
        accent: "bg-gray-800",
      },
      "Canal+ Sport 360": {
        bg: "bg-red-700",
        text: "text-white",
        border: "border-red-700",
        accent: "bg-red-600",
      },
      "Canal+ Séries": {
        bg: "bg-gray-800",
        text: "text-white",
        border: "border-gray-800",
        accent: "bg-gray-700",
      },
      "Canal+ Docs": {
        bg: "bg-green-800",
        text: "text-white",
        border: "border-green-800",
        accent: "bg-green-700",
      },
      "Canal+ Kids": {
        bg: "bg-pink-500",
        text: "text-white",
        border: "border-pink-500",
        accent: "bg-pink-400",
      },
      "Canal+ Sport": {
        bg: "bg-red-600",
        text: "text-white",
        border: "border-red-600",
        accent: "bg-red-500",
      },
      "Canal+ Foot": {
        bg: "bg-green-600",
        text: "text-white",
        border: "border-green-600",
        accent: "bg-green-500",
      },
      "Canal+ Cinéma(s)": {
        bg: "bg-gray-700",
        text: "text-white",
        border: "border-gray-700",
        accent: "bg-gray-600",
      },
      "CANAL+ à la Demande": {
        bg: "bg-black",
        text: "text-white",
        border: "border-black",
        accent: "bg-gray-800",
      },
      "Apple TV+": {
        bg: "bg-gray-900",
        text: "text-white",
        border: "border-gray-900",
        accent: "bg-gray-800",
      },
      Max: {
        bg: "bg-purple-600",
        text: "text-white",
        border: "border-purple-600",
        accent: "bg-purple-500",
      },
      "Netflix Avec Pub": {
        bg: "bg-red-700",
        text: "text-white",
        border: "border-red-700",
        accent: "bg-red-600",
      },
      "Paramount+": {
        bg: "bg-blue-700",
        text: "text-white",
        border: "border-blue-700",
        accent: "bg-blue-600",
      },
      "Ciné+ OCS": {
        bg: "bg-orange-600",
        text: "text-white",
        border: "border-orange-600",
        accent: "bg-orange-500",
      },
      Insomnia: {
        bg: "bg-violet-800",
        text: "text-white",
        border: "border-violet-800",
        accent: "bg-violet-700",
      },
      "beIN SPORTS": {
        bg: "bg-green-700",
        text: "text-white",
        border: "border-green-700",
        accent: "bg-green-600",
      },
      Eurosport: {
        bg: "bg-blue-500",
        text: "text-white",
        border: "border-blue-500",
        accent: "bg-blue-400",
      },
      "Pass Coupes d'Europe": {
        bg: "bg-indigo-700",
        text: "text-white",
        border: "border-indigo-700",
        accent: "bg-indigo-600",
      },
      "Infosport+": {
        bg: "bg-teal-600",
        text: "text-white",
        border: "border-teal-600",
        accent: "bg-teal-500",
      },
    };
    return (
      platformColors[platform] || {
        bg: "bg-gray-600",
        text: "text-white",
        border: "border-gray-600",
        accent: "bg-gray-500",
      }
    );
  };

  const getContentIcon = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes("film") || lowerType.includes("movie")) {
      return <Film className="w-4 h-4" />;
    } else if (
      lowerType.includes("série") ||
      lowerType.includes("series") ||
      lowerType.includes("show")
    ) {
      return <Tv className="w-4 h-4" />;
    } else if (lowerType.includes("sport")) {
      return <Play className="w-4 h-4" />;
    }
    return <Play className="w-4 h-4" />;
  };

  const handleSelectHistory = (id: string) => {
    setSelectedHistoryId(id);
    setIsTemporaryConversation(false); // Désactiver le mode temporaire
    setJustCreatedConversation(false); // Reset le flag de création
    setIsDropdownOpen(false);
    setShowHistoryOptions(null);
  };

  const formatDate = (date: Date | any) => {
    if (!date) return "";
    const d =
      date instanceof Date
        ? date
        : date.toDate
        ? date.toDate()
        : new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - d.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return "Aujourd'hui";
    if (diffDays === 2) return "Hier";
    if (diffDays <= 7) return `Il y a ${diffDays - 1} jours`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  const getCurrentHistoryTitle = () => {
    const title = (() => {
      // Si nous n'avons pas d'ID de conversation sélectionnée, c'est une nouvelle conversation
      if (!selectedHistoryId) {
        return "Nouvelle conversation";
      }

      // Sinon, chercher le titre dans l'historique local
      const currentHistory = histories.find((h) => h.id === selectedHistoryId);
      return currentHistory?.title || "Conversation";
    })();

    console.log("📋 getCurrentHistoryTitle:", {
      selectedHistoryId,
      isTemporaryConversation,
      historiesCount: histories.length,
      currentHistory: histories.find((h) => h.id === selectedHistoryId),
      finalTitle: title,
    });

    return title;
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Container principal avec position relative pour le dropdown fixe */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex-1 flex flex-col relative overflow-hidden">
        {/* Dropdown d'historique fixe en haut à gauche */}
        <div className="absolute top-4 left-4 z-50" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-3 px-4 py-2 bg-white/95 backdrop-blur-sm hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors min-w-[250px] text-left shadow-lg"
          >
            <History className="w-5 h-5 text-gray-500" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 truncate">
                {getCurrentHistoryTitle()}
              </div>
              <div className="text-xs text-gray-500">
                {histories.length} conversation{histories.length > 1 ? "s" : ""}
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-gray-500 transition-transform ${
                isDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {/* Menu dropdown */}
          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden">
              {/* Bouton nouvelle conversation */}
              <div className="p-3 border-b border-gray-100">
                <button
                  onClick={handleNewChat}
                  className="w-full flex items-center gap-3 px-3 py-2 bg-cactus-600 text-white rounded-lg hover:bg-cactus-700 transition-colors font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Nouvelle conversation
                </button>
              </div>

              {/* Liste des conversations */}
              <div className="max-h-80 overflow-y-auto">
                {histories.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Aucune conversation</p>
                  </div>
                ) : (
                  histories.map((history) => (
                    <div
                      key={history.id}
                      className={`group relative border-b border-gray-50 last:border-b-0 ${
                        selectedHistoryId === history.id
                          ? "bg-cactus-50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="w-full text-left p-3 flex items-start justify-between">
                        <button
                          onClick={() => handleSelectHistory(history.id)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="flex-1 min-w-0">
                            {editingHistoryId === history.id ? (
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) =>
                                  setEditingTitle(e.target.value)
                                }
                                onBlur={() => handleEditTitle(history.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter")
                                    handleEditTitle(history.id);
                                  if (e.key === "Escape") {
                                    setEditingHistoryId(null);
                                    setEditingTitle("");
                                  }
                                }}
                                className="w-full text-sm font-medium bg-transparent border border-cactus-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cactus-500"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <h3
                                className={`text-sm font-medium truncate ${
                                  selectedHistoryId === history.id
                                    ? "text-cactus-800"
                                    : "text-gray-900"
                                }`}
                              >
                                {history.title || "Conversation sans titre"}
                              </h3>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDate(history.createdAt)}
                            </p>
                          </div>
                        </button>

                        <div className="relative ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowHistoryOptions(
                                showHistoryOptions === history.id
                                  ? null
                                  : history.id
                              );
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-200 transition-all"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-500" />
                          </button>

                          {showHistoryOptions === history.id && (
                            <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-30 min-w-[140px]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingHistoryId(history.id);
                                  setEditingTitle(history.title || "");
                                  setShowHistoryOptions(null);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                              >
                                <Edit3 className="w-4 h-4" />
                                Renommer
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteHistory(history.id);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                              >
                                <Trash2 className="w-4 h-4" />
                                Supprimer
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Header avec titre centré */}
        <div className="flex items-center justify-center py-6 border-b border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900">Assistant IA</h1>
        </div>

        {/* Zone de chat avec scroll */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-6 messages-container"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "#cbd5e1 #f1f5f9",
          }}
        >
          <style
            dangerouslySetInnerHTML={{
              __html: `
              .messages-container::-webkit-scrollbar {
                width: 8px;
              }
              .messages-container::-webkit-scrollbar-track {
                background: #f1f5f9;
                border-radius: 4px;
              }
              .messages-container::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 4px;
              }
              .messages-container::-webkit-scrollbar-thumb:hover {
                background: #94a3b8;
              }
            `,
            }}
          />

          {/* Indicateur de chargement en haut du chat */}
          {loadingHistory && (
            <div className="flex items-center justify-center py-4 mb-4">
              <div className="flex items-center gap-3 text-cactus-600">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cactus-600"></div>
                <span className="text-sm font-medium">
                  Chargement des messages...
                </span>
              </div>
            </div>
          )}

          <div className="space-y-4 pb-32">
            {messages.map((message, idx) => {
              const isTypingMsg =
                message.text === "__TYPING__" ||
                (message.sender === "assistant" &&
                  message.text === "" &&
                  isAssistantTyping &&
                  idx === messages.length - 1);

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    message.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`relative max-w-[90%] rounded-lg p-4 ${
                      message.sender === "user"
                        ? "bg-cactus-600 user-message-white"
                        : "bg-transparent text-gray-900"
                    }`}
                    data-user-message={
                      message.sender === "user" ? true : undefined
                    }
                  >
                    {(() => {
                      if (isTypingMsg) {
                        return (
                          <div className="flex items-center gap-3">
                            <TypingIndicator />
                          </div>
                        );
                      }
                      try {
                        const parsed = JSON.parse(message.text);
                        if (parsed?.type === "cards") {
                          return (
                            <div className="space-y-4">
                              <div className="flex items-center gap-2 mb-4">
                                <div className="w-2 h-2 bg-cactus-600 rounded-full"></div>
                                <p className="text-sm font-semibold text-gray-800">
                                  Programmes trouvés ({parsed.items.length})
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-4">
                                {parsed.items
                                  .slice(0, 7)
                                  .map((item: ProgramCard, index: number) => {
                                    const platformColors = getPlatformColor(
                                      item.platform || ""
                                    );
                                    return (
                                      <div
                                        key={index}
                                        className="bg-white rounded-xl border border-gray-200 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group cursor-pointer transform hover:scale-[1.02] hover:-translate-y-1"
                                        onClick={() => handleCardClick(item)}
                                      >
                                        <div
                                          className={`${platformColors.bg} ${platformColors.text} px-4 py-3 flex items-center justify-between relative overflow-hidden`}
                                        >
                                          <div className="flex items-center gap-3 z-10">
                                            <div
                                              className={`p-1.5 rounded-full ${platformColors.accent} bg-opacity-30`}
                                            >
                                              {getContentIcon(item.type)}
                                            </div>
                                            <div>
                                              <span className="font-bold text-sm uppercase tracking-wider">
                                                {item.platform || "Plateforme"}
                                              </span>
                                              <div className="text-xs opacity-90">
                                                {item.type}
                                              </div>
                                            </div>
                                          </div>
                                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-10 transform -skew-x-12 transition-all duration-700 group-hover:translate-x-full"></div>
                                        </div>

                                        <div className="p-5 space-y-4">
                                          <div>
                                            <h3 className="font-bold text-lg text-gray-900 group-hover:text-cactus-600 transition-colors leading-tight">
                                              {item.title}
                                            </h3>

                                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                              {item.year && (
                                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                                                  <Calendar className="w-3 h-3" />
                                                  {item.year}
                                                </span>
                                              )}
                                              {item.rating && (
                                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                                                  <Star className="w-3 h-3 fill-current" />
                                                  {item.rating}
                                                </span>
                                              )}
                                              {item.duration && (
                                                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium flex items-center gap-1">
                                                  <Clock className="w-3 h-3" />
                                                  {item.duration}
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          {item.genre && (
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                                Genre:
                                              </span>
                                              <span className="text-sm text-cactus-700 font-medium">
                                                {item.genre}
                                              </span>
                                            </div>
                                          )}

                                          {item.description && (
                                            <p className="text-sm text-gray-700 leading-relaxed">
                                              {item.description}
                                            </p>
                                          )}

                                          {item.releaseDate && (
                                            <div className="pt-3 border-t border-gray-100">
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs text-gray-500 font-medium">
                                                  Disponible depuis
                                                </span>
                                                <span className="text-xs text-cactus-600 font-bold bg-cactus-50 px-2 py-1 rounded">
                                                  {item.releaseDate}
                                                </span>
                                              </div>
                                            </div>
                                          )}
                                        </div>

                                        <div
                                          className={`h-1 ${platformColors.bg} group-hover:h-2 transition-all duration-300`}
                                        ></div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          );
                        }
                      } catch {
                        if (message.text === "__ERROR__") {
                          return <ErrorMessage />;
                        }
                        if (message.text === "__CANCELLED__") {
                          return <ErrorMessage cancelled />;
                        }
                      }

                      return (
                        <div className="text-base font-sans">
                          <div className="prose prose-base sm:prose-lg max-w-none leading-relaxed space-y-4 text-gray-900">
                            <ReactMarkdown
                              children={message.text}
                              remarkPlugins={[
                                remarkGfm,
                                remarkBreaks,
                                remarkEmoji,
                              ]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                code({ node, className, children, ...props }) {
                                  return (
                                    <code
                                      className={`bg-gray-100 px-1 py-0.5 rounded text-sm font-mono ${className}`}
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  );
                                },
                                pre({ node, children, ...props }) {
                                  return (
                                    <pre
                                      className="bg-gray-800 text-white p-4 rounded-lg overflow-x-auto text-sm leading-snug"
                                      {...props}
                                    >
                                      {children}
                                    </pre>
                                  );
                                },
                              }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
            {/* Espace supplémentaire dynamique en bas du chat */}
            <div style={{ height: `${extraBottomSpace}px` }} />
            <div ref={messagesEndRef} className="h-8" />
          </div>
        </div>

        {/* Input fixé en bas */}
        <div className="border-t border-gray-100 bg-white p-4">
          {/* Nouveautés par plateforme */}
          <div className="mb-4 space-y-2 group">
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 bg-cactus-600 rounded-full"></div>
              <span className="text-sm font-bold text-cactus-800">
                🎬 Découvrez les nouveautés par plateforme
              </span>
            </div>
            <div className="flex flex-wrap gap-2 transition-all duration-300 opacity-0 max-h-0 group-hover:opacity-100 group-hover:max-h-[200px] overflow-hidden">
              {[
                "Canal+",
                "Canal+ Box Office",
                "Canal+ Grand Ecran",
                "Canal+ Sport 360",
                "Canal+ Séries",
                "Canal+ Docs",
                "Canal+ Kids",
                "Canal+ Sport",
                "Canal+ Foot",
                "Canal+ Cinéma(s)",
                "CANAL+ à la Demande",
                "Apple TV+",
                "Max",
                "Netflix Avec Pub",
                "Paramount+",
                "Ciné+ OCS",
                "Insomnia",
                "beIN SPORTS",
                "Eurosport",
                "Pass Coupes d'Europe",
                "Infosport+",
              ].map((label) => {
                const colors = getPlatformColor(label);
                return (
                  <button
                    key={label}
                    onClick={() => handleStructuredQuery(`${label}`)}
                    className={`${colors.bg} ${colors.text} hover:opacity-90 font-medium px-3 py-2 rounded-lg text-xs shadow-sm transition-all duration-200 hover:scale-105 border ${colors.border} hover:shadow-md`}
                    disabled={isAssistantTyping}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSendMessage} className="flex gap-2 items-end">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Demandez-moi les nouveautés d'une plateforme ou posez votre question..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-cactus-400 focus:border-cactus-400 transition-all duration-150 bg-white"
              disabled={isAssistantTyping || loadingHistory}
              style={{ minHeight: 36, maxHeight: 60 }}
            />
            {isAssistantTyping ? (
              <button
                type="button"
                className="btn-secondary px-4 h-9 flex items-center gap-2 text-red-600 border-red-400 border bg-white hover:bg-red-50 font-semibold rounded text-sm"
                onClick={handleCancel}
              >
                Annuler
              </button>
            ) : (
              <button
                type="submit"
                className="btn-primary px-4 h-9 flex items-center gap-2 text-sm"
                disabled={!inputMessage.trim() || loadingHistory}
              >
                <Send className="w-4 h-4" />
                Envoyer
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default AiAssistantPage;
