/**
 * One-time backfill script — populates PosterUrl for all existing movies in the CSV.
 *
 * Usage:
 *   npx tsx scripts/backfill-posters.ts
 *
 * Requires: TMDB_API_KEY, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_DATA_REPO,
 *           GITHUB_DATA_PATH, GITHUB_FRONTEND_REPO, GITHUB_FRONTEND_PATH
 *           all present in .env.local
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const GITHUB_OWNER = process.env.GITHUB_OWNER!;
const GITHUB_DATA_REPO = process.env.GITHUB_DATA_REPO!;
const GITHUB_DATA_PATH = process.env.GITHUB_DATA_PATH!;
const GITHUB_FRONTEND_REPO = process.env.GITHUB_FRONTEND_REPO!;
const GITHUB_FRONTEND_PATH = process.env.GITHUB_FRONTEND_PATH!;

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

function parseCSV(csv: string): Movie[] {
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

function moviesToCsv(movies: Movie[]): string {
  const headers =
    "Rank,MovieName,ReleaseYear,EloRating,TimesCompeted,LetterboxdLink,PosterUrl";
  const rows = movies.map(
    (m) =>
      `${m.Rank},"${m.MovieName}",${m.ReleaseYear},${m.EloRating},${m.TimesCompeted},${m.LetterboxdLink},${m.PosterUrl}`
  );
  return [headers, ...rows].join("\n");
}

// ─── GitHub Helpers ───────────────────────────────────────────────────────────

async function getFileData(
  repo: string,
  path: string
): Promise<{ csv: string; sha: string }> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`Failed to get ${repo}/${path}: ${res.status}`);
  const json = (await res.json()) as GitHubFileResponse;
  const csv = Buffer.from(json.content, "base64").toString("utf-8");
  return { csv, sha: json.sha };
}

async function commitCsv(
  repo: string,
  path: string,
  csvContent: string,
  sha: string,
  message: string
): Promise<void> {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${repo}/contents/${path}`;
  const encoded = Buffer.from(csvContent).toString("base64");
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
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

// ─── TMDB Fetch ───────────────────────────────────────────────────────────────

async function fetchPosterUrl(
  title: string,
  year: number
): Promise<string> {
  const query = encodeURIComponent(title);
  const url = `https://api.themoviedb.org/3/search/movie?query=${query}&year=${year}&include_adult=false&language=en-US&page=1`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TMDB_API_KEY}`,
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("📥 Fetching CSV from GitHub...");
  const { csv, sha: dataSha } = await getFileData(
    GITHUB_DATA_REPO,
    GITHUB_DATA_PATH
  );

  const movies = parseCSV(csv);
  const missing = movies.filter((m) => !m.PosterUrl);
  console.log(
    `🎬 ${movies.length} movies total, ${missing.length} missing posters.`
  );

  if (missing.length === 0) {
    console.log("✅ All posters already populated. Nothing to do.");
    return;
  }

  // Fetch posters with a small delay to avoid rate limiting
  for (let i = 0; i < movies.length; i++) {
    const movie = movies[i];
    if (movie.PosterUrl) {
      console.log(`  [${i + 1}/${movies.length}] ✓ ${movie.MovieName} (cached)`);
      continue;
    }

    const posterUrl = await fetchPosterUrl(movie.MovieName, movie.ReleaseYear);
    movie.PosterUrl = posterUrl;

    if (posterUrl) {
      console.log(`  [${i + 1}/${movies.length}] ✓ ${movie.MovieName}`);
    } else {
      console.log(`  [${i + 1}/${movies.length}] ✗ ${movie.MovieName} — not found on TMDB`);
    }

    // 250ms delay between requests to be respectful of TMDB rate limits
    await new Promise((r) => setTimeout(r, 250));
  }

  const csvContent = moviesToCsv(movies);
  const commitMessage = "Backfill poster URLs for all movies";

  console.log("\n📤 Committing to data repo...");
  await commitCsv(
    GITHUB_DATA_REPO,
    GITHUB_DATA_PATH,
    csvContent,
    dataSha,
    commitMessage
  );

  console.log("📤 Committing to frontend repo...");
  const { sha: frontendSha } = await getFileData(
    GITHUB_FRONTEND_REPO,
    GITHUB_FRONTEND_PATH
  );
  await commitCsv(
    GITHUB_FRONTEND_REPO,
    GITHUB_FRONTEND_PATH,
    csvContent,
    frontendSha,
    commitMessage
  );

  console.log("\n✅ Done! Poster URLs written to both repos.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});