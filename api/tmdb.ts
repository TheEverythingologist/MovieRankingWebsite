export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
 
  const { title, year } = req.query;
 
  if (!title) {
    return res.status(400).json({ error: "title is required" });
  }
 
  try {
    const query = encodeURIComponent(title);
    const url = `https://api.themoviedb.org/3/search/movie?query=${query}${year ? `&year=${year}` : ""}&include_adult=false&language=en-US&page=1`;
 
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
        Accept: "application/json",
      },
    });
 
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }
 
    const data = await response.json();
    const movie = data.results?.[0];
 
    if (!movie || !movie.poster_path) {
      return res.status(404).json({ error: "Poster not found" });
    }
 
    const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
    res.status(200).json({ posterUrl, tmdbId: movie.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}