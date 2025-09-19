import React from "react";
import { Target } from "lucide-react";
import { CallData } from "../pages/CallScriptPage";

interface StepProps {
  callData: CallData;
  setCallData: React.Dispatch<React.SetStateAction<CallData>>;
}

const CallScriptStep5: React.FC<StepProps> = ({ callData, setCallData }) => {
  const dynamicQuestions = [
    {
      id: "usage_tv",
      question: "Vous regardez plutôt la télé ou les plateformes ?",
      options: ["TV", "Plateformes", "Un peu des deux"],
      value: callData.preferences.watchingFrequency,
      onSelect: (val: string) =>
        setCallData((prev) => ({
          ...prev,
          preferences: { ...prev.preferences, watchingFrequency: val },
        })),
    },
    {
      id: "type_contenu",
      question: "Quel type de contenus aimez-vous ?",
      options: ["Films", "Séries", "Sport", "Documentaires"],
      value: callData.preferences.genres,
      onSelect: (val: string) => {
        const already = callData.preferences.genres.includes(val);
        const newGenres = already
          ? callData.preferences.genres.filter((g) => g !== val)
          : [...callData.preferences.genres, val];

        const resetState = { ...callData.preferences };

        // Réinitialise les champs liés si on retire un genre
        if (already) {
          if (val === "Sport") {
            resetState.sports = [];
          }
          if (val === "Films") {
            resetState.favoriteFilm = "";
            resetState.favoriteActor = "";
            resetState.favoriteFilmGenres = [];
          }
          if (val === "Séries") {
            resetState.favoriteSeries = "";
            resetState.favoriteSeriesGenres = [];
          }
        }

        setCallData((prev) => ({
          ...prev,
          preferences: {
            ...resetState,
            genres: newGenres,
          },
        }));
      },
    },
    {
      id: "type_sport",
      question: "Quel(s) sport(s) vous intéresse(nt) ?",
      options: ["Foot", "F1", "Tennis", "Combats", "Rugby"],
      condition: (data: CallData) => data.preferences.genres.includes("Sport"),
      value: callData.preferences.sports,
      onSelect: (val: string) => {
        const already = callData.preferences.sports.includes(val);
        const updated = already
          ? callData.preferences.sports.filter((s) => s !== val)
          : [...callData.preferences.sports, val];

        setCallData((prev) => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            sports: updated,
          },
        }));
      },
    },
    {
      id: "film_prefere",
      question: "Quel est votre film préféré ?",
      condition: (data: CallData) => data.preferences.genres.includes("Films"),
      value: callData.preferences.favoriteFilm || "",
      onSelect: (val: string) =>
        setCallData((prev) => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            favoriteFilm: val,
          },
        })),
    },
    {
      id: "acteur_prefere",
      question: "Quel est votre acteur ou actrice préféré(e) ?",
      condition: (data: CallData) => data.preferences.genres.includes("Films"),
      value: callData.preferences.favoriteActor || "",
      onSelect: (val: string) =>
        setCallData((prev) => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            favoriteActor: val,
          },
        })),
    },
    {
      id: "genre_film_prefere",
      question: "Quels genres de films préférez-vous ?",
      options: [
        "Action",
        "Comédie",
        "Drame",
        "Science-fiction",
        "Horreur",
        "Romance",
      ],
      condition: (data: CallData) => data.preferences.genres.includes("Films"),
      value: callData.preferences.favoriteFilmGenres || [],
      onSelect: (val: string) => {
        const already = callData.preferences.favoriteFilmGenres?.includes(val);
        const updated = already
          ? callData.preferences.favoriteFilmGenres!.filter((g) => g !== val)
          : [...(callData.preferences.favoriteFilmGenres || []), val];

        setCallData((prev) => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            favoriteFilmGenres: updated,
          },
        }));
      },
    },
    {
      id: "genre_serie_preferee",
      question: "Quels genres de séries préférez-vous ?",
      options: [
        "Thriller",
        "Comédie",
        "Policier",
        "Science-fiction",
        "Romance",
        "Historique",
      ],
      condition: (data: CallData) => data.preferences.genres.includes("Séries"),
      value: callData.preferences.favoriteSeriesGenres || [],
      onSelect: (val: string) => {
        const already =
          callData.preferences.favoriteSeriesGenres?.includes(val);
        const updated = already
          ? callData.preferences.favoriteSeriesGenres!.filter((g) => g !== val)
          : [...(callData.preferences.favoriteSeriesGenres || []), val];

        setCallData((prev) => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            favoriteSeriesGenres: updated,
          },
        }));
      },
    },
    {
      id: "serie_preferee",
      question: "Quelle est votre série préférée ?",
      condition: (data: CallData) => data.preferences.genres.includes("Séries"),
      value: callData.preferences.favoriteSeries || "",
      onSelect: (val: string) =>
        setCallData((prev) => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            favoriteSeries: val,
          },
        })),
    },
    {
      id: "enfants",
      question: "Il y a des enfants ou ados qui utilisent la TV ?",
      options: ["Oui", "Non"],
      value: callData.clientInfo.hasChildren ? "Oui" : "Non",
      onSelect: (val: string) =>
        setCallData((prev) => ({
          ...prev,
          clientInfo: {
            ...prev.clientInfo,
            hasChildren: val === "Oui",
            hasTeens: val === "Oui",
          },
        })),
    },
    {
      id: "box_usage",
      question:
        "Vous utilisez plutôt la box Orange ou une appli (TV/tablette) ?",
      options: ["Box Orange", "Appli", "Les deux"],
      value: callData.preferences.deviceUsage || "",
      onSelect: (val: string) =>
        setCallData((prev) => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            deviceUsage: val,
          },
        })),
    },
  ];

  return (
    <div className="space-y-4">
      {dynamicQuestions
        .filter((q) => !q.condition || q.condition(callData))
        .map((q) => (
          <div key={q.id} className="bg-white border p-4 rounded-lg space-y-2">
            <p className="font-medium text-gray-900">... {q.question.replace(/\?+\s*$/, "").trim()} ...</p>
            {q.options ? (
              <div className="flex flex-wrap gap-2">
                {q.options.map((option) => {
                  const isMulti = Array.isArray(q.value);
                  const isSelected = isMulti
                    ? q.value.includes(option)
                    : q.value === option;

                  return (
                    <button
                      key={option}
                      className={`px-3 py-1 border rounded text-sm ${
                        isSelected
                          ? "bg-purple-600 text-white border-purple-600"
                          : "bg-gray-50 hover:bg-gray-100 border-gray-300 text-gray-700"
                      }`}
                      onClick={() => q.onSelect(option)}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="text"
                className="w-full mt-1 p-2 border border-gray-300 rounded"
                placeholder="Votre réponse..."
                value={q.value}
                onChange={(e) => q.onSelect(e.target.value)}
              />
            )}
          </div>
        ))}

      <div className="bg-white border p-4 rounded-lg space-y-2">
        <p className="font-medium text-gray-900">Notes supplémentaires</p>
        <textarea
          className="w-full mt-1 p-2 border border-gray-300 rounded resize-none"
          rows={4}
          placeholder="Ajoutez ici toute remarque complémentaire..."
          value={callData.notes || ""}
          onChange={(e) =>
            setCallData((prev) => ({
              ...prev,
              notes: e.target.value,
            }))
          }
        />
      </div>
    </div>
  );
};

export default CallScriptStep5;
