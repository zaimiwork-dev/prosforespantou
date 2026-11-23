// «Ειδοποίησέ με» on the product page (owner 2026-11-23): watch this item and
// the same product at every other store; alert when it goes on offer, gets
// cheaper, or reaches a price the person types. Server rules: src/lib/watch-alerts.ts.
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { enableNotifications, findWatch, refreshWatches, removeWatch, saveWatch, useWatches, type NotificationState } from '@/lib/alerts';
import { formatPrice } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { showToast } from '@/components/ui/toast';
import { Fonts, Radius, Space, useType, type Palette, type TypeScale } from '@/constants/theme';

type Props = { offerId: string; chain: string | null; itemCode: string | null; name: string };

// «2,50» and «2.50» both mean 2,50 €.
export const parsePrice = (s: string): number | null => {
  const n = Number(s.trim().replace(/\s|€/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 10000 ? Math.round(n * 100) / 100 : null;
};

const RESULT: Record<NotificationState, string> = {
  on: 'Θα σε ειδοποιήσουμε στο κινητό.',
  denied: 'Η παρακολούθηση ξεκίνησε, αλλά οι ειδοποιήσεις είναι κλειστές στις ρυθμίσεις του κινητού.',
  unavailable: 'Η παρακολούθηση ξεκίνησε. Θα τη βρίσκεις στη Λίστα, στις Ειδοποιήσεις.',
};

export function WatchButton({ offerId, chain, itemCode, name }: Props) {
  const T = useType();
  const C = T.c;
  const styles = useMemo(() => makeStyles(T), [T]);
  const { watches, loaded } = useWatches();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!loaded) void refreshWatches().catch(() => {});
  }, [loaded]);
  const watch = findWatch(watches, chain, itemCode);

  return (
    <>
      <Pressable
        style={[styles.button, watch && styles.buttonOn]}
        onPress={() => { tap(); setOpen(true); }}
        accessibilityRole="button"
        accessibilityLabel={watch ? 'Σε ειδοποιούμε για αυτό το προϊόν. Πάτησε για αλλαγή' : 'Ειδοποίησέ με για αυτό το προϊόν'}>
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.brandText} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <Path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </Svg>
        <Text style={styles.buttonText}>{watch ? 'Σε ειδοποιούμε · Αλλαγή' : 'Ειδοποίησέ με'}</Text>
      </Pressable>
      {open ? (
        <WatchSheet
          offerId={offerId}
          name={name}
          watch={watch}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function WatchSheet({ offerId, name, watch, onClose }: {
  offerId: string;
  name: string;
  watch: ReturnType<typeof findWatch>;
  onClose: () => void;
}) {
  const T = useType();
  const C = T.c;
  const styles = useMemo(() => makeStyles(T), [T]);
  const [onOffer, setOnOffer] = useState(watch?.onOffer ?? true);
  const [onDrop, setOnDrop] = useState(watch?.onDrop ?? true);
  const [useTarget, setUseTarget] = useState(watch?.targetPrice != null);
  const [target, setTarget] = useState(watch?.targetPrice != null ? String(watch.targetPrice).replace('.', ',') : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetPrice = useTarget ? parsePrice(target) : null;
  const nothing = !onOffer && !onDrop && !useTarget;

  const save = async () => {
    if (useTarget && targetPrice == null) {
      setError('Γράψε μια τιμή, π.χ. 2,50.');
      return;
    }
    if (nothing) {
      setError('Διάλεξε τουλάχιστον ένα.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveWatch({ offerId, onOffer, onDrop, targetPrice });
      const state = await enableNotifications();
      onClose();
      showToast({ message: RESULT[state], durationMs: 5000 });
    } catch {
      setError('Δεν αποθηκεύτηκε. Έλεγξε τη σύνδεση και δοκίμασε ξανά.');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!watch) return;
    setBusy(true);
    try {
      await removeWatch(watch.id);
      onClose();
      showToast({ message: 'Δεν θα σε ειδοποιούμε πια για αυτό το προϊόν.' });
    } catch {
      setError('Δεν έγινε. Δοκίμασε ξανά.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Κλείσιμο" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">Ειδοποίησέ με</Text>
          <Text style={styles.name} numberOfLines={2}>{name}</Text>
          <Text style={styles.lead}>Παρακολουθούμε αυτό το προϊόν σε όλα τα καταστήματα που το έχουν.</Text>

          <Option label="Όταν μπει σε προσφορά" sub="σε οποιοδήποτε κατάστημα" on={onOffer} onPress={() => setOnOffer((v) => !v)} />
          <Option label="Όταν πέσει η τιμή" sub={watch?.startPrice != null ? `κάτω από ${formatPrice(watch.startPrice)}` : 'κάτω από τη σημερινή χαμηλότερη'} on={onDrop} onPress={() => setOnDrop((v) => !v)} />
          <Option label="Όταν φτάσει την τιμή μου" on={useTarget} onPress={() => setUseTarget((v) => !v)} />
          {useTarget ? (
            <View style={styles.targetRow}>
              <TextInput
                value={target}
                onChangeText={setTarget}
                keyboardType="decimal-pad"
                placeholder="π.χ. 2,50"
                placeholderTextColor={C.ink3Text}
                style={styles.input}
                accessibilityLabel="Η τιμή σου σε ευρώ"
                autoFocus={!watch}
              />
              <Text style={styles.euro}>€</Text>
            </View>
          ) : null}

          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

          <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={save} disabled={busy} accessibilityRole="button">
            <Text style={styles.primaryText}>{watch ? 'Αποθήκευση' : 'Ενεργοποίηση'}</Text>
          </Pressable>
          {watch ? (
            <Pressable style={styles.stop} onPress={stop} disabled={busy} accessibilityRole="button">
              <Text style={styles.stopText}>Σταμάτα την ειδοποίηση</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.stop} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelText}>Άκυρο</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Option({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  const T = useType();
  const styles = useMemo(() => makeStyles(T), [T]);
  return (
    <Pressable style={styles.option} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={sub ? `${label}, ${sub}` : label}>
      <View style={[styles.box, on && styles.boxOn]}>
        {on ? (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12.5l4.5 4.5L19 7.5" />
          </Svg>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionLabel}>{label}</Text>
        {sub ? <Text style={styles.optionSub}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (T: TypeScale, C: Palette = T.c) =>
  StyleSheet.create({
    button: {
      marginTop: Space[3], minHeight: 52, flexDirection: 'row', gap: Space[2], alignItems: 'center', justifyContent: 'center',
      borderRadius: Radius.pill, borderWidth: 2, borderColor: C.brandText, backgroundColor: C.surface,
    },
    buttonOn: { backgroundColor: C.bgSoft },
    buttonText: { ...T.text.button, color: C.brandText },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: {
      backgroundColor: C.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg,
      padding: Space[5], paddingBottom: Space[6],
    },
    title: { ...T.text.h2, color: C.ink },
    name: { ...T.text.bodyStrong, color: C.ink, marginTop: Space[1] },
    lead: { ...T.text.secondary, color: C.ink2, marginTop: Space[1], marginBottom: Space[3] },
    option: { flexDirection: 'row', alignItems: 'center', gap: Space[3], minHeight: 56, paddingVertical: Space[2] },
    box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
    boxOn: { backgroundColor: C.brand, borderColor: C.brand },
    optionLabel: { ...T.text.bodyStrong, color: C.ink },
    optionSub: { ...T.text.secondary, color: C.ink3Text },
    targetRow: { flexDirection: 'row', alignItems: 'center', gap: Space[2], marginLeft: 28 + Space[3], marginBottom: Space[2] },
    input: {
      ...T.text.bodyStrong, color: C.ink, minHeight: 52, minWidth: 140, paddingHorizontal: Space[3],
      borderWidth: 2, borderColor: C.line2, borderRadius: Radius.md, backgroundColor: C.bg,
    },
    euro: { ...T.text.bodyStrong, color: C.ink },
    error: { ...T.text.body, color: C.accentText, marginTop: Space[2] },
    primary: { marginTop: Space[4], minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.pill, backgroundColor: C.brand },
    primaryText: { ...T.text.button, color: '#fff' },
    stop: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: Space[1] },
    stopText: { ...T.text.bodyStrong, color: C.accentText, fontFamily: Fonts.sans700 },
    cancelText: { ...T.text.bodyStrong, color: C.ink2 },
  });
