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

export function daysLeft(dateStr, nowMs) {
  if (!dateStr) return null;
  const today = new Date(nowMs); today.setHours(0, 0, 0, 0);
  const exp = new Date(dateStr); exp.setHours(0, 0, 0, 0);
  return Math.round((exp - today) / 86400000);
}

export function formatShortDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatFullDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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
    const checkedShort = formatShortDate(offer.updatedAt);
    const checkedFull = formatFullDate(offer.updatedAt);
    return {
      real,
      upcoming: false,
      urgent: false,
      daysLeft: null,
      chip: checkedShort ? `Ελέγχθηκε ${checkedShort}` : null,
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
