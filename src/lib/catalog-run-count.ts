type CatalogRunCount = {
  scrapedItems: number;
};

// Runs arrive newest-first. A nominally healthy crawl can still be partial
// (Sklavenitis once recorded 33 rows after a 7,475-row full crawl), so ignore
// a latest run that is below half of the recent healthy peak.
export function representativeCatalogCount(runs: CatalogRunCount[]): number {
  if (runs.length === 0) return 0;
  const peak = Math.max(...runs.map((run) => run.scrapedItems));
  const floor = peak > 20 ? peak * 0.5 : 1;
  return runs.find((run) => run.scrapedItems >= floor)?.scrapedItems ?? peak;
}
