import 'dotenv/config';
const { default: prisma } = await import('../lib/prisma.ts');
const rows = await prisma.$queryRaw`
  SELECT supermarket, source, COUNT(*)::int AS n,
         MIN(created_at) AS oldest, MAX(created_at) AS newest
  FROM discounts
  WHERE is_active = true AND valid_until > NOW()
  GROUP BY supermarket, source
  ORDER BY supermarket, source
`;
for (const r of rows) {
  console.log(`${r.supermarket.padEnd(12)} | ${r.source.padEnd(8)} | ${String(r.n).padStart(5)} | ${r.oldest?.toISOString?.()?.slice(0,10)} → ${r.newest?.toISOString?.()?.slice(0,10)}`);
}
await prisma.$disconnect();
