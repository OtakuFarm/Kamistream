// ─── Jikan (MyAnimeList) Types ────────────────────────────────────────────────

export interface JikanImage {
  image_url: string;
  small_image_url?: string;
  large_image_url: string;
}

export interface JikanImages {
  jpg: JikanImage;
  webp: JikanImage;
}

export interface JikanTrailer {
  youtube_id: string | null;
  url: string | null;
  images?: {
    image_url: string;
    maximum_image_url: string;
  };
}

export interface JikanGenre {
  mal_id: number;
  type: string;
  name: string;
}

export interface JikanAnime {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  images: JikanImages;
  trailer: JikanTrailer;
  synopsis: string | null;
  type: string;        // "TV" | "Movie" | "OVA" | "ONA" | "Special" | "Music"
  status: string;      // "Currently Airing" | "Finished Airing" | "Not yet aired"
  episodes: number | null;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  year: number | null;
  season: string | null;
  rating: string | null;
  genres: JikanGenre[];
  themes: JikanGenre[];
  demographics: JikanGenre[];
  duration: string | null;
  source: string | null;
  studios: JikanGenre[];
}

export interface JikanEpisode {
  mal_id: number;
  title: string;
  title_japanese: string | null;
  title_romanji: string | null;
  aired: string | null;
  score: number | null;
  filler: boolean;
  recap: boolean;
}

export interface JikanPaginatedResponse<T> {
  data: T[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    current_page: number;
  };
}

export interface JikanSingleResponse<T> {
  data: T;
}

export interface JikanCharacter {
  character: {
    mal_id: number;
    name: string;
    images: { jpg: { image_url: string }; webp?: { image_url: string } };
  };
  role: string;
  voice_actors: Array<{
    person: { name: string };
    language: string;
  }>;
}

export interface JikanRecommendation {
  entry: Pick<JikanAnime, 'mal_id' | 'title' | 'images'>;
  votes: number;
}

// ─── AniList Types ────────────────────────────────────────────────────────────

export interface AniListNextAiring {
  episode: number;
  airingAt: number;
  timeUntilAiring: number;
}

export interface AniListMedia {
  id: number;
  idMal: number | null;
  title: { romaji: string; english: string | null };
  coverImage: { large: string };
  format: string;
  episodes: number | null;
  averageScore: number | null;
  status: string;
}

export interface AiringScheduleItem {
  airingAt: number;
  episode: number;
  timeUntilAiring: number;
  media: AniListMedia;
}

// ─── Supabase / App Types ─────────────────────────────────────────────────────

export interface EmbedSource {
  source_name: string;
  embed_url: string;
  language: 'sub' | 'dub';
  quality: string;
}
