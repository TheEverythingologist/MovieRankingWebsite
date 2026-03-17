import React, { useState, useEffect, useRef, useCallback } from "react";
import type { MovieData } from "../types/MovieData";
import "./MovieList.css";

interface MovieListProps {
  movies: MovieData[];
}

type SortKey = "rank" | "title" | "year" | "elo";

const POSTER_CACHE: Record<string, string> = {};
const CARD_HEIGHT = 320; // px — approximate rendered card height for virtualization
const OVERSCAN = 5;      // extra cards to render above/below viewport

function usePoster(title: string, year: number, storedUrl: string): string {
  const key = `${title}__${year}`;
  const [url, setUrl] = useState<string>(storedUrl || POSTER_CACHE[key] || "");

  useEffect(() => {
    // If we already have a stored URL, use it — no fetch needed
    if (storedUrl) {
      setUrl(storedUrl);
      return;
    }
    if (POSTER_CACHE[key]) {
      setUrl(POSTER_CACHE[key]);
      return;
    }
    // Fallback: fetch from TMDB
    let cancelled = false;
    fetch(`/api/tmdb?title=${encodeURIComponent(title)}&year=${year}`)
      .then((r) => r.json())
      .then((data: { posterUrl?: string }) => {
        if (!cancelled && data.posterUrl) {
          POSTER_CACHE[key] = data.posterUrl;
          setUrl(data.posterUrl);
        }
      })
      .catch(() => {/* silently fail — no poster */});
    return () => { cancelled = true; };
  }, [key, title, year, storedUrl]);

  return url;
}

// Individual card with its own poster fetch
const MovieCard: React.FC<{ movie: MovieData }> = ({ movie }) => {
  const posterUrl = usePoster(movie.title, movie.year, movie.posterUrl);

  return (
    <div className="movie-card">
      <div className="ranking-badge">#{movie.rank}</div>
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={movie.title}
          className="movie-poster"
          loading="lazy"
        />
      ) : (
        <div className="movie-poster-placeholder">
          <span>{movie.title}</span>
        </div>
      )}
      <div className="movie-info">
        <h2>{movie.title}</h2>
        <p className="movie-year">{movie.year}</p>
        <p className="movie-elo">ELO: {Math.round(movie.elo)}</p>
      </div>
    </div>
  );
};

const MovieList: React.FC<MovieListProps> = ({ movies }) => {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure container width to calculate columns
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    setScrollTop(containerRef.current?.scrollTop ?? 0);
  }, []);

  // Filter
  const filtered = movies.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase())
  );

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "rank") cmp = a.rank - b.rank;
    else if (sortKey === "title") cmp = a.title.localeCompare(b.title);
    else if (sortKey === "year") cmp = a.year - b.year;
    else if (sortKey === "elo") cmp = b.elo - a.elo;
    return sortAsc ? cmp : -cmp;
  });

  // Virtualisation
  const CARD_MIN_WIDTH = 220;
  const GAP = 24;
  const PADDING = 24;
  const cols = containerWidth
    ? Math.max(1, Math.floor((containerWidth - PADDING * 2 + GAP) / (CARD_MIN_WIDTH + GAP)))
    : 1;
  const rowCount = Math.ceil(sorted.length / cols);
  const totalHeight = rowCount * (CARD_HEIGHT + GAP);
  const viewportHeight =
    containerRef.current?.clientHeight ?? window.innerHeight;

  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / (CARD_HEIGHT + GAP)) - OVERSCAN);
  const lastVisibleRow = Math.min(
    rowCount - 1,
    Math.ceil((scrollTop + viewportHeight) / (CARD_HEIGHT + GAP)) + OVERSCAN
  );

  const visibleMovies = sorted.slice(
    firstVisibleRow * cols,
    (lastVisibleRow + 1) * cols
  );
  const offsetY = firstVisibleRow * (CARD_HEIGHT + GAP);

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sortLabel = (key: SortKey, label: string) => {
    const active = sortKey === key;
    const arrow = active ? (sortAsc ? " ↑" : " ↓") : "";
    return (
      <button
        className={`sort-btn${active ? " sort-btn--active" : ""}`}
        onClick={() => handleSortClick(key)}
      >
        {label}{arrow}
      </button>
    );
  };

  return (
    <div className="movie-list-root">
      {/* Header / Controls */}
      <div className="movie-list-header">
        <h1 className="movie-list-title">🎬 Movie Rankings</h1>
        <div className="movie-list-controls">
          <input
            className="search-input"
            type="text"
            placeholder="Search movies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="sort-controls">
            <span className="sort-label">Sort:</span>
            {sortLabel("rank", "Rank")}
            {sortLabel("title", "Title")}
            {sortLabel("year", "Year")}
            {sortLabel("elo", "ELO")}
          </div>
        </div>
        <p className="movie-count">
          {filtered.length} of {movies.length} movies
        </p>
      </div>

      {/* Virtualised Grid */}
      <div
        className="movie-grid-viewport"
        ref={containerRef}
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div
            className="movie-grid"
            style={{
              position: "absolute",
              top: offsetY,
              left: 0,
              right: 0,
            }}
          >
            {visibleMovies.map((movie) => (
              <MovieCard key={movie.title + movie.year} movie={movie} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovieList;