// pages/CatalogPage.tsx
import { useEffect, useState } from "react";
import { Search, X, Grid, List, SlidersHorizontal } from "lucide-react";
import StreamingModal from "../components/StreamingModal";
import ContentCard from "../components/ContentCard";
import fetchContentFromAllProviders, {
  AVAILABLE_GENRES,
  EXCLUDABLE_GENRES,
} from "../services/justwatchService";
import { FALLBACK_SENTINEL_ID } from "../services/justwatchService";

export interface StreamingContent {
  id: string;
  title: string;
  type: "movie" | "series";
  platform: string;
  releaseDate: Date;
  description: string;
  imageUrl: {
    avif: string;
    webp: string;
    jpeg: string;
    fallback: string;
  };
  duration?: string;
  rating?: string;
  genres?: string[];
  cast?: string[];
  director?: string;
}

const GENRE_LABELS: Record<string, string> = {
  trl: "Mystère & Thriller",
  war: "Film de guerre",
  spt: "Sport & Fitness",
  eur: "Réalisé en Europe",
  hrr: "Horreur",
  crm: "Crime & Thriller",
  drm: "Drame",
  wsn: "Western",
  hst: "Histoire",
  rly: "Reality TV",
  fnt: "Fantastique",
  ani: "Animation",
  doc: "Documentaire",
  scf: "Science-Fiction",
  cmy: "Comédie",
  // Genres exclus
  msc: "Musique & Comédie musicale",
  rma: "Comédie Romantique",
  act: "Action & Aventure",
};

const AGE_CERTIFICATIONS = ["U", "10", "12", "16", "18", "T"];
const PROVIDERS = [
  { id: "dnp", name: "Disney Plus", color: "bg-blue-800" },
  { id: "atp", name: "Apple TV+", color: "bg-blue-600" },
  { id: "cpd", name: "Canal+", color: "bg-black" },
  { id: "pmp", name: "Paramount+", color: "bg-gray-800" },
  { id: "aoc", name: "Ciné+ OCS", color: "bg-purple-600" },
  { id: "prv", name: "Amazon Prime Video", color: "bg-orange-600" },
  { id: "nfa", name: "Netflix Standard with Ads", color: "bg-red-600" },
  { id: "ima", name: "Insomnia", color: "bg-blue-700" },
  { id: "cns", name: "Canal+ Séries", color: "bg-blue-700" },
  { id: "nfx", name: "Netflix", color: "bg-blue-700" },
  { id: "mxx", name: "Max", color: "bg-blue-700" },
];

const CatalogPage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContent, setSelectedContent] =
    useState<StreamingContent | null>(null);
  const [results, setResults] = useState<StreamingContent[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);

  // États des filtres
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [selectedAges, setSelectedAges] = useState<string[]>([]);
  const [minYear, setMinYear] = useState<number>(2015);
  const [maxYear, setMaxYear] = useState<number>(2025);
  const [selectedType, setSelectedType] = useState<"movie" | "series" | "all">(
    "all"
  );
  const [sortBy, setSortBy] = useState<"POPULAR" | "RELEASE_YEAR" | "TITLE">(
    "RELEASE_YEAR"
  );
  const [degraded, setDegraded] = useState(false);
  const [manualReloadKey, setManualReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true); setDegraded(false);
      try {
        const content = await fetchContentFromAllProviders({
          providers: selectedProviders,
          genres: selectedGenres,
          excludeGenres: excludedGenres,
          ages: selectedAges,
          minYear,
          maxYear,
          query: searchQuery,
          type: selectedType,
          sortBy: sortBy,
        });
        if(cancelled) return;
        setResults(content);
        if(content.some(c=> c.id === FALLBACK_SENTINEL_ID)) setDegraded(true);
      } catch (error) {
        if(!cancelled){ console.error("Erreur lors du chargement:", error); setDegraded(true); }
      } finally {
        if(!cancelled) setLoading(false);
      }
    };
    fetchData();
    return ()=>{ cancelled = true; };
  }, [
    searchQuery,
    selectedProviders,
    selectedGenres,
    excludedGenres,
    selectedAges,
    minYear,
    maxYear,
    selectedType,
    sortBy,
    manualReloadKey,
  ]);

  const toggle = (
    item: string,
    list: string[],
    setter: (val: string[]) => void
  ) => {
    setter(
      list.includes(item) ? list.filter((i) => i !== item) : [...list, item]
    );
  };

  const clearAllFilters = () => {
    setSelectedProviders([]);
    setSelectedGenres([]);
    setExcludedGenres([]);
    setSelectedAges([]);
    setMinYear(2015);
    setMaxYear(2025);
    setSelectedType("all");
    setSortBy("RELEASE_YEAR");
    setSearchQuery("");
  };

  const hasActiveFilters =
    selectedProviders.length > 0 ||
    selectedGenres.length > 0 ||
    excludedGenres.length > 0 ||
    selectedAges.length > 0 ||
    selectedType !== "all" ||
    minYear !== 2015 ||
    maxYear !== 2025;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header avec recherche et contrôles */}
      <div className="bg-white border-b border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            Catalogue de contenus
          </h1>
          <div className="flex items-center gap-3">
            {/* Toggle vue grille/liste */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === "grid"
                    ? "bg-white text-cactus-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-md transition-colors ${
                  viewMode === "list"
                    ? "bg-white text-cactus-600 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Bouton filtres */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                showFilters || hasActiveFilters
                  ? "bg-cactus-600 text-white border-cactus-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtres
              {hasActiveFilters && (
                <span className="bg-white text-cactus-600 text-xs px-2 py-0.5 rounded-full font-medium">
                  {[selectedProviders, selectedGenres, selectedAges].flat()
                    .length +
                    (selectedType !== "all" ? 1 : 0) +
                    (minYear !== 2015 || maxYear !== 2025 ? 1 : 0)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Barre de recherche */}
        <div className="relative max-w-2xl">
          <input
            type="text"
            placeholder="Rechercher un titre, un acteur, un réalisateur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-12 pl-12 pr-4 rounded-lg border border-gray-300 focus:ring-2 focus:ring-cactus-500 focus:border-cactus-500 transition-colors"
          />
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Filtres rapides */}
        <div className="flex flex-wrap gap-2">
          {["all", "movie", "series"].map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type as any)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                selectedType === type
                  ? "bg-cactus-600 text-white border-cactus-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {type === "all" ? "Tous" : type === "movie" ? "Films" : "Séries"}
            </button>
          ))}
        </div>

        {/* Sélecteur de tri */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Trier par :</span>
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "POPULAR" | "RELEASE_YEAR" | "TITLE")
            }
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-cactus-500 focus:border-cactus-500 transition-colors"
          >
            <option value="POPULAR">Popularité</option>
            <option value="RELEASE_YEAR">Année de sortie</option>
          </select>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Panneau de filtres latéral */}
        <div
          className={`bg-white border-r border-gray-200 transition-all duration-300 overflow-y-auto ${
            showFilters ? "w-80" : "w-0"
          }`}
        >
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Filtres</h3>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="text-sm text-cactus-600 hover:text-cactus-700 font-medium"
                >
                  Tout effacer
                </button>
              )}
            </div>

            {/* Plateformes */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Plateformes
              </h4>
              <div className="space-y-2">
                {PROVIDERS.map((provider) => (
                  <label key={provider.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedProviders.includes(provider.id)}
                      onChange={() =>
                        toggle(
                          provider.id,
                          selectedProviders,
                          setSelectedProviders
                        )
                      }
                      className="rounded border-gray-300 text-cactus-600 focus:ring-cactus-500"
                    />
                    <div className="ml-3 flex items-center gap-2">
                      <div className={`w-3 h-3 rounded ${provider.color}`} />
                      <span className="text-sm text-gray-700">
                        {provider.name}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Genres */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Genres à inclure
              </h4>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {Object.entries(GENRE_LABELS)
                  .filter(([key]) => AVAILABLE_GENRES.includes(key))
                  .map(([key, label]) => (
                    <label key={key} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedGenres.includes(key)}
                        onChange={() =>
                          toggle(key, selectedGenres, setSelectedGenres)
                        }
                        className="rounded border-gray-300 text-cactus-600 focus:ring-cactus-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        {label}
                      </span>
                    </label>
                  ))}
              </div>

              {/* Genres à exclure */}
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Genres à exclure
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(GENRE_LABELS)
                  .filter(([key]) => EXCLUDABLE_GENRES.includes(key))
                  .map(([key, label]) => (
                    <label key={key} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={excludedGenres.includes(key)}
                        onChange={() =>
                          toggle(key, excludedGenres, setExcludedGenres)
                        }
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">
                        {label}
                      </span>
                      <span className="ml-1 text-xs text-red-500"></span>
                    </label>
                  ))}
              </div>
            </div>

            {/* Âge */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Classification d'âge
              </h4>
              <div className="flex flex-wrap gap-2">
                {AGE_CERTIFICATIONS.map((age) => (
                  <button
                    key={age}
                    onClick={() => toggle(age, selectedAges, setSelectedAges)}
                    className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                      selectedAges.includes(age)
                        ? "bg-cactus-600 text-white border-cactus-600"
                        : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {age}
                  </button>
                ))}
              </div>
            </div>

            {/* Années */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Période
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Année minimum
                  </label>
                  <input
                    type="range"
                    min="1990"
                    max="2025"
                    value={minYear}
                    onChange={(e) => setMinYear(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-sm text-gray-600 mt-1">{minYear}</div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Année maximum
                  </label>
                  <input
                    type="range"
                    min="1990"
                    max="2025"
                    value={maxYear}
                    onChange={(e) => setMaxYear(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-sm text-gray-600 mt-1">{maxYear}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Zone de contenu principal */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Barre d'état */}
            <div className="flex items-center justify-between mb-6">
              <div className="text-sm text-gray-600">
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cactus-600"></div>
                    Chargement...
                  </div>
                ) : (
                  `${results.length} résultat${
                    results.length > 1 ? "s" : ""
                  } trouvé${results.length > 1 ? "s" : ""}`
                )}
              </div>

              {hasActiveFilters && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Filtres actifs:</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedProviders.map((id) => {
                      const provider = PROVIDERS.find((p) => p.id === id);
                      return provider ? (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-cactus-100 text-cactus-800 text-xs rounded-full"
                        >
                          {provider.name}
                          <button
                            onClick={() =>
                              toggle(
                                id,
                                selectedProviders,
                                setSelectedProviders
                              )
                            }
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ) : null;
                    })}
                    {selectedGenres.map((key) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        {GENRE_LABELS[key]}
                        <button
                          onClick={() =>
                            toggle(key, selectedGenres, setSelectedGenres)
                          }
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {degraded && !loading && (
              <div className="mb-6 p-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm flex flex-col gap-2">
                <div className="font-semibold flex items-center gap-2">⚠ Mode dégradé (proxy catalogue indisponible)</div>
                <p className="leading-snug">Le service distant ne répond pas (CORS ou réseau). Les données affichées sont limitées. Réessaie ou contacte un administrateur si le problème persiste.</p>
                <div className="flex gap-2">
                  <button onClick={()=> setManualReloadKey(k=>k+1)} className="px-3 py-1.5 rounded-md bg-cactus-600 text-white text-xs font-medium hover:bg-cactus-700">Réessayer</button>
                  <button onClick={()=> clearAllFilters()} className="px-3 py-1.5 rounded-md border border-amber-300 bg-white text-amber-700 text-xs font-medium hover:bg-amber-100">Réinitialiser filtres</button>
                </div>
              </div>
            )}

            {/* Grille de contenu */}
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cactus-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Chargement des contenus...</p>
                </div>
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <Search className="w-16 h-16 mx-auto" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Aucun contenu trouvé
                </h3>
                <p className="text-gray-600 mb-4">
                  Essayez de modifier vos critères de recherche ou vos filtres.
                </p>
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="text-cactus-600 hover:text-cactus-700 font-medium"
                  >
                    Effacer tous les filtres
                  </button>
                )}
              </div>
            ) : (
              <div
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6"
                    : "space-y-4"
                }
              >
                {results.map((content) => (
                  <ContentCard
                    key={content.id}
                    content={content}
                    onSelect={setSelectedContent}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de contenu */}
      {selectedContent && (
        <StreamingModal
          content={selectedContent}
          onClose={() => setSelectedContent(null)}
        />
      )}
    </div>
  );
};

export default CatalogPage;
