import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { api } from '@/api';
import { ProposalCard } from '@/components/proposal-card';
import { Chip, EmptyState, ErrorBanner, Loading } from '@/components/ui';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { colors, spacing } from '@/theme';

export default function ProposalsScreen() {
  const [box, setBox] = useState<'received' | 'sent'>('received');
  const proposals = useQuery({ queryKey: ['proposals', box], queryFn: () => api.proposals(box) });
  useRefreshOnFocus(proposals.refetch);

  const pendingReceived = box === 'received' ? (proposals.data ?? []).filter((p) => p.status === 'pending').length : 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.tabs}>
        <Chip
          label={pendingReceived ? `Recebidas (${pendingReceived})` : 'Recebidas'}
          selected={box === 'received'}
          onPress={() => setBox('received')}
        />
        <Chip label="Enviadas" selected={box === 'sent'} onPress={() => setBox('sent')} />
      </View>
      {proposals.isPending ? (
        <Loading />
      ) : proposals.isError ? (
        <ErrorBanner message={proposals.error.message} onRetry={proposals.refetch} />
      ) : (
        <FlatList
          data={proposals.data}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ProposalCard proposal={item} onPress={() => router.push({ pathname: '/proposals/[id]', params: { id: item.id } })} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          ListEmptyComponent={
            <EmptyState
              title={box === 'received' ? 'Nenhuma proposta recebida' : 'Nenhuma proposta enviada'}
              message={
                box === 'received'
                  ? 'Quando alguém quiser trocar com você, a proposta aparece aqui.'
                  : 'Encontre itens na aba Explorar e envie sua primeira proposta.'
              }
            />
          }
          refreshControl={<RefreshControl refreshing={proposals.isRefetching} onRefresh={() => void proposals.refetch()} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  list: { padding: spacing.lg, flexGrow: 1 },
});
