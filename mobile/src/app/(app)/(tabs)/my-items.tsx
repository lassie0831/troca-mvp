import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { api } from '@/api';
import { ItemCard } from '@/components/item-card';
import { Button, EmptyState, ErrorBanner, Loading } from '@/components/ui';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { colors, spacing } from '@/theme';

export default function MyItemsScreen() {
  const items = useQuery({ queryKey: ['items', 'mine'], queryFn: api.myItems });
  useRefreshOnFocus(items.refetch);

  if (items.isPending) return <Loading />;
  if (items.isError) return <ErrorBanner message={items.error.message} onRetry={() => void items.refetch()} />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items.data}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ItemCard item={item} showStatus onPress={() => router.push({ pathname: '/items/[id]', params: { id: item.id } })} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          <EmptyState
            title="Você ainda não cadastrou itens"
            message="Fotografe algo que você não usa mais e descubra o que pode receber em troca."
          />
        }
        refreshControl={<RefreshControl refreshing={items.isRefetching} onRefresh={() => void items.refetch()} tintColor={colors.primary} />}
      />
      <View style={styles.footer}>
        <Button title="+ Cadastrar item" onPress={() => router.push('/items/new')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.card },
});
