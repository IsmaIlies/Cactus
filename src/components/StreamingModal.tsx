import { X, Calendar, Star, Clock, Users } from "lucide-react";
import { useEffect } from "react";

interface StreamingContent {
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

// Traduction des codes de genres vers les noms français
const GENRE_TRANSLATIONS: Record<string, string> = {
  // Genres principaux
  act: "Action",
  ani: "Animation",
  cmy: "Comédie",
  crm: "Crime",
  doc: "Documentaire",
  drm: "Drame",
  eur: "Européen",
  fml: "Famille",
  fnt: "Fantastique",
  hrr: "Horreur",
  hst: "Historique",
  msc: "Musical",
  rly: "Téléréalité",
  rma: "Romance",
  scf: "Science-fiction",
  spt: "Sport",
  trl: "Thriller",
  war: "Guerre",
  wsn: "Western",

  // Genres spécifiques
  action: "Action",
  adventure: "Aventure",
  comedy: "Comédie",
  drama: "Drame",
  horror: "Horreur",
  thriller: "Thriller",
  romance: "Romance",
  "sci-fi": "Science-fiction",
  fantasy: "Fantastique",
  mystery: "Mystère",
  crime: "Crime",
  documentary: "Documentaire",
  animation: "Animation",
  family: "Famille",
  music: "Musical",
  sport: "Sport",
  // "war": "Guerre", // Removed duplicate key
  western: "Western",
  history: "Historique",
  biography: "Biographie",
};

interface StreamingModalProps {
  content: StreamingContent;
  onClose: () => void;
}

const StreamingModal: React.FC<StreamingModalProps> = ({
  content,
  onClose,
}) => {
  const { avif, webp, jpeg, fallback } = content.imageUrl;

  // Fonction pour traduire les genres
  const translateGenres = (genres: string[] = []) => {
    return genres
      .map((genre) => GENRE_TRANSLATIONS[genre.toLowerCase()] || genre)
      .filter(Boolean);
  };

  const translatedGenres = translateGenres(content.genres);

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      Netflix: "bg-red-600",
      "Netflix Standard with Ads": "bg-red-700",
      "Prime Video": "bg-blue-600",
      "Amazon Prime Video": "bg-blue-600",
      "Disney Plus": "bg-blue-800",
      "Apple TV+": "bg-gray-900",
      "Canal+": "bg-black",
      "Canal+ Séries": "bg-gray-800",
      "Paramount+": "bg-blue-700",
      "Ciné+ OCS": "bg-orange-600",
      Insomnia: "bg-violet-800",
      Max: "bg-purple-600",
    };
    return colors[platform] || "bg-gray-600";
  };

  // Gérer la fermeture avec la touche Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Empêcher le scroll du body quand la modal est ouverte
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header avec image de fond */}
        <div className="relative h-64 bg-gradient-to-r from-gray-900 to-gray-700">
          <picture className="absolute inset-0 w-full h-full opacity-30">
            <source type="image/avif" srcSet={avif} />
            <source type="image/webp" srcSet={webp} />
            <source type="image/jpeg" srcSet={jpeg} />
            <img
              src={fallback}
              alt={content.title}
              className="w-full h-full object-cover"
            />
          </picture>

          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />

          {/* Bouton fermer - SEUL BOUTON DE FERMETURE */}
          <button
            onClick={handleCloseClick}
            className="absolute top-4 right-4 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-2 transition-all z-10 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50"
            aria-label="Fermer"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Contenu du header */}
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
            <div className="flex items-end gap-6">
              {/* Poster */}
              <div className="w-32 h-48 rounded-lg overflow-hidden shadow-xl flex-shrink-0">
                <picture className="w-full h-full">
                  <source type="image/avif" srcSet={avif} />
                  <source type="image/webp" srcSet={webp} />
                  <source type="image/jpeg" srcSet={jpeg} />
                  <img
                    src={fallback}
                    alt={content.title}
                    className="w-full h-full object-cover"
                  />
                </picture>
              </div>

              {/* Informations principales */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`px-3 py-1 text-sm font-medium text-white rounded-full ${getPlatformColor(
                      content.platform
                    )}`}
                  >
                    {content.platform}
                  </span>
                  <span className="px-3 py-1 text-sm bg-white bg-opacity-20 rounded-full">
                    {content.type === "movie" ? "Film" : "Série"}
                  </span>
                </div>

                <h1 className="text-3xl font-bold mb-3 leading-tight">
                  {content.title}
                </h1>

                <div className="flex items-center gap-4 text-sm opacity-90">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {content.releaseDate.getFullYear()}
                  </span>
                  {content.rating && (
                    <span className="flex items-center gap-1">
                      <Star className="w-4 h-4" />
                      {content.rating}
                    </span>
                  )}
                  {content.duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {content.duration}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contenu principal */}
        <div className="p-6 max-h-96 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Colonne principale */}
            <div className="lg:col-span-2 space-y-6">
              {/* Description */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Synopsis
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  {content.description}
                </p>
              </div>

              {/* Genres */}
              {translatedGenres && translatedGenres.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Genres
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {translatedGenres.map((genre, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-cactus-100 text-cactus-800 text-sm rounded-full"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Distribution */}
              {content.cast && content.cast.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Distribution
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {content.cast.slice(0, 6).map((actor, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                      >
                        {actor}
                      </span>
                    ))}
                    {content.cast.length > 6 && (
                      <span className="px-3 py-1 bg-gray-100 text-gray-500 text-sm rounded-full">
                        +{content.cast.length - 6} autres
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Colonne latérale */}
            <div className="space-y-6">
              {/* Informations techniques */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Informations
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Type</span>
                    <span className="font-medium">
                      {content.type === "movie" ? "Film" : "Série"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-gray-600">Année</span>
                    <span className="font-medium">
                      {content.releaseDate.getFullYear()}
                    </span>
                  </div>

                  {content.rating && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Classification</span>
                      <span className="font-medium">{content.rating}</span>
                    </div>
                  )}

                  {content.duration && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Durée</span>
                      <span className="font-medium">{content.duration}</span>
                    </div>
                  )}

                  {content.director && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Réalisateur</span>
                      <span className="font-medium">{content.director}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Boutons d'action */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StreamingModal;
