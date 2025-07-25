/*
import { StreamingContent, Genre } from "../pages/CatalogPage";

const API_KEY =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlYzIzYTliODNkYjNhOWY1MzQ3YTc1ODg0NTk4YWViYyIsIm5iZiI6MTc0OTQ2MzQzNC43MjcsInN1YiI6IjY4NDZiMThhZGU5OWU4MGY2ZGZkNWU5MyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.g8zHnSfR7jc_HtfRpyxlT5LijB5JSQMpYppYdQ3ouxY";
const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

export interface TMDBMovie {
  id: number;
  title: string;
  name?: string;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string;
  genre_ids?: number[];
}

export interface TMDBCreditsCast {
  id: number;
  name: string;
  character?: string;
}

export interface TMDBCrew {
  id: number;
  job: string;
  name: string;
}

export interface TMDBDetails {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  genres: { id: number; name: string }[];
  credits: {
    cast: TMDBCreditsCast[];
    crew: TMDBCrew[];
  };
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

export const getDetails = async (
  id: number,
  type: "movie" | "tv"
): Promise<TMDBDetails | null> => {
  try {
    const res = await fetch(
      `${BASE_URL}/${type}/${id}?language=fr-FR&append_to_response=credits`,
      { headers }
    );
    if (!res.ok) throw new Error(`Erreur TMDB: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("Erreur getDetails TMDB:", err);
    return null;
  }
};

export const searchMovies = async (query: string): Promise<TMDBMovie[]> => {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `${BASE_URL}/search/movie?language=fr-FR&query=${encodeURIComponent(
        query
      )}`,
      { headers }
    );
    if (!res.ok) throw new Error(`Erreur TMDB: ${res.status}`);
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.error("Erreur searchMovies TMDB:", err);
    return [];
  }
};

export const searchTV = async (query: string): Promise<TMDBMovie[]> => {
  if (!query.trim()) return [];
  try {
    const res = await fetch(
      `${BASE_URL}/search/tv?language=fr-FR&query=${encodeURIComponent(query)}`,
      { headers }
    );
    if (!res.ok) throw new Error(`Erreur TMDB TV: ${res.status}`);
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.error("Erreur searchTV TMDB:", err);
    return [];
  }
};

export const getWatchProviders = async (
  id: number,
  type: "movie" | "tv"
): Promise<string[]> => {
  try {
    const res = await fetch(`${BASE_URL}/${type}/${id}/watch/providers`, {
      headers,
    });
    if (!res.ok) throw new Error(`Erreur TMDB Providers: ${res.status}`);
    const data = await res.json();
    const frProviders = data.results?.FR?.flatrate || [];
    return frProviders.map((p: any) => p.provider_name);
  } catch (err) {
    console.error("Erreur getWatchProviders TMDB:", err);
    return [];
  }
};

export const getImageUrl = (path: string): string =>
  path ? `${IMAGE_BASE}${path}` : "";

export const getGenres = async (type: "movie" | "tv"): Promise<Genre[]> => {
  try {
    const res = await fetch(`${BASE_URL}/genre/${type}/list?language=fr-FR`, {
      headers,
    });
    if (!res.ok) throw new Error(`Erreur TMDB: ${res.status}`);
    const data = await res.json();
    return data.genres;
  } catch (err) {
    console.error("Erreur getGenres TMDB:", err);
    return [];
  }
};

export const discoverByGenres = async (
  genreIds: number[],
  type: "movie" | "tv"
): Promise<TMDBMovie[]> => {
  try {
    const res = await fetch(
      `${BASE_URL}/discover/${type}?with_genres=${genreIds.join(
        ","
      )}&language=fr-FR&sort_by=popularity.desc`,
      { headers }
    );
    if (!res.ok) throw new Error(`Erreur TMDB: ${res.status}`);
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.error("Erreur discoverByGenres TMDB:", err);
    return [];
  }
};

export const mapTMDBMoviesToStreamingContent = (
  movies: TMDBMovie[],
  type: "movie" | "series",
  genres: Genre[]
): StreamingContent[] =>
  movies.map((movie) => ({
    id: movie.id.toString(),
    title: type === "movie" ? movie.title : movie.name || "",
    type,
    platform: "inconnu",
    releaseDate: new Date(
      movie.release_date || movie.first_air_date || new Date().toISOString()
    ),
    description: movie.overview,
    imageUrl: getImageUrl(movie.poster_path),
    genres:
      movie.genre_ids
        ?.map((id) => genres.find((g) => g.id === id)?.name)
        .filter((name): name is string => !!name) || [],
  }));
*/
