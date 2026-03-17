import type { VercelRequest, VercelResponse } from "@vercel/node";

interface GitHubFileResponse {
  content: string;
}

interface MovieRow {
  [key: string]: string;
}

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse
): Promise<void> {
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

    const json = (await response.json()) as GitHubFileResponse;
    const csv = Buffer.from(json.content, "base64").toString("utf-8");

    // Parse CSV into array of objects
    const lines = csv.trim().split("\n");
    const headers = lines[0].split(",");

    const movies: MovieRow[] = lines.slice(1).map((line) => {
      // Handle commas inside quoted fields (e.g. long titles)
      const cols =
        line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) ?? line.split(",");
      const obj: MovieRow = {};
      headers.forEach((h, i) => {
        obj[h.trim()] = cols[i] ? cols[i].replace(/^"|"$/g, "").trim() : "";
      });
      return obj;
    });

    res.status(200).json({ movies });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}