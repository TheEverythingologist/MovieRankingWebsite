import type { VercelRequest, VercelResponse } from "@vercel/node";

interface TMDBSearchResult {
  id: number;
  poster_path: string | null;
}

interface TMDBSearchResponse {
  results: TMDBSearchResult[];
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { title, year } = req.query;

  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }

  try {
    const query = encodeURIComponent(title);
    const yearParam =
      year && typeof year === "string" ? `&year=${year}` : "";
    const url = `https://api.themoviedb.org/3/search/movie?query=${query}${yearParam}&include_adult=false&language=en-US&page=1`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data = (await response.json()) as TMDBSearchResponse;
    const movie = data.results?.[0];

    if (!movie?.poster_path) {
      res.status(404).json({ error: "Poster not found" });
      return;
    }

    const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
    res.status(200).json({ posterUrl, tmdbId: movie.id });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}