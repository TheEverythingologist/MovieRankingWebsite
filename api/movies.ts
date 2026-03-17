export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
 
  try {
    const url = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_DATA_REPO}/contents/${process.env.GITHUB_DATA_PATH}`;
 
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });
 
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
 
    const json = await response.json();
    const csv = Buffer.from(json.content, "base64").toString("utf-8");
 
    // Parse CSV into array of objects
    const lines = csv.trim().split("\n");
    const headers = lines[0].split(",");
 
    const movies = lines.slice(1).map((line) => {
      // Handle commas inside quoted fields (e.g. long titles)
      const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || line.split(",");
      const obj = {};
      headers.forEach((h, i) => {
        obj[h.trim()] = cols[i] ? cols[i].replace(/^"|"$/g, "").trim() : "";
      });
      return obj;
    });
 
    res.status(200).json({ movies });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
 