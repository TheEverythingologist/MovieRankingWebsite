import React from "react";
import type { MovieData } from "../types/MovieData";
import "./MovieList.css";

interface MovieListProps {
  movies: MovieData[];
}

const MovieList: React.FC<MovieListProps> = ({ movies }) => {
  return (
    <div className="movie-grid">
      {movies.map((movie, index) => {
        const posterFileName = movie.letterboxd_url
          .replace("https://letterboxd.com/film/", "")
          .replace("/", "") + ".jpg";

        return (
          <div key={index} className="movie-card">
            <div className="ranking-badge">#{index + 1}</div>

            <img
              src={`/movie-posters/${posterFileName}`}
              alt={movie.title}
              className="movie-poster"
            />

            <div className="movie-info">
              <h2>{movie.title}</h2>
              <p>Elo: {movie.elo}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MovieList;
