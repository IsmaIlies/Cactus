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
// Cloud Function proxy endpoints (dev via Vite proxy, prod absolute as fallback)
const WORKER_ENDPOINTS = [
  "/api/justwatch", // relative path (proxied locally or rewritten in hosting)
  "https://cactus-tech.fr/api/justwatch", // absolute prod fallback if local proxy fails
  "https://europe-west9-cactus-mm.cloudfunctions.net/justwatchProxy", // direct CF URL to bypass hosting rewrites
];

// --- TMDB fallback (client-side, no proxy) ---
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
// Clé API en Bearer déjà présente dans le repo (tmdb.ts). Utilisée ici uniquement en fallback.
const TMDB_BEARER = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlYzIzYTliODNkYjNhOWY1MzQ3YTc1ODg0NTk4YWViYyIsIm5iZiI6MTc0OTQ2MzQzNC43MjcsInN1YiI6IjY4NDZiMThhZGU5OWU4MGY2ZGZkNWU5MyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.g8zHnSfR7jc_HtfRpyxlT5LijB5JSQMpYppYdQ3ouxY";
const TMDB_HEADERS = { Authorization: `Bearer ${TMDB_BEARER}`, "Content-Type": "application/json" } as const;

async function tmdbJson(path: string) {
  const url = `${TMDB_BASE}${path}`;
  const resp = await fetch(url, { headers: TMDB_HEADERS });
  if (!resp.ok) throw new Error(`TMDB ${resp.status}`);
  return resp.json();
}

function tmdbPosterUrl(path?: string | null) {
  if (!path) return { avif: "", webp: "", jpeg: "", fallback: "" };
  const full = `${TMDB_IMAGE_BASE}${path}`;
  return { avif: "", webp: "", jpeg: full, fallback: full };
}

async function fetchFromTMDB(filters: FetchFilters = {}): Promise<StreamingContent[]> {
  const lang = "fr-FR";
  const results: StreamingContent[] = [];
  const wantMovies = filters.type !== "series"; // all or movie
  const wantTV = filters.type !== "movie";     // all or series

  try {
    if (filters.query && filters.query.trim()) {
      const q = encodeURIComponent(filters.query.trim());
      if (wantMovies) {
        const data = await tmdbJson(`/search/movie?language=${lang}&query=${q}`);
        for (const m of (data.results || [])) {
          results.push({
            id: `movie/${m.id}`,
            title: m.title || "",
            type: "movie",
            platform: "TMDB",
            releaseDate: new Date(m.release_date || Date.now()),
            description: m.overview || "",
            imageUrl: tmdbPosterUrl(m.poster_path),
            genres: [],
          });
        }
      }
      if (wantTV) {
        const data = await tmdbJson(`/search/tv?language=${lang}&query=${q}`);
        for (const t of (data.results || [])) {
          results.push({
            id: `series/${t.id}`,
            title: t.name || "",
            type: "series",
            platform: "TMDB",
            releaseDate: new Date(t.first_air_date || Date.now()),
            description: t.overview || "",
            imageUrl: tmdbPosterUrl(t.poster_path),
            genres: [],
          });
        }
      }
    } else {
      if (wantMovies) {
        const data = await tmdbJson(`/discover/movie?language=${lang}&sort_by=popularity.desc`);
        for (const m of (data.results || [])) {
          results.push({
            id: `movie/${m.id}`,
            title: m.title || "",
            type: "movie",
            platform: "TMDB",
            releaseDate: new Date(m.release_date || Date.now()),
            description: m.overview || "",
            imageUrl: tmdbPosterUrl(m.poster_path),
            genres: [],
          });
        }
      }
      if (wantTV) {
        const data = await tmdbJson(`/discover/tv?language=${lang}&sort_by=popularity.desc`);
        for (const t of (data.results || [])) {
          results.push({
            id: `series/${t.id}`,
            title: t.name || "",
            type: "series",
            platform: "TMDB",
            releaseDate: new Date(t.first_air_date || Date.now()),
            description: t.overview || "",
            imageUrl: tmdbPosterUrl(t.poster_path),
            genres: [],
          });
        }
      }
    }
  } catch (e) {
    console.warn('[TMDB] Fallback échoué:', e);
  }

  // Limite et tri léger
  return results.slice(0, 120);
}

// Jeu de données fallback ultra minimal si le proxy est down / CORS
export const FALLBACK_SENTINEL_ID = "fallback/demo";
// Jeu de données démo pour garder une UI utile si le proxy est KO
const LOCAL_FALLBACK: StreamingContent[] = [
  { id: FALLBACK_SENTINEL_ID, title: "Catalogue temporairement indisponible", type: "movie", platform: "(proxy)", releaseDate: new Date(2024,0,1), description: "Le service JustWatch ne répond pas (CORS ou réseau). Réessayez plus tard.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "U", genres: ["doc"] },
  { id: "demo/1", title: "Démo – Thriller Urbain", type: "movie", platform: platformMap.dnp, releaseDate: new Date(2023,5,1), description: "Un enquêteur traque un mystère au cœur de la ville.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "12", genres: ["trl","crm"] },
  { id: "demo/2", title: "Démo – Aventure Galactique", type: "movie", platform: platformMap.nfx, releaseDate: new Date(2022,8,12), description: "Un équipage explore les confins de l’espace.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "10", genres: ["scf","act"] },
  { id: "demo/3", title: "Démo – Série Dramatique S1", type: "series", platform: platformMap.prv, releaseDate: new Date(2021,2,20), description: "Chronique familiale poignante.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "12", genres: ["drm"] },
  { id: "demo/4", title: "Démo – Comédie du Soir", type: "movie", platform: platformMap.atp, releaseDate: new Date(2020,10,3), description: "Rires garantis en famille.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "U", genres: ["cmy"] },
  { id: "demo/5", title: "Démo – Documentaire Nature", type: "series", platform: platformMap.pmp, releaseDate: new Date(2019,3,15), description: "Un voyage au cœur des forêts.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "U", genres: ["doc"] },
  { id: "demo/6", title: "Démo – Horreur Nocturne", type: "movie", platform: platformMap.mxx, releaseDate: new Date(2018,9,31), description: "Frissons garantis.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "16", genres: ["hrr"] },
  { id: "demo/7", title: "Démo – Western Moderne", type: "movie", platform: platformMap.cpd, releaseDate: new Date(2017,6,22), description: "Duels et horizon rouge.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "12", genres: ["wsn","act"] },
  { id: "demo/8", title: "Démo – Sport & Esprit", type: "series", platform: platformMap.cns, releaseDate: new Date(2024,4,10), description: "Le mental des champions.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "U", genres: ["spt","doc"] },
  { id: "demo/9", title: "Démo – Histoire d’Europe", type: "movie", platform: platformMap.aoc, releaseDate: new Date(2016,1,14), description: "Regards sur le passé européen.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "10", genres: ["hst","eur"] },
  { id: "demo/10", title: "Démo – Fantastique Urbain", type: "series", platform: platformMap.ima, releaseDate: new Date(2023,11,5), description: "Le magique dans le quotidien.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "12", genres: ["fnt","drm"] },
  { id: "demo/11", title: "Démo – Science & Futur", type: "movie", platform: platformMap.prv, releaseDate: new Date(2022,0,9), description: "Entre IA et nouvelles frontières.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "12", genres: ["scf"] },
  { id: "demo/12", title: "Démo – Animation Familiale", type: "movie", platform: platformMap.dnp, releaseDate: new Date(2021,7,18), description: "Amitié, humour et couleurs.", imageUrl: { avif: "", webp: "", jpeg: "", fallback: "" }, rating: "U", genres: ["ani","cmy"] },
];

const fetchContentFromAllProviders = async (
  filters: FetchFilters = {}
): Promise<StreamingContent[]> => {
  // Essayer en cascade les endpoints connus
  const endpoints = WORKER_ENDPOINTS;

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
    // Helper pour tenter un POST avec timeout
    const attempt = async (endpoint: string, contentType: string, rawBody: string) => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: rawBody,
          signal: controller.signal,
        });
        return resp;
      } finally {
        clearTimeout(t);
      }
    };

    let response: Response | null = null;
    let firstError: any = null;

    // Boucle endpoints (relative puis absolu prod)
    for (const endpoint of endpoints) {
      try {
        // 1) JSON
        response = await attempt(endpoint, "application/json", body);
      } catch (e) {
        firstError = e;
        response = null;
      }
      // 2) text/plain si JSON échoue (CORS/CF)
      if (!response) {
        try {
          response = await attempt(endpoint, "text/plain", body);
          console.warn('[JustWatch] Retraitement via text/plain fallback sur', endpoint);
        } catch (e2) {
          console.warn('[JustWatch] Échec endpoint', endpoint, e2);
          response = null;
        }
      }
      if (response) {
        // Si on a une réponse (même 5xx), on sort de la boucle pour la traiter
        break;
      }
    }

    if (!response) {
      console.error('[JustWatch] Échec réseau/CORS sur tous les endpoints', firstError);
      const alt = await fetchFromTMDB(filters);
      return alt.length ? alt : LOCAL_FALLBACK;
    }

    if (!response.ok) {
      console.error(`[JustWatch] HTTP ${response.status}`);
      const alt = await fetchFromTMDB(filters);
      return alt.length ? alt : LOCAL_FALLBACK;
    }

    let data: any = null;
    try { data = await response.json(); }
    catch (parseErr) {
      console.error('[JustWatch] Parse JSON échoué', parseErr);
      const alt = await fetchFromTMDB(filters);
      return alt.length ? alt : LOCAL_FALLBACK;
    }
    if (data?.errors && Array.isArray(data.errors) && data.errors.length) {
      console.error('[JustWatch] GraphQL errors', data.errors);
      const alt = await fetchFromTMDB(filters);
      return alt.length ? alt : LOCAL_FALLBACK;
    }
    if (!data?.data?.popularTitles?.edges) return [];

    const items: StreamingContent[] = data.data.popularTitles.edges.map((edge: any) => {
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
    // Filtre post-traitement sur l'année si demandé (sécurité)
    const minY = filters.minYear ?? 2015;
    const maxY = filters.maxYear ?? 2025;
    return items.filter(it => {
      const y = it.releaseDate?.getFullYear?.() ?? 0;
      return y >= minY && y <= maxY;
    });
  } catch (err:any) {
    if(err?.name === 'AbortError'){
      console.error('[JustWatch] Timeout après', FETCH_TIMEOUT_MS, 'ms');
    } else {
      console.error('[JustWatch] Erreur réseau/CORS probable:', err);
    }
    const alt = await fetchFromTMDB(filters);
    return alt.length ? alt : LOCAL_FALLBACK;
  }
};

export default fetchContentFromAllProviders;
export { platformMap, DEFAULT_PLATFORMS };
