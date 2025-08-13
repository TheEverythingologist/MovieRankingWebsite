import React from "react";
import type { MovieData } from "../utils/csvParser";

interface MovieCardProps {
  movie: MovieData;
}

const MovieCard: React.FC<MovieCardProps> = ({ movie }) => {
    
  // Convert letterboxd URL to image filename
  const fileName = movie.letterboxd_url
  .replace("https://letterboxd.com/film/", "")
  .replace(/\/$/, "") + ".jpg";

  const poster = `/movie-posters/${fileName}`;

  return (
    <div className="border rounded-lg shadow-md p-4 flex items-center gap-4 bg-white">
      <span className="text-lg font-bold w-8">{movie.ranking}</span>
      <img src={poster} alt={movie.title} className="w-24 h-auto rounded" />
      <div>
        <h2 className="text-xl font-semibold">{movie.title}</h2>
        <p className="text-gray-600">Elo: {movie.elo}</p>
      </div>
    </div>
  );
};

export default MovieCard;
