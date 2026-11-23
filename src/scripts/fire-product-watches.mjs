// «Ειδοποίησέ με» — the nightly check of every product watch (owner
// 2026-11-23: alerts on ANY product, on offer or not; app notification and
// email). Runs in the resolvers job after the comparison counts, so it sees
// tonight's offers, links and barcode matches.
//
//   node src/scripts/fire-product-watches.mjs
//   DRY_RUN=1 node src/scripts/fire-product-watches.mjs   # decide + print, send nothing
//
// For each active watch: today's prices for the watched item and the same
// product at other stores (lib/list-prices loadItemPrices — the comparison
// sheet's own rows), then lib/watch-alerts decideWatchAlert (offer anywhere /
// price drop / target price, never twice, one per 20 h). Delivery:
//   app  — Expo push API (free); a phone Expo reports DeviceNotRegistered is
//          disabled so we stop sending to it;
//   email — lib/email (Resend), only to confirmed, still-subscribed emails.
// A watch is marked as told only when at least one channel accepted the
// message, so a phone that has not allowed notifications yet does not
// silently swallow its first alert.
//
// dotenv first (ESM hoist trap).
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DRY_RUN = process.env.DRY_RUN === '1';
const SITE = 'https://prosforespantou.gr';
const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

async function sendPushBatch(messages) {
  // ≤ 100 per request (Expo's limit). Returns one ticket per message.
  const res = await fetch(EXPO_PUSH, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j.data) ? j.data : [];
}

async function run() {
  const { default: prisma } = await import('../lib/prisma.ts');
  const { loadItemPrices } = await import('../lib/list-prices.ts');
  const { decideWatchAlert, alertText } = await import('../lib/watch-alerts.ts');
  const { atChain } = await import('../lib/list-basket.ts');
  const { formatPrice } = await import('../lib/format-price.ts');
  const { SUPERMARKETS } = await import('../lib/constants.js');
  const { sendWatchAlertEmail } = await import('../lib/email.ts');
  const nameOf = (id) => SUPERMARKETS.find((s) => s.id === id)?.name ?? id;
  const now = new Date();

  const watches = await prisma.productWatch.findMany({
    where: { isActive: true },
    include: {
      device: { select: { id: true, pushToken: true, disabledAt: true } },
      subscriber: { select: { email: true, confirmedAt: true, unsubscribedAt: true, unsubToken: true } },
    },
  });
  console.log(`🔔 product watches: ${watches.length}${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  if (watches.length === 0) { await prisma.$disconnect(); return; }

  const keys = [...new Map(watches.map((w) => [`${w.chain}#${w.chainItemcode}`, { chain: w.chain, code: w.chainItemcode }])).values()];
  const prices = {};
  for (let i = 0; i < keys.length; i += 200) Object.assign(prices, await loadItemPrices(prisma, keys.slice(i, i + 200), now));

  const num = (d) => (d == null ? null : Number(d));
  const decisions = [];
  for (const w of watches) {
    const points = prices[`${w.chain}#${w.chainItemcode}`]?.points ?? [];
    const state = {
      onOffer: w.onOffer, onDrop: w.onDrop, targetPrice: num(w.targetPrice), startPrice: num(w.startPrice),
      lastNotifiedAt: w.lastNotifiedAt, lastNotifiedPrice: num(w.lastNotifiedPrice), notifiedOfferIds: w.notifiedOfferIds ?? [],
    };
    const { alert, next } = decideWatchAlert(state, points, now);
    decisions.push({ w, alert, next });
  }
  const alerts = decisions.filter((d) => d.alert);
  console.log(`   alerts due: ${alerts.length} (offer ${alerts.filter((d) => d.alert.reason === 'offer').length}, drop ${alerts.filter((d) => d.alert.reason === 'drop').length}, target ${alerts.filter((d) => d.alert.reason === 'target').length})`);

  // Build the messages.
  const push = []; // { d, message }
  for (const d of alerts) {
    const { title, body } = alertText(d.w.name, d.alert, formatPrice, (c) => atChain(c, nameOf(c)));
    d.text = { title, body };
    // Open the offer when there is one, else the search for the product.
    d.url = d.alert.offerId ? `${SITE}/offer/${d.alert.offerId}` : `${SITE}/search?q=${encodeURIComponent(d.w.name)}`;
    if (DRY_RUN) console.log(`     ${d.alert.reason.padEnd(6)} ${title} — ${body}`);
    const dev = d.w.device;
    if (dev?.pushToken && !dev.disabledAt) {
      push.push({ d, message: {
        to: dev.pushToken, title, body, sound: 'default', channelId: 'alerts',
        data: { watchId: d.w.id, offerId: d.alert.offerId, chain: d.w.chain, code: d.w.chainItemcode },
      } });
    }
  }

  const delivered = new Set();
  let pushOk = 0;
  let pushFail = 0;
  let mailOk = 0;
  const deadDevices = new Set();
  if (!DRY_RUN) {
    for (let i = 0; i < push.length; i += 100) {
      const chunk = push.slice(i, i + 100);
      try {
        const tickets = await sendPushBatch(chunk.map((p) => p.message));
        chunk.forEach((p, k) => {
          const t = tickets[k];
          if (t?.status === 'ok') { pushOk++; delivered.add(p.d.w.id); return; }
          pushFail++;
          if (t?.details?.error === 'DeviceNotRegistered' && p.d.w.device?.id) deadDevices.add(p.d.w.device.id);
        });
      } catch (e) {
        pushFail += chunk.length;
        console.log(`   ⚠️ push batch failed: ${e.message}`);
      }
    }
    for (const d of alerts) {
      const s = d.w.subscriber;
      if (!s || !s.confirmedAt || s.unsubscribedAt) continue;
      const r = await sendWatchAlertEmail({
        email: s.email, unsubToken: s.unsubToken, title: d.text.title, body: d.text.body, productName: d.w.name, url: d.url,
      }).catch((e) => ({ ok: false, error: e.message }));
      if (r?.ok) { mailOk++; delivered.add(d.w.id); }
    }
    if (deadDevices.size > 0) {
      await prisma.appDevice.updateMany({ where: { id: { in: [...deadDevices] } }, data: { disabledAt: now } });
    }
    // Store state: told → the alert's state; not told → only the start price.
    for (const d of decisions) {
      const data = {};
      if (d.next.startPrice != null) data.startPrice = d.next.startPrice;
      if (d.alert && delivered.has(d.w.id)) {
        data.lastNotifiedAt = d.next.lastNotifiedAt;
        data.lastNotifiedPrice = d.next.lastNotifiedPrice;
        data.notifiedOfferIds = d.next.notifiedOfferIds;
      }
      if (Object.keys(data).length > 0) await prisma.productWatch.update({ where: { id: d.w.id }, data });
    }
  }
  console.log(`🏁 watches done — push sent ${pushOk}, push failed ${pushFail}, emails sent ${mailOk}, phones disabled ${deadDevices.size}, alerts not delivered ${alerts.length - delivered.size}${DRY_RUN ? ' (DRY_RUN)' : ''}`);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(`\n❌ ${e.stack || e.message}`); process.exit(1); });
