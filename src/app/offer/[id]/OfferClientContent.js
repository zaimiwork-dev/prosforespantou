'use client';

import { useShoppingListStore } from "@/lib/store";
import { SiteHeader } from "@/components/SiteHeader";
import { ShoppingList } from "@/components/ShoppingList";
import { SUPERMARKETS } from "@/lib/constants";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

export default function OfferClientContent({ offer, comparison = [] }) {
  const { items, addItem } = useShoppingListStore();
  const [added, setAdded] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const handleAdd = () => {
    addItem(offer);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const getDaysLeft = (dateStr) => {
    if (!dateStr) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const expDate = new Date(dateStr); expDate.setHours(0, 0, 0, 0);
    return Math.round((expDate - today) / 86400000);
  };

  const daysLeft = getDaysLeft(offer.validUntil);
  const displayImage = offer.imageUrl || offer.product?.imageUrl;
  const displayName = offer.productName || offer.product?.name;
  const displayDescription = offer.description || offer.product?.description;
  const discountedPrice = Number(offer.discountedPrice);
  const originalPrice = offer.originalPrice ? Number(offer.originalPrice) : null;
  const sm = SUPERMARKETS.find((s) => s.id === offer.supermarket) || { name: offer.store?.name || "", color: "#009de0", short: "" };

  const expiryLabel = daysLeft === null ? "—"
    : daysLeft < 0 ? "Έχει λήξει"
    : daysLeft === 0 ? "Τελειώνει σήμερα"
    : daysLeft === 1 ? "Τελειώνει σε 1 μέρα"
    : daysLeft <= 2 ? `Τελειώνει σε ${daysLeft} μέρες`
    : `Σε ${daysLeft} ημέρες`;
  const expiryUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 2;

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };
  const validUntilFull = formatDate(offer.validUntil);
  const validFromFull = formatDate(offer.validFrom);
  const notStartedYet = offer.validFrom ? new Date(offer.validFrom).getTime() > Date.now() : false;

  return (
    <div style={{ background: "#f3f5f8", color: "#1c1e24", minHeight: "100vh", fontFamily: "'Outfit', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      <SiteHeader cartCount={items.length} onCartOpen={() => setIsCartOpen(true)} />

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "20px 16px 80px" }}>
        <Link
          href="/"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#8b929c", fontSize: 13, fontWeight: 700, textDecoration: "none", marginBottom: 16 }}
        >
          ← Πίσω στις προσφορές
        </Link>

        <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", border: "1px solid #ececf0", boxShadow: "0 8px 24px rgba(0,0,0,0.04)" }}>
          <div style={{ position: "relative", aspectRatio: "1.4/1", background: "#fafbfc", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
            {displayImage ? (
              <Image
                src={displayImage}
                alt={displayName}
                fill
                sizes="(max-width: 820px) 100vw, 820px"
                style={{ objectFit: "contain", padding: 32 }}
              />
            ) : (
              <div style={{ fontSize: 80, color: "#d0d5dd" }}>🏷️</div>
            )}

            <div style={{ position: "absolute", top: 16, left: 16, display: "flex", gap: 8 }}>
              <div style={{ background: sm.color, color: "#fff", padding: "6px 12px", borderRadius: 10, fontSize: 11, fontWeight: 900, letterSpacing: "0.4px" }}>
                {sm.name.toUpperCase()}
              </div>
            </div>

            {offer.discountPercent > 0 && (
              <div style={{ position: "absolute", top: 16, right: 16, background: offer.discountPercent >= 40 ? "#ff1f3d" : "#ff3b30", color: "#fff", padding: "8px 14px", borderRadius: 12, fontSize: 18, fontWeight: 900, boxShadow: "0 4px 12px rgba(255,59,48,0.35)" }}>
                -{offer.discountPercent}%
              </div>
            )}
          </div>

          <div style={{ padding: "28px 24px 24px" }}>
            {offer.category && (
              <div style={{ color: "#009de0", fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 6 }}>
                {offer.category}
              </div>
            )}

            <h1 style={{ fontSize: "clamp(22px, 4vw, 30px)", fontWeight: 900, lineHeight: 1.15, margin: "0 0 14px", letterSpacing: "-0.6px", color: "#1c1e24" }}>
              {displayName}
            </h1>

            {displayDescription && (
              <p style={{ fontSize: 14, color: "#6c757d", lineHeight: 1.55, margin: "0 0 24px" }}>
                {displayDescription}
              </p>
            )}

            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "#8b929c", fontSize: 10, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>Τιμή προσφοράς</div>
                <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-1.2px", color: "#1c1e24", lineHeight: 1 }}>
                  {discountedPrice.toFixed(2)}€
                </div>
              </div>
              {originalPrice && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ color: "#8b929c", fontSize: 10, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 4 }}>Αρχική</div>
                  <div style={{ fontSize: 18, color: "#a0a5ad", textDecoration: "line-through", fontWeight: 600 }}>
                    {originalPrice.toFixed(2)}€
                  </div>
                </div>
              )}
            </div>

            {notStartedYet && validFromFull && (
              <div style={{
                background: "#f6fbff",
                border: "1px solid #cfe8f7",
                color: "#0077b6",
                padding: "10px 14px",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 800,
                marginBottom: 16,
              }}>
                Η προσφορά ξεκινά στις {validFromFull}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
              <div style={{ background: "#f6f7f9", border: "1px solid #ececf0", padding: "12px 14px", borderRadius: 12 }}>
                <div style={{ color: "#8b929c", fontSize: 10, fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 4 }}>Έναρξη</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: notStartedYet ? "#0077b6" : "#1c1e24" }}>
                  {validFromFull || "—"}
                </div>
              </div>
              <div style={{ background: "#f6f7f9", border: "1px solid #ececf0", padding: "12px 14px", borderRadius: 12 }}>
                <div style={{ color: "#8b929c", fontSize: 10, fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 4 }}>Λήξη</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: expiryUrgent ? "#ff3b30" : "#1c1e24" }}>{expiryLabel}</div>
                {validUntilFull && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#8b929c", marginTop: 4 }}>
                    έως {validUntilFull}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleAdd}
              disabled={added}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: 14,
                border: "none",
                fontSize: 16,
                fontWeight: 900,
                cursor: added ? "default" : "pointer",
                color: "#fff",
                background: added ? "#22c55e" : "linear-gradient(135deg, #009de0, #0077b6)",
                boxShadow: added ? "0 6px 18px rgba(34,197,94,0.35)" : "0 6px 18px rgba(0,157,224,0.35)",
                transition: "transform 0.1s ease",
              }}
            >
              {added ? "✓ Προστέθηκε στη Λίστα" : "Προσθήκη στη Λίστα"}
            </button>
          </div>
        </div>

        {comparison.length > 0 && (
          <section style={{ marginTop: 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, padding: "0 4px" }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0, letterSpacing: "-0.4px" }}>
                Σύγκριση τιμής
              </h2>
              <span style={{ fontSize: 12, color: "#8b929c", fontWeight: 600 }}>
                {comparison.length} ακόμη {comparison.length === 1 ? "κατάστημα" : "καταστήματα"}
              </span>
            </div>

            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #ececf0", overflow: "hidden" }}>
              {(() => {
                const currentRow = {
                  id: offer.id,
                  price: discountedPrice,
                  sm,
                  isCurrent: true,
                  validUntil: offer.validUntil,
                };
                const otherRows = comparison.map((c) => {
                  const cSm = SUPERMARKETS.find((s) => s.id === c.supermarket) || { name: c.store?.name || "", color: "#888" };
                  return {
                    id: c.id,
                    price: Number(c.discountedPrice),
                    sm: cSm,
                    isCurrent: false,
                    validUntil: c.validUntil,
                  };
                });
                const rows = [currentRow, ...otherRows].sort((a, b) => a.price - b.price);
                const cheapest = rows[0];
                return rows.map((row) => {
                  const isCheapest = row.id === cheapest.id;
                  const diff = row.price - cheapest.price;
                  return (
                    <Link
                      key={row.id}
                      href={row.isCurrent ? "#" : `/offer/${row.id}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderBottom: "1px solid #f3f5f8",
                        textDecoration: "none",
                        color: "inherit",
                        background: row.isCurrent ? "#f6fbff" : "#fff",
                        cursor: row.isCurrent ? "default" : "pointer",
                      }}
                      onClick={(e) => { if (row.isCurrent) e.preventDefault(); }}
                    >
                      <div style={{ background: row.sm.color, color: "#fff", fontSize: 11, fontWeight: 900, padding: "4px 10px", borderRadius: 8, minWidth: 80, textAlign: "center", letterSpacing: "0.3px" }}>
                        {row.sm.name.toUpperCase()}
                      </div>

                      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        {isCheapest && (
                          <span style={{ background: "#22c55e", color: "#fff", fontSize: 10, fontWeight: 900, padding: "2px 7px", borderRadius: 6, letterSpacing: "0.4px" }}>
                            ΦΘΗΝΟΤΕΡΑ
                          </span>
                        )}
                        {row.isCurrent && (
                          <span style={{ color: "#8b929c", fontSize: 11, fontWeight: 700 }}>Βλέπεις τώρα</span>
                        )}
                        {!isCheapest && diff > 0 && (
                          <span style={{ color: "#ff3b30", fontSize: 11, fontWeight: 700 }}>+{diff.toFixed(2)}€</span>
                        )}
                      </div>

                      <div style={{ fontSize: 16, fontWeight: 900, color: "#1c1e24", letterSpacing: "-0.3px" }}>
                        {row.price.toFixed(2)}€
                      </div>
                    </Link>
                  );
                });
              })()}
            </div>
          </section>
        )}
      </main>

      <ShoppingList isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
}
