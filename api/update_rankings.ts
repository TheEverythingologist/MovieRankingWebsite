import type { VercelRequest, VercelResponse } from "@vercel/node";

const ELO_K_FACTOR = 32;
const COMPETITOR_POOL_SIZE = parseInt(process.env.COMPETITOR_POOL_SIZE ?? "30", 10);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Movie {
  Rank: number;
  MovieName: string;
  ReleaseYear: number;
  EloRating: number;
  TimesCompeted: number;
  LetterboxdLink: string;
}

// ─── ELO Calculation ─────────────────────────────────────────────────────────

function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function updateElo(
  winnerRating: number,
  loserRating: number
): { newWinnerRating: number; newLoserRating: number } {
  const expectedWinner = expectedScore(winnerRating, loserRating);
  const expectedLoser = expectedScore(loserRating, winnerRating);

  let newWinnerRating = winnerRating + ELO_K_FACTOR * (1 - expectedWinner);
  let newLoserRating = loserRating + ELO_K_FACTOR * (0 - expectedLoser);

  // Mirror Python's floor-at-zero logic
  if (newWinnerRating < 0) {
    newWinnerRating = 0;
    newLoserRating = loserRating - winnerRating;
  } else if (newLoserRating < 0) {
    newLoserRating = 0;
    newWinnerRating = winnerRating - loserRating;
  }

  return {
    newWinnerRating: Math.round(newWinnerRating),
    newLoserRating: Math.round(newLoserRating),
  };
}

// ─── Matchup Selection (ported from Python) ───────────────────────────────────

function findClosestCompetitors(player: Movie, candidates: Movie[]): Movie[] {
  const sorted = [...candidates]
    .filter((p) => p.MovieName !== player.MovieName)
    .sort(
      (a, b) =>
        Math.abs(a.EloRating - player.EloRating) -
        Math.abs(b.EloRating - player.EloRating)
    );
  const n = Math.min(COMPETITOR_POOL_SIZE, sorted.length);
  return sorted.slice(0, n);
}

function getRandomCompetitors(movies: Movie[]): [Movie, Movie] {
  // Find the minimum competition count across all movies
  let minComps = Math.min(...movies.map((m) => m.TimesCompeted));

  // Build the initial pool of movies at the minimum competition count
  let pool = movies.filter((m) => m.TimesCompeted === minComps);

  let player1: Movie;
  let closestPlayers: Movie[];
  let newPlayer = false;

  if (pool.length < 10) {
    // Pop last from pool as player 1
    player1 = pool[pool.length - 1];
    pool = pool.slice(0, pool.length - 1);

    if (pool.length === 1) {
      // Only one candidate left — search across all movies
      closestPlayers = findClosestCompetitors(player1, movies);
      newPlayer = true;
    }

    // Expand pool until we have at least 10 candidates
    while (pool.length < 10) {
      minComps += 1;
      pool = [
        ...pool,
        ...movies.filter((m) => m.TimesCompeted === minComps),
      ];

      if (pool.length >= 10 && !newPlayer) {
        closestPlayers = findClosestCompetitors(player1, pool);
      }
    }
  } else {
    // Pool is large enough — pick player 1 randomly
    const idx = Math.floor(Math.random() * pool.length);
    player1 = pool[idx];
    pool = pool.filter((_, i) => i !== idx);
    closestPlayers = findClosestCompetitors(player1, pool);
  }

  // Pick player 2 randomly from the closest competitors
  const player2 =
    closestPlayers![Math.floor(Math.random() * closestPlayers!.length)];

  return [player1, player2];
}

// ─── CSV Serialization ────────────────────────────────────────────────────────

function moviesToCsv(movies: Movie[]): string {
  const headers =
    "Rank,MovieName,ReleaseYear,EloRating,TimesCompeted,LetterboxdLink";
  const rows = movies.map(
    (m) =>
      `${m.Rank},"${m.MovieName}",${m.ReleaseYear},${m.EloRating},${m.TimesCompeted},${m.LetterboxdLink}`
  );
  return [headers, ...rows].join("\n");
}

// ─── GitHub Helpers ───────────────────────────────────────────────────────────

async function getFileSha(
  owner: string,
  repo: string,
  path: string,
  token: string
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok)
    throw new Error(`Failed to get SHA for ${repo}/${path}: ${res.status}`);
  const json = await res.json();
  return json.sha;
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

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    // Return a suggested matchup pair (called when admin dashboard loads)
    const { movies } = req.query;
    if (!movies || typeof movies !== "string") {
      return res.status(400).json({ error: "movies query param required" });
    }
    try {
      const parsed: Movie[] = JSON.parse(movies);
      const [player1, player2] = getRandomCompetitors(parsed);
      return res.status(200).json({ player1, player2 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "POST") {
    // Record a match result and commit updated CSV to both repos
    const { password, winnerName, loserName, movies } = req.body;

    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!winnerName || !loserName || !movies) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const updatedMovies: Movie[] = movies.map((m: Movie) => ({ ...m }));
      const winner = updatedMovies.find((m) => m.MovieName === winnerName);
      const loser = updatedMovies.find((m) => m.MovieName === loserName);

      if (!winner || !loser) {
        return res
          .status(404)
          .json({ error: "Could not find winner or loser in movie list" });
      }

      const { newWinnerRating, newLoserRating } = updateElo(
        winner.EloRating,
        loser.EloRating
      );

      winner.EloRating = newWinnerRating;
      winner.TimesCompeted += 1;
      loser.EloRating = newLoserRating;
      loser.TimesCompeted += 1;

      // Re-sort by ELO descending and reassign ranks
      updatedMovies.sort((a, b) => b.EloRating - a.EloRating);
      updatedMovies.forEach((m, i) => {
        m.Rank = i + 1;
      });

      const csvContent = moviesToCsv(updatedMovies);
      const token = process.env.GITHUB_TOKEN!;
      const owner = process.env.GITHUB_OWNER!;
      const commitMessage = `Update rankings: ${winnerName} beat ${loserName}`;

      // Commit to data repo
      const dataSha = await getFileSha(
        owner,
        process.env.GITHUB_DATA_REPO!,
        process.env.GITHUB_DATA_PATH!,
        token
      );
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
      const frontendSha = await getFileSha(
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

      return res.status(200).json({ success: true, updatedMovies });
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Unknown error";
      return res.status(500).json({ error: message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}