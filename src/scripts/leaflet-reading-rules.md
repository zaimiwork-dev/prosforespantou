# Reading a supermarket leaflet page — rules

You are reading one or more page images of a Greek supermarket's weekly leaflet (Discount Markt). Shoppers will see what you write as offer cards on a price-comparison site, so every name and price must be exactly what the leaflet prints. A wrong name or price is worse than a missing offer: when you cannot read something with certainty, leave the offer out.

## What is an offer

Every product box that shows a price («ΜΟΝΟ 0,79», «2,99», «ΑΠΟ 19,99 → 16,99»). Skip banners, slogans, store notices, recipe text and anything without a price.

## What to write for each offer

- `page`: the page number you were given.
- `name`: the product name exactly as printed, in the same letters (Greek stays Greek, Latin stays Latin), including the brand when printed («ΒΙΟΛΑΝΤΑ γεμιστά μπισκότα βρώμης»). Join the lines of the label with single spaces. Do NOT translate, transliterate, correct spelling, or invent a brand that is not printed. Leave the size OUT of `name` when you put it in `size`.
- `variants`: the choices printed under the name («• γάλακτος / υγείας», «πορτοκάλι / βύσσινο») as one string, or null.
- `size`: the pack size as printed («280γρ», «1λιτ», «6x330ml», «10τεμ 400γρ», «20κιλ»), or null when none is printed.
- `price`: the offer price as a number (the big «ΜΟΝΟ» price: «0,79» → 0.79).
- `oldPrice`: the old price only when the leaflet prints one («ΑΠΟ 19,99» → 19.99), else null. Never compute one.
- `perUnit`: the small unit-price line as printed («*1κιλ: μόνο 2,82€» → 2.82), else null.
- `perUnitOf`: what that line is per: "κιλό", "λίτρο", "τεμάχιο", "μέτρο", "μεζούρα", or null. When the line is a range («από 4,34 – μόνο 3,26»), write the «μόνο» value.
- `priceFor`: "item" (a pack), "kg" (sold by weight: «το κιλό», «1 κιλό»), or "portion" («Η ΜΕΡΙΔΑ»).
- `note`: a printed condition that changes who gets the price («ΙΣΧΥΕΙ ΜΟΝΟ ΓΙΑ ΤΑ ΚΑΤΑΣΤΗΜΑΤΑ ΠΟΥ ΔΙΑΘΕΤΟΥΝ ΤΜΗΜΑ ΕΤΟΙΜΟΥ ΦΑΓΗΤΟΥ», «με την κάρτα»), else null.
- `sure`: true only if you read the name, size and price without guessing; false otherwise. A unit-price line you could not fit into the fields above does not make an offer unsure — leave `perUnit` null instead.

## The page header

If a page prints the leaflet's dates («ΑΠΟ ΔΕΥΤΕΡΑ 23/11 ΕΩΣ ΣΑΒΒΑΤΟ 28/11»), report them once as `{"page": N, "dates": "<exactly as printed>"}` in a separate `headers` list.

## Output

One JSON object: `{"headers": [...], "offers": [...]}`. Read each page from top-left to bottom-right; list every offer once — the same product printed twice on a page is one offer.
