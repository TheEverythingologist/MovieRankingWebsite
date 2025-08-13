export interface MovieData {
  ranking: number;
  title: string;
  elo: number;
  letterboxd_url: string;
}

export const parseCSV = (text: string): MovieData[] => {
  const lines = text.trim().split(/\r?\n/);
  const [header, ...rows] = lines;

  return rows.map((line) => {
    const cells = line.split(/,(?=(?:[^"]*"[^"]*")*(?![^"]*"))/g)
      .map((cell) => cell.replace(/^"|"$/g, "").trim());

    return {
      ranking: parseInt(cells[0], 10),
      title: cells[1],
      elo: parseInt(cells[3], 10),
      letterboxd_url: cells[5]
    };
  });
};