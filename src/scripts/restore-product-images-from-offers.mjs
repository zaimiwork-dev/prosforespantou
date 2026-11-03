// Recovery for the 2026-11-03 image incident (see rewrite-image-host.mjs):
// products whose image_url was wiped get the photo of one of their LIVE
// offers — those were re-linked by the offer scrapers, which rebuild each
// link from the deterministic sha1 object key. Products with no live offer
// wait for their chain's catalogue run.
//
//   node src/scripts/restore-product-images-from-offers.mjs          # dry run
//   APPLY=1 node src/scripts/restore-product-images-from-offers.mjs  # commit
//
// Runs in one transaction; the dry run rolls back. No bound parameters —
// the incident was an untyped parameter.
import 'dotenv/config';

const APPLY = process.env.APPLY === '1';
const BROKEN = "'https://images.prosforespantou.gr52'";
const { default: prisma } = await import('../lib/prisma.ts');

class Rollback extends Error {}

try {
  await prisma.$transaction(
    async (tx) => {
      // The exact rows in scope, so the proof below checks THEM (updated_at is
      // maintained by Prisma, not the database, so it cannot identify them).
      await tx.$executeRawUnsafe(`
        create temp table _targets on commit drop as
        select id from products where image_url is null or image_url = ${BROKEN}`);
      const [{ before }] = await tx.$queryRawUnsafe(`select count(*)::int as before from _targets`);

      // One live offer per product; prefer our own mirrored copy, then the newest.
      const n = await tx.$executeRawUnsafe(`
        update products p set image_url = s.image_url, updated_at = now()
        from (
          select distinct on (product_id) product_id, image_url
          from discounts
          where product_id is not null and is_active and valid_until > now()
            and image_url like 'https://%/%'
          order by product_id,
                   (image_url like 'https://images.prosforespantou.gr/%' or image_url like 'https://pub-%.r2.dev/%') desc,
                   updated_at desc
        ) s
        where p.id = s.product_id and p.id in (select id from _targets)`);

      // Proof on exactly the rows in scope: every one that now has an image
      // shows an image one of its live offers shows; nothing outside scope moved.
      const [{ restored, mismatched }] = await tx.$queryRawUnsafe(`
        select count(*) filter (where p.image_url is not null and p.image_url <> ${BROKEN})::int as restored,
               count(*) filter (where p.image_url is not null and p.image_url <> ${BROKEN} and not exists (
                 select 1 from discounts d where d.product_id = p.id and d.image_url = p.image_url and d.is_active))::int as mismatched
        from products p where p.id in (select id from _targets)`);
      const sample = await tx.$queryRawUnsafe(`
        select p.name, p.image_url from products p
        where p.id in (select id from _targets) and p.image_url is not null and p.image_url <> ${BROKEN}
        order by random() limit 3`);
      const [{ after }] = await tx.$queryRawUnsafe(
        `select count(*)::int as after from products where image_url is null or image_url = ${BROKEN}`);
      if (restored !== n) throw new Error(`proof failed: updated ${n} but ${restored} in-scope rows have an image — rolled back`);

      console.log(`products without a photo: ${before} → ${after} (${n} restored from live offers)`);
      console.log(`restored rows not matching an offer image: ${mismatched}`);
      for (const s of sample) console.log(`  e.g. ${s.name.slice(0, 50)} → ${s.image_url}`);

      if (mismatched > 0) throw new Error('proof failed — rolled back, nothing written');
      if (!APPLY) throw new Rollback();
    },
    { timeout: 120_000 },
  );
  console.log(APPLY ? '\nCommitted.' : '\nDry run — rolled back. Re-run with APPLY=1.');
} catch (e) {
  if (!(e instanceof Rollback)) {
    console.error(e.message);
    process.exitCode = 1;
  } else {
    console.log('\nDry run — rolled back. Re-run with APPLY=1.');
  }
} finally {
  await prisma.$disconnect();
}
