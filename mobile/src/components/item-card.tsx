import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Item } from '@/api';
import { formatDistance, formatPrice, ITEM_STATUS_LABEL } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { Badge, Thumb } from './ui';

export function ItemCard({
  item,
  distanceKm,
  alreadyProposed,
  showStatus,
  onPress,
}: {
  item: Item;
  distanceKm?: number;
  alreadyProposed?: boolean;
  showStatus?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <Thumb url={item.photos[0]?.thumbUrl} size={88} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.price}>{formatPrice(item.priceCents)}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {distanceKm !== undefined ? `≈ ${formatDistance(distanceKm)} · ` : ''}
          {item.isMine ? 'Seu item' : `${item.owner.name} · ${item.owner.neighborhood}`}
        </Text>
        <View style={styles.badges}>
          {showStatus ? (
            <Badge label={ITEM_STATUS_LABEL[item.status]} tone={item.status === 'active' ? 'success' : item.status === 'reserved' ? 'warning' : 'neutral'} />
          ) : null}
          {alreadyProposed ? <Badge label="Proposta enviada" tone="info" /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  price: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  meta: { fontSize: 13, color: colors.muted },
  badges: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
});
