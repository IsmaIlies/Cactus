import React from "react";
import { Calendar, Star, Clock, Play } from "lucide-react";

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

interface ContentCardProps {
  content: StreamingContent;
  onSelect: (content: StreamingContent) => void;
  viewMode?: "grid" | "list";
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

const ContentCard: React.FC<ContentCardProps> = ({
  content,
  onSelect,
  viewMode = "grid",
}) => {
  const imageUrls = content.imageUrl;

  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (!img.src.includes("fallback")) {
      img.src = imageUrls.fallback;
    }
  };

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

  // Fonction pour traduire les genres
  const translateGenres = (genres: string[] = []) => {
    return genres
      .map((genre) => GENRE_TRANSLATIONS[genre.toLowerCase()] || genre)
      .filter(Boolean);
  };

  // Fonction pour raccourcir le nom de la plateforme si nécessaire
  const getShortenedPlatform = (platform: string) => {
    const shortNames: Record<string, string> = {
      "Netflix Standard with Ads": "Netflix Pub",
      "Amazon Prime Video": "Prime Video",
      "Canal+ Séries": "Canal+ Séries",
      "Ciné+ OCS": "OCS",
      "Paramount+": "Paramount+",
      "Disney Plus": "Disney+",
    };
    return shortNames[platform] || platform;
  };

  const translatedGenres = translateGenres(content.genres);

  if (viewMode === "list") {
    return (
      <div
        onClick={() => onSelect(content)}
        className="cursor-pointer bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-200 hover:border-cactus-300"
      >
        <div className="flex">
          <div className="w-24 h-36 flex-shrink-0">
            <picture className="w-full h-full">
              <source type="image/avif" srcSet={imageUrls.avif} />
              <source type="image/webp" srcSet={imageUrls.webp} />
              <source type="image/jpeg" srcSet={imageUrls.jpeg} />
              <img
                alt={content.title}
                src={imageUrls.fallback}
                onError={handleImgError}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </picture>
          </div>

          <div className="flex-1 p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-900 line-clamp-1">
                  {content.title}
                </h3>
                <span
                  className={`px-2 py-1 text-xs text-white rounded-full ${getPlatformColor(
                    content.platform
                  )}`}
                >
                  {getShortenedPlatform(content.platform)}
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {content.releaseDate.getFullYear()}
                </span>
                <span className="capitalize">
                  {content.type === "movie" ? "Film" : "Série"}
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

              <p className="text-sm text-gray-600 line-clamp-2">
                {content.description}
              </p>
            </div>

            <div className="flex items-center justify-between mt-3">
              <div className="flex flex-wrap gap-1">
                {translatedGenres.slice(0, 3).map((genre, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                  >
                    {genre}
                  </span>
                ))}
                {translatedGenres.length > 3 && (
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                    +{translatedGenres.length - 3}
                  </span>
                )}
              </div>
              <button className="flex items-center gap-1 text-cactus-600 hover:text-cactus-700 text-sm font-medium">
                <Play className="w-4 h-4" />
                Voir plus
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(content)}
      className="cursor-pointer bg-white rounded-lg shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group border border-gray-200 hover:border-cactus-300 hover:-translate-y-1"
    >
      <div className="relative">
        <div className="w-full aspect-[2/3] overflow-hidden">
          <picture className="w-full h-full">
            <source type="image/avif" srcSet={imageUrls.avif} />
            <source type="image/webp" srcSet={imageUrls.webp} />
            <source type="image/jpeg" srcSet={imageUrls.jpeg} />
            <img
              alt={content.title}
              src={imageUrls.fallback}
              onError={handleImgError}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </picture>
        </div>

        {/* Overlay avec bouton play */}
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-300 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="bg-white rounded-full p-3 shadow-lg">
              <Play className="w-6 h-6 text-cactus-600" />
            </div>
          </div>
        </div>

        {/* Header avec plateforme et type - Nouvelle disposition */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
          {/* Badge plateforme - maintenant à gauche */}
          <span
            className={`px-2 py-1 text-xs text-white rounded-full ${getPlatformColor(
              content.platform
            )} shadow-lg max-w-[70%] truncate`}
            title={content.platform} // Tooltip pour voir le nom complet
          >
            {getShortenedPlatform(content.platform)}
          </span>

          {/* Badge type - maintenant à droite */}
          <span className="px-2 py-1 text-xs bg-black bg-opacity-70 text-white rounded-full flex-shrink-0">
            {content.type === "movie" ? "Film" : "Série"}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 group-hover:text-cactus-600 transition-colors">
          {content.title}
        </h3>

        <div className="flex items-center gap-3 text-sm text-gray-500">
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

        <p className="text-sm text-gray-600 line-clamp-3">
          {content.description}
        </p>

        {translatedGenres && translatedGenres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {translatedGenres.slice(0, 2).map((genre, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
              >
                {genre}
              </span>
            ))}
            {translatedGenres.length > 2 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                +{translatedGenres.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentCard;
