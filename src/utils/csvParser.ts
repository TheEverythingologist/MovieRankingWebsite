import type { MovieData } from "../types/MovieData";

interface RawMovieRow {
  Rank: string;
  MovieName: string;
  ReleaseYear: string;
  EloRating: string;
  TimesCompeted: string;
  LetterboxdLink: string;
  PosterUrl: string;
  [key: string]: string;
}

// Parse raw CSV text into MovieData array
export function parseCSV(csv: string): MovieData[] {
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const cols =
      line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) ?? line.split(",");

    const row: RawMovieRow = {} as RawMovieRow;
    headers.forEach((h, i) => {
      row[h] = cols[i] ? cols[i].replace(/^"|"$/g, "").trim() : "";
    });

    return {
      rank: parseInt(row["Rank"], 10),
      title: row["MovieName"],
      year: parseInt(row["ReleaseYear"], 10),
      elo: parseFloat(row["EloRating"]),
      timesCompeted: parseInt(row["TimesCompeted"], 10),
      letterboxd_url: row["LetterboxdLink"],
      posterUrl: row["PosterUrl"] ?? "",
    };
  });
}

// Convert API response rows (already parsed objects) into MovieData array
export function parseAPIMovies(rows: RawMovieRow[]): MovieData[] {
  return rows.map((row) => ({
    rank: parseInt(row["Rank"], 10),
    title: row["MovieName"],
    year: parseInt(row["ReleaseYear"], 10),
    elo: parseFloat(row["EloRating"]),
    timesCompeted: parseInt(row["TimesCompeted"], 10),
    letterboxd_url: row["LetterboxdLink"],
    posterUrl: row["PosterUrl"] ?? "",
  }));
}