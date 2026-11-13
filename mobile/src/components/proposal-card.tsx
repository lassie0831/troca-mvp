import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Proposal, ProposalStatus } from '@/api';
import { formatPrice, PROPOSAL_STATUS_LABEL, timeAgo } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { Badge, Thumb } from './ui';

export const proposalTone = (s: ProposalStatus) =>
  s === 'pending' ? 'info' : s === 'accepted' ? 'warning' : s === 'completed' ? 'success' : s === 'declined' ? 'danger' : 'neutral';

/** From the viewer's perspective: what I give and what I get. */
export function sides(p: Proposal) {
  return p.direction === 'sent'
    ? { mine: p.offeredItem, theirs: p.requestedItem }
    : { mine: p.requestedItem, theirs: p.offeredItem };
}

export function ProposalCard({ proposal, onPress }: { proposal: Proposal; onPress?: () => void }) {
  const { mine, theirs } = sides(proposal);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.header}>
        <Text style={styles.who} numberOfLines={1}>
          {proposal.direction === 'received' ? `${proposal.counterpart.name} quer trocar` : `Para ${proposal.counterpart.name}`}
        </Text>
        <Text style={styles.time}>{timeAgo(proposal.createdAt)}</Text>
      </View>
      <View style={styles.row}>
        <Side label="Você dá" title={mine.title} price={mine.priceCents} thumb={mine.thumbUrl} />
        <Text style={styles.arrow}>⇄</Text>
        <Side label="Você recebe" title={theirs.title} price={theirs.priceCents} thumb={theirs.thumbUrl} />
      </View>
      <Badge label={PROPOSAL_STATUS_LABEL[proposal.status]} tone={proposalTone(proposal.status)} />
    </Pressable>
  );
}

function Side({ label, title, price, thumb }: { label: string; title: string; price: number; thumb: string | null }) {
  return (
    <View style={styles.side}>
      <Thumb url={thumb} size={56} />
      <View style={{ flex: 1 }}>
        <Text style={styles.sideLabel}>{label}</Text>
        <Text style={styles.sideTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.sidePrice}>{formatPrice(price)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  who: { fontWeight: '600', color: colors.text, flex: 1 },
  time: { color: colors.muted, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  arrow: { fontSize: 20, color: colors.muted },
  side: { flex: 1, flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  sideLabel: { fontSize: 11, color: colors.muted, textTransform: 'uppercase' },
  sideTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  sidePrice: { fontSize: 12, color: colors.primaryDark, fontWeight: '600' },
});
