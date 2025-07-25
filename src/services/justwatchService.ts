// services/justwatchService.ts

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

interface FetchFilters {
  providers?: string[];
  genres?: string[];
  excludeGenres?: string[];
  ages?: string[];
  minYear?: number;
  maxYear?: number;
  query?: string;
  type?: "movie" | "series" | "all";
  sortBy?: "POPULAR" | "RELEASE_YEAR" | "TITLE";
}

function getImageVariantsFromPosterUrl(posterUrl: string) {
  const match = posterUrl.match(
    /poster\/(\d+)\/[^/]+\/(.+)\.(webp|jpg|jpeg|avif)/
  );
  if (!match) {
    return {
      avif: "",
      webp: "",
      jpeg: "",
      fallback: "",
    };
  }

  const [, posterId, slug] = match;
  const base = `https://images.justwatch.com/poster/${posterId}/s332`;

  return {
    avif: `${base}/${slug}.avif`,
    webp: `${base}/${slug}.webp`,
    jpeg: `${base}/${slug}.jpg`,
    fallback: `${base}/${slug}.jpg`,
  };
}

const platformMap: Record<string, string> = {
  dnp: "Disney Plus",
  atp: "Apple TV+",
  cpd: "Canal+",
  pmp: "Paramount+",
  aoc: "Ciné+ OCS",
  prv: "Amazon Prime Video",
  nfa: "Netflix Standard with Ads",
  ima: "Insomnia",
  cns: "Canal+ Séries",
  nfx: "Netflix",
  mxx: "Max",
};

// Plateformes par défaut (toutes celles spécifiées)
const DEFAULT_PLATFORMS = Object.keys(platformMap);

// Genres disponibles (aucun sélectionné par défaut)
export const AVAILABLE_GENRES = [
  "trl",
  "war",
  "spt",
  "eur",
  "hrr",
  "crm",
  "drm",
  "wsn",
  "hst",
  "rly",
  "fnt",
  "ani",
  "doc",
  "scf",
  "cmy",
  "msc",
  "rma",
  "act",
];

// Genres qui peuvent être exclus (tous les genres disponibles)
export const EXCLUDABLE_GENRES = AVAILABLE_GENRES;

const fetchContentFromAllProviders = async (
  filters: FetchFilters = {}
): Promise<StreamingContent[]> => {
  const url = "https://justwatch.cactus-saas-dev.workers.dev/";

  const query = `
    query GetPopularTitles(
      $country: Country!
      $language: Language!
      $first: Int!
      $popularTitlesFilter: TitleFilter
      $watchNowFilter: WatchNowOfferFilter!
      $popularTitlesSortBy: PopularTitlesSorting = RELEASE_YEAR
      $sortRandomSeed: Int = 0
      $offset: Int
      $after: String
      $profile: PosterProfile
      $format: ImageFormat
      $creditsRole: CreditRole
    ) {
      popularTitles(
        country: $country
        filter: $popularTitlesFilter
        first: $first
        sortBy: $popularTitlesSortBy
        sortRandomSeed: $sortRandomSeed
        offset: $offset
        after: $after
      ) {
        edges {
          node {
            objectType
            content(country: $country, language: $language) {
              title
              fullPath
              originalReleaseYear
              shortDescription
              posterUrl(profile: $profile, format: $format)
              genres { shortName }
              ageCertification
              credits(role: $creditsRole) { name }
            }
            watchNowOffer(country: $country, platform: WEB, filter: $watchNowFilter) {
              package { technicalName clearName }
            }
          }
        }
      }
    }
  `;

  const variables = {
    country: "FR",
    language: "fr",
    first: 100,
    profile: "S332",
    format: "WEBP",
    creditsRole: "DIRECTOR",
    after: "",
    offset: null,
    popularTitlesSortBy:
      filters.sortBy || (filters.query ? "POPULAR" : "RELEASE_YEAR"),
    popularTitlesFilter: {
      ageCertifications: filters.ages ?? ["U", "10", "12", "16", "18", "T"],
      objectTypes:
        filters.type === "movie"
          ? ["MOVIE"]
          : filters.type === "series"
          ? ["SHOW"]
          : ["MOVIE", "SHOW"],
      genres: filters.genres ?? [], // Aucun genre sélectionné par défaut
      packages: filters.providers?.length
        ? filters.providers
        : DEFAULT_PLATFORMS,
      releaseYear: {
        min: filters.minYear ?? 2015,
        max: filters.maxYear ?? 2025,
      },
      excludeIrrelevantTitles: false,
      excludeGenres: filters.excludeGenres ?? [], // Aucun genre exclu par défaut
      productionCountries: [],
      excludeProductionCountries: [],
      subgenres: [],
      monetizationTypes: [],
      presentationTypes: [],
      searchQuery: filters.query ?? "",
    },
    watchNowFilter: {
      packages: filters.providers?.length
        ? filters.providers
        : DEFAULT_PLATFORMS,
      monetizationTypes: [],
    },
  };

  const body = JSON.stringify({
    operationName: "GetPopularTitles",
    variables,
    query,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const data = await response.json();
    if (!data?.data?.popularTitles?.edges) return [];

    return data.data.popularTitles.edges.map((edge: any) => {
      const node = edge.node;
      const content = node.content;

      const posterUrl = content.posterUrl;

      return {
        id: content.fullPath,
        title: content.title,
        type: node.objectType === "MOVIE" ? "movie" : "series",
        platform: node.watchNowOffer?.package?.clearName || "Inconnue",
        releaseDate: new Date(content.originalReleaseYear, 0),
        description: content.shortDescription || "Pas de description.",
        imageUrl: posterUrl
          ? getImageVariantsFromPosterUrl(posterUrl)
          : { avif: "", webp: "", jpeg: "", fallback: "" },
        director: content.credits?.[0]?.name || undefined,
        rating: content.ageCertification || undefined,
        genres: content.genres?.map((g: any) => g.shortName),
      };
    });
  } catch (err) {
    console.error("Erreur JustWatch:", err);
    return [];
  }
};

export default fetchContentFromAllProviders;
export { platformMap, DEFAULT_PLATFORMS };
