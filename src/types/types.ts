// types.ts

export type Message = {
  from: "IA" | "Client";
  text: string;
};

export interface CallData {
  clientInfo: {
    hasChildren: boolean;
    hasTeens: boolean;
  };
  preferences: {
    genres: string[];
    sports: string[];
    watchingFrequency: string;
    deviceUsage?: string;
    favoriteFilm?: string;
    favoriteActor?: string;
    favoriteSeries?: string;
    favoriteFilmGenres?: string[];
    favoriteSeriesGenres?: string[];
  };
  notes: string;
  offerScript?: string;
  messages?: Message[];
  objections?: string[];
}
