import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, type ItemSummary, type Proposal, type ProposalAction } from '@/api';
import { proposalTone, sides } from '@/components/proposal-card';
import { Badge, Button, Card, ErrorBanner, Loading, SectionTitle, Thumb } from '@/components/ui';
import { confirm, errorText, notify } from '@/lib/dialogs';
import { formatPrice, PROPOSAL_STATUS_LABEL, timeAgo } from '@/lib/format';
import { colors, spacing } from '@/theme';

const ACTIONS: Record<ProposalAction, { label: string; variant: 'primary' | 'secondary' | 'danger'; confirm?: [string, string] }> = {
  accept: {
    label: 'Aceitar troca',
    variant: 'primary',
    confirm: ['Aceitar esta troca?', 'Os dois itens ficam reservados e vocês poderão combinar a entrega por e-mail.'],
  },
  decline: { label: 'Recusar', variant: 'danger', confirm: ['Recusar proposta?', 'A outra pessoa será informada.'] },
  complete: {
    label: 'Marcar troca como concluída',
    variant: 'primary',
    confirm: ['Troca concluída?', 'Confirme apenas depois de receber o item. Os dois itens saem do app.'],
  },
  cancel: { label: 'Cancelar', variant: 'secondary', confirm: ['Cancelar?', 'Se a troca já estava aceita, os itens voltam a ficar disponíveis.'] },
};

function explanation(p: Proposal): string {
  switch (p.status) {
    case 'pending':
      return p.direction === 'received' ? 'Responda para que a outra pessoa saiba se a troca vai acontecer.' : `Aguardando resposta de ${p.counterpart.name}.`;
    case 'accepted':
      return 'Troca aceita! Combinem por e-mail o local e o horário. Prefira locais públicos e movimentados.';
    case 'declined':
      return 'A proposta foi recusada.';
    case 'cancelled':
      return 'A proposta foi cancelada.';
    case 'unavailable':
      return 'Um dos itens foi trocado ou removido, então esta proposta foi encerrada.';
    case 'completed':
      return 'Troca concluída. Obrigado por dar uma nova vida a esses objetos!';
  }
}

export default function ProposalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const proposal = useQuery({ queryKey: ['proposal', id], queryFn: () => api.proposal(id) });

  const act = useMutation({
    mutationFn: (action: ProposalAction) => api.proposalAction(id, action),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['proposal', id], updated);
      await Promise.all(
        [['proposals'], ['items'], ['item'], ['feed']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    onError: (err) => {
      notify('Não foi possível concluir', errorText(err));
      proposal.refetch();
    },
  });

  if (proposal.isPending) return <Loading />;
  if (proposal.isError) return <ErrorBanner message={proposal.error.message} onRetry={proposal.refetch} />;

  const p = proposal.data;
  const { mine, theirs } = sides(p);
  const email = p.counterpart.email;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={{ gap: spacing.sm }}>
        <Badge label={PROPOSAL_STATUS_LABEL[p.status]} tone={proposalTone(p.status)} />
        <Text style={styles.explanation}>{explanation(p)}</Text>
      </View>

      <Card style={{ gap: spacing.md }}>
        <ItemRow label="Você dá" item={mine} />
        <Text style={styles.swap}>⇅</Text>
        <ItemRow label={`Você recebe de ${p.counterpart.name}`} item={theirs} />
      </Card>

      {p.message ? (
        <Card style={{ gap: spacing.xs }}>
          <SectionTitle>Mensagem</SectionTitle>
          <Text style={styles.text}>“{p.message}”</Text>
          <Text style={styles.small}>{timeAgo(p.createdAt)}</Text>
        </Card>
      ) : null}

      {email ? (
        <Card style={{ gap: spacing.sm }}>
          <SectionTitle>Contato</SectionTitle>
          <Text style={styles.text}>
            {p.counterpart.name} · {p.counterpart.neighborhood}
          </Text>
          <Button
            title={`Escrever para ${email}`}
            variant="secondary"
            onPress={() => Linking.openURL(`mailto:${email}?subject=${encodeURIComponent('Nossa troca no app Troca')}`)}
          />
        </Card>
      ) : null}

      <View style={{ gap: spacing.md }}>
        {p.actions.map((action) => {
          const cfg = ACTIONS[action];
          return (
            <Button
              key={action}
              title={cfg.label}
              variant={cfg.variant}
              loading={act.isPending && act.variables === action}
              disabled={act.isPending}
              onPress={async () => {
                if (cfg.confirm && !(await confirm(cfg.confirm[0], cfg.confirm[1]))) return;
                act.mutate(action);
              }}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

function ItemRow({ label, item }: { label: string; item: ItemSummary }) {
  return (
    <Pressable style={styles.row} onPress={() => router.push({ pathname: '/items/[id]', params: { id: item.id } })}>
      <Thumb url={item.thumbUrl} size={64} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.small}>{label}</Text>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemPrice}>{formatPrice(item.priceCents)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  explanation: { fontSize: 15, color: colors.text, lineHeight: 21 },
  swap: { textAlign: 'center', fontSize: 20, color: colors.muted },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  small: { fontSize: 12, color: colors.muted },
  itemTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  itemPrice: { fontSize: 14, fontWeight: '700', color: colors.primaryDark },
  text: { fontSize: 15, color: colors.text, lineHeight: 21 },
});
