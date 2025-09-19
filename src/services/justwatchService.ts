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

const FETCH_TIMEOUT_MS = 12000;
// Cloud Function proxy (rewrite Firebase hosting -> justwatchProxy)
const WORKER_URL = "/api/justwatch"; // relative path, évite CORS

// Jeu de données fallback ultra minimal si le proxy est down / CORS
export const FALLBACK_SENTINEL_ID = "fallback/demo";
const LOCAL_FALLBACK: StreamingContent[] = [
  {
  id: FALLBACK_SENTINEL_ID,
    title: "Catalogue temporairement indisponible",
    type: "movie",
    platform: "(proxy)",
    releaseDate: new Date(2024,0,1),
    description: "Le service JustWatch ne répond pas (CORS ou réseau). Réessayez plus tard.",
    imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" },
    rating: "U",
    genres: ["doc"],
  }
];

const fetchContentFromAllProviders = async (
  filters: FetchFilters = {}
): Promise<StreamingContent[]> => {
  const url = WORKER_URL;

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
    // Tentative 1: POST application/json standard
    const attempt = async(contentType:string, rawBody:string) => {
      const controller = new AbortController();
      const t = setTimeout(()=> controller.abort(), FETCH_TIMEOUT_MS);
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(t);
      return resp;
    };

    let response: Response | null = null;
    let firstError: any = null;
    try {
      response = await attempt("application/json", body);
    } catch(e){
      firstError = e;
    }

    // Si échec réseau / CORS, retenter avec text/plain
    if(!response){
      try {
        response = await attempt("text/plain", body);
        console.warn('[JustWatch] Retraitement via text/plain fallback');
      } catch(e2){
        console.error('[JustWatch] Double échec (json & text/plain)', firstError, e2);
        return LOCAL_FALLBACK;
      }
    }

    if(!response.ok){
      console.error(`[JustWatch] HTTP ${response.status}`);
      return LOCAL_FALLBACK;
    }

    let data: any = null;
    try { data = await response.json(); }
    catch(parseErr){
      console.error('[JustWatch] Parse JSON échoué', parseErr);
      return LOCAL_FALLBACK;
    }
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
      } as StreamingContent;
    });
  } catch (err:any) {
    if(err?.name === 'AbortError'){
      console.error('[JustWatch] Timeout après', FETCH_TIMEOUT_MS, 'ms');
    } else {
      console.error('[JustWatch] Erreur réseau/CORS probable:', err);
    }
    return LOCAL_FALLBACK;
  }
};

export default fetchContentFromAllProviders;
export { platformMap, DEFAULT_PLATFORMS };
