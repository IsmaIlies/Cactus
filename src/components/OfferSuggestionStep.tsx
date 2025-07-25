// OfferSuggestionStep.tsx (mise à jour avec persistance de messages et objections)

import React, { useEffect, useState } from "react";
import {
  streamOfferScript,
  respondToObjection,
  getObjectionsFromScript,
} from "../services/geminiService";
import { CallData } from "../pages/CallScriptPage";
import type { Message } from "../types/types";
import { Loader2, MessageSquare, RotateCcw } from "lucide-react";

interface Props {
  callData: CallData;
  setCallData: React.Dispatch<React.SetStateAction<CallData>>;
}

const OfferSuggestionStep: React.FC<Props> = ({ callData, setCallData }) => {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>(callData.messages || []);
  const [objections, setObjections] = useState<string[]>(
    callData.objections || []
  );
  const [streamingText, setStreamingText] = useState<string>("");
  const [customObjection, setCustomObjection] = useState("");

  const generateScript = async () => {
    setLoading(true);
    let fullResponse = "";
    setMessages([]);
    setObjections([]);
    setStreamingText("");
    setCallData((prev) => ({
      ...prev,
      offerScript: "",
      messages: [],
      objections: [],
    }));

    try {
      for await (const chunk of streamOfferScript(callData)) {
        fullResponse += chunk;
        setStreamingText(fullResponse);
        setCallData((prev) => ({ ...prev, offerScript: fullResponse }));
      }

      const updatedMessages: Message[] = [
        { from: "IA" as const, text: fullResponse },
      ];
      setMessages(updatedMessages);
      setStreamingText("");

      const dynamicObjections = await getObjectionsFromScript(fullResponse);
      setObjections(dynamicObjections);

      setCallData((prev) => ({
        ...prev,
        messages: updatedMessages,
        objections: dynamicObjections,
      }));
    } catch (err) {
      console.error("Erreur génération initiale:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!callData.offerScript) {
      generateScript();
    } else {
      setMessages(
        callData.messages || [{ from: "IA", text: callData.offerScript }]
      );
      setObjections(callData.objections || []);
    }
  }, []);

  const handleObjection = async (objection: string) => {
    const updatedMessages: Message[] = [
      ...messages,
      { from: "Client" as const, text: objection },
    ];
    setMessages(updatedMessages);
    setCallData((prev) => ({ ...prev, messages: updatedMessages }));
    setLoading(true);
    try {
      const res = await respondToObjection(updatedMessages, objection);
      const newMessages: Message[] = [
        ...updatedMessages,
        { from: "IA" as const, text: res.response },
      ];
      setMessages(newMessages);
      setObjections(res.followUpObjections);
      setCallData((prev) => ({
        ...prev,
        messages: newMessages,
        objections: res.followUpObjections,
      }));
    } catch (err) {
      console.error("Erreur objection:", err);
    } finally {
      setLoading(false);
    }
  };

  const submitObjection = async () => {
    const trimmed = customObjection.trim();
    if (!trimmed) return;
    await handleObjection(trimmed);
    setCustomObjection(""); // reset input après envoi
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-800 text-lg">
            Script de vente & objections client
          </h3>
        </div>
        <button
          onClick={generateScript}
          className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
        >
          <RotateCcw className="w-4 h-4" /> Régénérer le script
        </button>
      </div>

      <div className="bg-white border p-4 rounded-lg space-y-3 min-h-[150px] font-mono text-sm break-words">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`${
              m.from === "IA"
                ? "text-gray-800 bg-gray-50 p-3 rounded-md"
                : "text-red-600 font-semibold bg-red-50 p-3 rounded-md"
            } whitespace-pre-wrap`}
          >
            <strong className="block mb-1">
              {m.from === "IA" ? "Vous " : "Client "}:
            </strong>
            {m.text}
          </div>
        ))}

        {streamingText && (
          <div
            className="text-gray-800 bg-gray-100 p-3 rounded-md text-sm leading-relaxed break-words"
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              minHeight: "100px",
            }}
          >
            <strong className="block mb-1">Vous :</strong>
            {streamingText}
          </div>
        )}

        {loading && !streamingText && (
          <div className="text-sm text-gray-400 flex items-center gap-1">
            <Loader2 className="animate-spin w-4 h-4" />
            Réponse en cours...
          </div>
        )}
      </div>

      {!loading && (
        <div className="space-y-2">
          {objections.length > 0 && (
            <>
              <p className="text-sm text-gray-500">Objections possibles :</p>
              <div className="flex flex-wrap gap-2">
                {objections.map((obj, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleObjection(obj)}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 shadow-sm"
                  >
                    {obj}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Champ pour objection personnalisée */}
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={customObjection}
              onChange={(e) => setCustomObjection(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitObjection();
                }
              }}
              placeholder="Saisir une objection manuellement..."
              className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
            />
            <button
              onClick={submitObjection}
              disabled={!customObjection.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded shadow-sm disabled:opacity-50"
            >
              Envoyer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfferSuggestionStep;
