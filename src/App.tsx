import React, { useEffect, useState } from "react";
import MovieList from "./components/MovieList";
import AdminDashboard from "./components/AdminDashboard";
import { parseAPIMovies } from "./utils/csvParser";
import type { MovieData } from "./types/MovieData";

type RawMovieRow = {
  Rank: string;
  MovieName: string;
  ReleaseYear: string;
  EloRating: string;
  TimesCompeted: string;
  LetterboxdLink: string;
  PosterUrl: string;
};

const isAdminRoute =
  window.location.pathname === "/admin" ||
  window.location.hash === "#/admin";

const App: React.FC = () => {
  const [movies, setMovies] = useState<MovieData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const res = await fetch("/api/movies");
        if (!res.ok) throw new Error(`Failed to fetch movies: ${res.status}`);
        const data = (await res.json()) as { movies: RawMovieRow[] };
        setMovies(parseAPIMovies(data.movies));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchMovies();
  }, []);

  if (isAdminRoute) {
    return <AdminDashboard movies={movies} onMoviesUpdated={setMovies} />;
  }

  if (loading) {
    return (
      <div
        style={{
          background: "#120022",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: "1.2rem",
          fontFamily: "sans-serif",
        }}
      >
        Loading rankings…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          background: "#120022",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ff4d4d",
          fontSize: "1.2rem",
          fontFamily: "sans-serif",
        }}
      >
        Error: {error}
      </div>
    );
  }

  return (
    <div style={{ background: "#120022", minHeight: "100vh" }}>
      <MovieList movies={movies} />
    </div>
  );
};

export default App;