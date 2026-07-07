// Honest expiry labels — single source of truth for how offer validity is
// presented (DiscountCard chip + OfferDetails date boxes).
//
// Only AB and Lidl publish real per-offer end dates (and admins enter real
// ones); every other chain's validUntil is the ingest +14d bookkeeping default.
// Presenting that default as "Έως 20/07" told users an expiry the chain never
// promised. Rule: `datesFromSource` decides which vocabulary is allowed —
//   real dates    → "Έως DD/MM", countdowns, urgency styling
//   default dates → "Ελέγχθηκε DD/MM" (card) / "Σε ισχύ" (detail), from
//                   updatedAt, which ingest bumps every run the chain's feed
//                   still lists the offer — i.e. "last verified live".

// All calendar math is anchored to Europe/Athens, NOT the runtime timezone.
// The server renders in UTC and the browser in local time; near a date
// boundary the two produced different "Έως DD/MM" strings and React threw
// hydration error #418 (seen live 2026-07-07). Users are Greek shoppers —
// Athens dates are also simply the correct ones.
const ATHENS_DMY = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', year: 'numeric',
});

function athensParts(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = ATHENS_DMY.formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { day: get('day'), month: get('month'), year: get('year') };
}

export function daysLeft(dateStr, nowMs) {
  if (!dateStr) return null;
  const a = athensParts(nowMs);
  const b = athensParts(dateStr);
  if (!a || !b) return null;
  return Math.round(
    (Date.UTC(+b.year, +b.month - 1, +b.day) - Date.UTC(+a.year, +a.month - 1, +a.day)) / 86400000
  );
}

export function formatShortDate(dateStr) {
  if (!dateStr) return null;
  const p = athensParts(dateStr);
  return p ? `${p.day}/${p.month}` : null;
}

export function formatFullDate(dateStr) {
  if (!dateStr) return null;
  const p = athensParts(dateStr);
  return p ? `${p.day}/${p.month}/${p.year}` : null;
}

// offer: normalized fields { validFrom, validUntil, updatedAt, datesFromSource }
// (callers resolve their own camel/snake aliases first).
// Returns:
//   real       — chain-published dates; countdown vocabulary allowed
//   upcoming   — real && validFrom in the future
//   urgent     — real && expires within 2 days (chip turns .soon)
//   chip       — card chip text (null → no chip)
//   status     — detail "Λήξη" box main value
//   statusSub  — detail "Λήξη" box sub-line (null → none)
//   startFull  — detail "Έναρξη" box value (null → caller renders '—')
export function expiryInfo(offer, nowMs = Date.now()) {
  const real = Boolean(offer.datesFromSource);

  if (!real) {
    // Owner call (2026-07-06): verification bookkeeping must NOT be shopper-
    // facing on cards — no chip at all. The detail view shows it as a small
    // footnote (statusSub) at the bottom, nothing in the date boxes.
    const checkedFull = formatFullDate(offer.updatedAt);
    return {
      real,
      upcoming: false,
      urgent: false,
      daysLeft: null,
      chip: null,
      status: 'Σε ισχύ',
      statusSub: checkedFull ? `ελέγχθηκε ${checkedFull}` : null,
      startFull: null,
    };
  }

  const dLeft = daysLeft(offer.validUntil, nowMs);
  const upcoming = offer.validFrom ? new Date(offer.validFrom).getTime() > nowMs : false;
  const urgent = dLeft !== null && dLeft >= 0 && dLeft <= 2;
  const status = dLeft === null ? '—'
    : dLeft < 0 ? 'Έχει λήξει'
    : dLeft === 0 ? 'Τελειώνει σήμερα'
    : dLeft === 1 ? 'Τελειώνει αύριο'
    : dLeft <= 2 ? `Τελειώνει σε ${dLeft} μέρες`
    : `Σε ${dLeft} ημέρες`;
  const chip = upcoming
    ? `Ξεκινά ${formatShortDate(offer.validFrom)}`
    : urgent
      ? (dLeft === 0 ? 'Λήγει σήμερα' : dLeft === 1 ? 'Λήγει αύριο' : `Λήγει σε ${dLeft} μέρες`)
      : offer.validUntil ? `Έως ${formatShortDate(offer.validUntil)}` : null;

  return {
    real,
    upcoming,
    urgent,
    daysLeft: dLeft,
    chip,
    status,
    statusSub: offer.validUntil ? `έως ${formatFullDate(offer.validUntil)}` : null,
    startFull: formatFullDate(offer.validFrom),
  };
}
