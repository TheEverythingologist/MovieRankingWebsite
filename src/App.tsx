import React, { useEffect, useState } from "react";
import MovieList from "./components/MovieList";
import { parseCSV } from "./utils/csvParser";
import type { MovieData } from "./utils/csvParser";
import moviesCSV from "C:/Users/TKD12/Documents/CodingRepos/MovieRanking/data/database.csv?raw";

const App: React.FC = () => {
  const [movies, setMovies] = useState<MovieData[]>([]);

  useEffect(() => {
    const parsedMovies = parseCSV(moviesCSV);
    setMovies(parsedMovies);
  }, []);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <MovieList movies={movies} />
    </div>
  );
};

export default App;
