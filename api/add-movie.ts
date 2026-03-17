import type { VercelRequest, VercelResponse } from "@vercel/node";

interface Movie {
  Rank: number;
  MovieName: string;
  ReleaseYear: number;
  EloRating: number;
  TimesCompeted: number;
  LetterboxdLink: string;
  PosterUrl: string;
}

interface GitHubFileResponse {
  content: string;
  sha: string;
}

const DEFAULT_ELO = 1000;

function moviesToCsv(movies: Movie[]): string {
  const headers =
    "Rank,MovieName,ReleaseYear,EloRating,TimesCompeted,LetterboxdLink,PosterUrl";
  const rows = movies.map(
    (m) =>
      `${m.Rank},"${m.MovieName}",${m.ReleaseYear},${m.EloRating},${m.TimesCompeted},${m.LetterboxdLink},${m.PosterUrl}`
  );
  return [headers, ...rows].join("\n");
}

async function getFileData(
  owner: string,
  repo: string,
  path: string,
  token: string
): Promise<{ csv: string; sha: string }> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok)
    throw new Error(`Failed to get file ${repo}/${path}: ${res.status}`);
  const json = (await res.json()) as GitHubFileResponse;
  const csv = Buffer.from(json.content, "base64").toString("utf-8");
  return { csv, sha: json.sha };
}

async function commitCsv(
  owner: string,
  repo: string,
  path: string,
  csvContent: string,
  sha: string,
  token: string,
  message: string
): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const encoded = Buffer.from(csvContent).toString("base64");

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, content: encoded, sha }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to commit to ${repo}/${path}: ${err}`);
  }
}

function parseCSVToMovies(csv: string): Movie[] {
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols =
      line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) ?? line.split(",");
    const clean = (i: number) =>
      cols[i] ? cols[i].replace(/^"|"$/g, "").trim() : "";
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = clean(i); });
    return {
      Rank: parseInt(row["Rank"], 10),
      MovieName: row["MovieName"],
      ReleaseYear: parseInt(row["ReleaseYear"], 10),
      EloRating: parseFloat(row["EloRating"]),
      TimesCompeted: parseInt(row["TimesCompeted"], 10),
      LetterboxdLink: row["LetterboxdLink"],
      PosterUrl: row["PosterUrl"] ?? "",
    };
  });
}

async function fetchPosterUrl(title: string, year: number): Promise<string> {
  const query = encodeURIComponent(title);
  const url = `https://api.themoviedb.org/3/search/movie?query=${query}&year=${year}&include_adult=false&language=en-US&page=1`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      results: { poster_path: string | null }[];
    };
    const posterPath = data.results?.[0]?.poster_path;
    return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : "";
  } catch {
    return "";
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { password, movieName, releaseYear, letterboxdLink } =
    req.body as {
      password: string;
      movieName: string;
      releaseYear: number;
      letterboxdLink: string;
    };

  if (password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!movieName || !releaseYear || !letterboxdLink) {
    res.status(400).json({ error: "movieName, releaseYear and letterboxdLink are required" });
    return;
  }

  try {
    const token = process.env.GITHUB_TOKEN!;
    const owner = process.env.GITHUB_OWNER!;

    // Read current CSV from data repo
    const { csv, sha: dataSha } = await getFileData(
      owner,
      process.env.GITHUB_DATA_REPO!,
      process.env.GITHUB_DATA_PATH!,
      token
    );

    const movies = parseCSVToMovies(csv);

    // Check for duplicate
    const duplicate = movies.find(
      (m) =>
        m.MovieName.toLowerCase() === movieName.toLowerCase() &&
        m.ReleaseYear === releaseYear
    );
    if (duplicate) {
      res.status(409).json({ error: `"${movieName}" (${releaseYear}) already exists at rank ${duplicate.Rank}` });
      return;
    }

    // Fetch poster from TMDB
    const posterUrl = await fetchPosterUrl(movieName, releaseYear);

    // Append new movie
    const newMovie: Movie = {
      Rank: movies.length + 1,
      MovieName: movieName,
      ReleaseYear: releaseYear,
      EloRating: DEFAULT_ELO,
      TimesCompeted: 0,
      LetterboxdLink: letterboxdLink,
      PosterUrl: posterUrl,
    };

    movies.push(newMovie);

    // Re-sort by ELO and reassign ranks
    movies.sort((a, b) => b.EloRating - a.EloRating);
    movies.forEach((m, i) => {
      m.Rank = i + 1;
    });

    const csvContent = moviesToCsv(movies);
    const commitMessage = `Add movie: ${movieName} (${releaseYear})`;

    // Commit to data repo
    await commitCsv(
      owner,
      process.env.GITHUB_DATA_REPO!,
      process.env.GITHUB_DATA_PATH!,
      csvContent,
      dataSha,
      token,
      commitMessage
    );

    // Commit to frontend repo
    const { sha: frontendSha } = await getFileData(
      owner,
      process.env.GITHUB_FRONTEND_REPO!,
      process.env.GITHUB_FRONTEND_PATH!,
      token
    );
    await commitCsv(
      owner,
      process.env.GITHUB_FRONTEND_REPO!,
      process.env.GITHUB_FRONTEND_PATH!,
      csvContent,
      frontendSha,
      token,
      commitMessage
    );

    res.status(200).json({ success: true, movie: newMovie, updatedMovies: movies });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}