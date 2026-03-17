import React, { useState, useEffect } from "react";
import type { MovieData } from "../types/MovieData";
import "./AdminDashboard.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawMovie {
  Rank: string;
  MovieName: string;
  ReleaseYear: string;
  EloRating: string;
  TimesCompeted: string;
  LetterboxdLink: string;
  PosterUrl: string;
}

interface MatchupMovie {
  MovieName: string;
  ReleaseYear: number;
  EloRating: number;
  TimesCompeted: number;
  LetterboxdLink: string;
  Rank: number;
  posterUrl?: string;
}

interface AdminDashboardProps {
  movies: MovieData[];
  onMoviesUpdated: (movies: MovieData[]) => void;
}

type Tab = "matchup" | "add";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchPoster(title: string, year: number): Promise<string> {
  try {
    const res = await fetch(
      `/api/tmdb?title=${encodeURIComponent(title)}&year=${year}`
    );
    const data = (await res.json()) as { posterUrl?: string };
    return data.posterUrl ?? "";
  } catch {
    return "";
  }
}

function rawToMatchup(raw: RawMovie): MatchupMovie {
  return {
    Rank: parseInt(raw.Rank, 10),
    MovieName: raw.MovieName,
    ReleaseYear: parseInt(raw.ReleaseYear, 10),
    EloRating: parseFloat(raw.EloRating),
    TimesCompeted: parseInt(raw.TimesCompeted, 10),
    LetterboxdLink: raw.LetterboxdLink,
  };
}

function rawToMovieData(raw: RawMovie): MovieData {
  return {
    rank: parseInt(raw.Rank, 10),
    title: raw.MovieName,
    year: parseInt(raw.ReleaseYear, 10),
    elo: parseFloat(raw.EloRating),
    timesCompeted: parseInt(raw.TimesCompeted, 10),
    letterboxd_url: raw.LetterboxdLink,
    posterUrl: raw.PosterUrl ?? "",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const AdminDashboard: React.FC<AdminDashboardProps> = ({
  movies,
  onMoviesUpdated,
}) => {
  // Auth
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");

  // Tab
  const [tab, setTab] = useState<Tab>("matchup");

  // Matchup state
  const [moviePool, setMoviePool] = useState<MatchupMovie[]>([]);
  const [player1, setPlayer1] = useState<MatchupMovie | null>(null);
  const [player2, setPlayer2] = useState<MatchupMovie | null>(null);
  const [matchupLoading, setMatchupLoading] = useState(false);
  const [matchupStatus, setMatchupStatus] = useState("");
  const [matchCount, setMatchCount] = useState(0);

  // Add movie state
  const [addTitle, setAddTitle] = useState("");
  const [addYear, setAddYear] = useState("");
  const [addLetterboxd, setAddLetterboxd] = useState("");
  const [addPreview, setAddPreview] = useState<{ posterUrl: string; title: string } | null>(null);
  const [addPreviewLoading, setAddPreviewLoading] = useState(false);
  const [addStatus, setAddStatus] = useState("");
  const [addError, setAddError] = useState("");

  // ── Auth ──────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // Verify by attempting a real API call that checks the password
    const res = await fetch("/api/movies");
    if (!res.ok) {
      setAuthError("Could not reach server.");
      return;
    }
    // Password is verified server-side on actual mutations;
    // here we just gate the UI with a quick smoke-test
    if (password.trim() === "") {
      setAuthError("Please enter a password.");
      return;
    }
    setAuthed(true);
    setAuthError("");
  };

  // ── Load matchup pool once authed ─────────────────────────

  useEffect(() => {
    if (!authed) return;
    if (movies.length === 0) return;

    const pool: MatchupMovie[] = movies.map((m) => ({
      Rank: m.rank,
      MovieName: m.title,
      ReleaseYear: m.year,
      EloRating: m.elo,
      TimesCompeted: m.timesCompeted,
      LetterboxdLink: m.letterboxd_url,
    }));
    setMoviePool(pool);
  }, [authed, movies]);

  // ── Request a new matchup ─────────────────────────────────

  const loadMatchup = async (pool: MatchupMovie[]) => {
    if (pool.length < 2) return;
    setMatchupLoading(true);
    setMatchupStatus("");

    try {
      const res = await fetch(
        `/api/update-rankings?movies=${encodeURIComponent(JSON.stringify(pool))}`
      );
      const data = (await res.json()) as {
        player1: RawMovie;
        player2: RawMovie;
      };

      const p1 = rawToMatchup(data.player1);
      const p2 = rawToMatchup(data.player2);

      // Fetch posters in parallel
      const [poster1, poster2] = await Promise.all([
        fetchPoster(p1.MovieName, p1.ReleaseYear),
        fetchPoster(p2.MovieName, p2.ReleaseYear),
      ]);

      setPlayer1({ ...p1, posterUrl: poster1 });
      setPlayer2({ ...p2, posterUrl: poster2 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMatchupStatus(`Error loading matchup: ${msg}`);
    } finally {
      setMatchupLoading(false);
    }
  };

  useEffect(() => {
    if (moviePool.length >= 2) {
      loadMatchup(moviePool);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moviePool]);

  // ── Record a match result ─────────────────────────────────

  const handlePick = async (winner: MatchupMovie, loser: MatchupMovie) => {
    setMatchupLoading(true);
    setMatchupStatus("Saving…");

    try {
      const res = await fetch("/api/update-rankings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          winnerName: winner.MovieName,
          loserName: loser.MovieName,
          movies: moviePool,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        updatedMovies?: RawMovie[];
        error?: string;
      };

      if (!res.ok || data.error) {
        setMatchupStatus(`Error: ${data.error ?? "Unknown error"}`);
        return;
      }

      setMatchupStatus(`✓ ${winner.MovieName} beat ${loser.MovieName}`);
      setMatchCount((c) => c + 1);

      // Update pool and parent with fresh rankings
      if (data.updatedMovies) {
        const newPool = data.updatedMovies.map(rawToMatchup);
        const newMovieData = data.updatedMovies.map(rawToMovieData);
        setMoviePool(newPool);
        onMoviesUpdated(newMovieData);
        // loadMatchup will fire via useEffect on moviePool change
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMatchupStatus(`Error: ${msg}`);
    } finally {
      setMatchupLoading(false);
    }
  };

  const handleSkip = () => {
    loadMatchup(moviePool);
    setMatchupStatus("Skipped.");
  };

  // ── TMDB preview for add-movie ────────────────────────────

  const handlePreview = async () => {
    if (!addTitle.trim()) return;
    setAddPreviewLoading(true);
    setAddPreview(null);
    setAddError("");

    const poster = await fetchPoster(addTitle, parseInt(addYear, 10));
    if (poster) {
      setAddPreview({ posterUrl: poster, title: addTitle });
    } else {
      setAddError("No poster found on TMDB. Check the title/year and try again.");
    }
    setAddPreviewLoading(false);
  };

  // ── Submit new movie ──────────────────────────────────────

  const handleAddMovie = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddStatus("");
    setAddError("");

    if (!addTitle || !addYear || !addLetterboxd) {
      setAddError("All fields are required.");
      return;
    }

    try {
      const res = await fetch("/api/add-movie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          movieName: addTitle,
          releaseYear: parseInt(addYear, 10),
          letterboxdLink: addLetterboxd,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        updatedMovies?: RawMovie[];
        error?: string;
      };

      if (!res.ok || data.error) {
        setAddError(data.error ?? "Unknown error");
        return;
      }

      setAddStatus(`✓ "${addTitle}" added successfully!`);
      setAddTitle("");
      setAddYear("");
      setAddLetterboxd("");
      setAddPreview(null);

      if (data.updatedMovies) {
        const newPool = data.updatedMovies.map(rawToMatchup);
        const newMovieData = data.updatedMovies.map(rawToMovieData);
        setMoviePool(newPool);
        onMoviesUpdated(newMovieData);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setAddError(msg);
    }
  };

  // ── Render: Login ─────────────────────────────────────────

  if (!authed) {
    return (
      <div className="admin-root">
        <div className="admin-login-card">
          <div className="admin-login-icon">🎬</div>
          <h1 className="admin-login-title">Admin Access</h1>
          <p className="admin-login-sub">Movie Rankings Dashboard</p>
          <form onSubmit={handleLogin} className="admin-login-form">
            <input
              type="password"
              className="admin-input"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {authError && <p className="admin-error">{authError}</p>}
            <button type="submit" className="admin-btn admin-btn--primary">
              Enter
            </button>
          </form>
          <a href="/" className="admin-back-link">← Back to rankings</a>
        </div>
      </div>
    );
  }

  // ── Render: Dashboard ─────────────────────────────────────

  return (
    <div className="admin-root">
      <div className="admin-dashboard">
        {/* Header */}
        <div className="admin-header">
          <div className="admin-header-left">
            <span className="admin-logo">🎬</span>
            <h1 className="admin-title">Rankings Admin</h1>
            {matchCount > 0 && (
              <span className="admin-match-count">{matchCount} match{matchCount !== 1 ? "es" : ""} today</span>
            )}
          </div>
          <div className="admin-header-right">
            <a href="/" className="admin-btn admin-btn--ghost">← Public site</a>
            <button
              className="admin-btn admin-btn--ghost"
              onClick={() => setAuthed(false)}
            >
              Log out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          <button
            className={`admin-tab${tab === "matchup" ? " admin-tab--active" : ""}`}
            onClick={() => setTab("matchup")}
          >
            ⚔️ Matchup
          </button>
          <button
            className={`admin-tab${tab === "add" ? " admin-tab--active" : ""}`}
            onClick={() => setTab("add")}
          >
            ➕ Add Movie
          </button>
        </div>

        {/* ── Matchup Tab ── */}
        {tab === "matchup" && (
          <div className="admin-panel">
            <p className="admin-panel-hint">
              Pick the better film. Rankings update in real time.
            </p>

            {matchupLoading && (
              <div className="admin-loading">Loading matchup…</div>
            )}

            {!matchupLoading && player1 && player2 && (
              <div className="matchup-arena">
                {/* Player 1 */}
                <button
                  className="matchup-card"
                  onClick={() => handlePick(player1, player2)}
                  disabled={matchupLoading}
                >
                  {player1.posterUrl ? (
                    <img src={player1.posterUrl} alt={player1.MovieName} className="matchup-poster" />
                  ) : (
                    <div className="matchup-poster-placeholder">{player1.MovieName}</div>
                  )}
                  <div className="matchup-card-info">
                    <span className="matchup-card-title">{player1.MovieName}</span>
                    <span className="matchup-card-year">{player1.ReleaseYear}</span>
                    <span className="matchup-card-elo">ELO {Math.round(player1.EloRating)}</span>
                  </div>
                  <div className="matchup-pick-overlay">Pick this one</div>
                </button>

                <div className="matchup-vs">VS</div>

                {/* Player 2 */}
                <button
                  className="matchup-card"
                  onClick={() => handlePick(player2, player1)}
                  disabled={matchupLoading}
                >
                  {player2.posterUrl ? (
                    <img src={player2.posterUrl} alt={player2.MovieName} className="matchup-poster" />
                  ) : (
                    <div className="matchup-poster-placeholder">{player2.MovieName}</div>
                  )}
                  <div className="matchup-card-info">
                    <span className="matchup-card-title">{player2.MovieName}</span>
                    <span className="matchup-card-year">{player2.ReleaseYear}</span>
                    <span className="matchup-card-elo">ELO {Math.round(player2.EloRating)}</span>
                  </div>
                  <div className="matchup-pick-overlay">Pick this one</div>
                </button>
              </div>
            )}

            <div className="matchup-actions">
              {matchupStatus && (
                <p className={`admin-status${matchupStatus.startsWith("Error") ? " admin-status--error" : ""}`}>
                  {matchupStatus}
                </p>
              )}
              <button
                className="admin-btn admin-btn--ghost"
                onClick={handleSkip}
                disabled={matchupLoading}
              >
                Skip this matchup →
              </button>
            </div>
          </div>
        )}

        {/* ── Add Movie Tab ── */}
        {tab === "add" && (
          <div className="admin-panel">
            <p className="admin-panel-hint">
              Search TMDB to confirm the film, then add it to the rankings.
            </p>

            <form onSubmit={handleAddMovie} className="add-movie-form">
              <div className="add-movie-row">
                <div className="add-movie-field">
                  <label className="admin-label">Movie Title</label>
                  <input
                    className="admin-input"
                    type="text"
                    placeholder="e.g. Parasite"
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                  />
                </div>
                <div className="add-movie-field add-movie-field--small">
                  <label className="admin-label">Year</label>
                  <input
                    className="admin-input"
                    type="number"
                    placeholder="e.g. 2019"
                    value={addYear}
                    onChange={(e) => setAddYear(e.target.value)}
                    min={1888}
                    max={new Date().getFullYear() + 1}
                  />
                </div>
              </div>

              <div className="add-movie-field">
                <label className="admin-label">Letterboxd URL</label>
                <input
                  className="admin-input"
                  type="url"
                  placeholder="https://letterboxd.com/film/parasite-2019/"
                  value={addLetterboxd}
                  onChange={(e) => setAddLetterboxd(e.target.value)}
                />
              </div>

              <div className="add-movie-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  onClick={handlePreview}
                  disabled={addPreviewLoading || !addTitle.trim()}
                >
                  {addPreviewLoading ? "Searching…" : "Preview on TMDB"}
                </button>

                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={!addPreview}
                >
                  Add to Rankings
                </button>
              </div>

              {addError && <p className="admin-error">{addError}</p>}
              {addStatus && <p className="admin-status">{addStatus}</p>}

              {/* TMDB Preview */}
              {addPreview && (
                <div className="add-movie-preview">
                  <img
                    src={addPreview.posterUrl}
                    alt={addPreview.title}
                    className="add-movie-preview-poster"
                  />
                  <div className="add-movie-preview-info">
                    <p className="add-movie-preview-title">{addPreview.title}</p>
                    {addYear && <p className="add-movie-preview-year">{addYear}</p>}
                    <p className="add-movie-preview-note">
                      Starting ELO: 1000
                    </p>
                  </div>
                </div>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;