// Dateless leaflets with an auto-delete window (admin sets «σβήσε σε N μέρες»
// when a chain publishes no dates). Pure rule + a DB helper.
//
// History (2026-09-16): the prune ran as a WRITE on every supermarket page view
// and was exported from a 'use server' file without an admin check, which made
// it a public endpoint. Now: the page filters expired leaflets when it READS
// (isExpiredDatelessLeaflet), and the delete runs nightly
// (src/scripts/prune-leaflets.mjs) and when an admin opens the leaflet list.
//
// Strip-safe (no enums) so the .mjs script can import it.

export type PrunableLeaflet = {
  id: string;
  validFrom: Date | string | null;
  createdAt: Date | string;
  autoDeleteDays: number | null;
};

export function isExpiredDatelessLeaflet(l: PrunableLeaflet, nowMs: number = Date.now()): boolean {
  if (l.validFrom != null) return false;
  if (!l.autoDeleteDays || l.autoDeleteDays <= 0) return false;
  const created = new Date(l.createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return created + l.autoDeleteDays * 86400000 < nowMs;
}

type LeafletStore = {
  leaflet: {
    findMany(args: any): Promise<PrunableLeaflet[]>;
    deleteMany(args: any): Promise<{ count: number }>;
  };
};

export async function pruneExpiredDatelessLeaflets(prisma: LeafletStore, nowMs: number = Date.now()): Promise<number> {
  const candidates = await prisma.leaflet.findMany({
    where: { validFrom: null, autoDeleteDays: { not: null } },
    select: { id: true, validFrom: true, createdAt: true, autoDeleteDays: true },
  });
  const ids = candidates.filter((l) => isExpiredDatelessLeaflet(l, nowMs)).map((l) => l.id);
  if (ids.length === 0) return 0;
  const { count } = await prisma.leaflet.deleteMany({ where: { id: { in: ids } } });
  return count;
}
