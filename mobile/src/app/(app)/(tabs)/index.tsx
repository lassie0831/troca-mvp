import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api';
import { ItemCard } from '@/components/item-card';
import { Button, Chip, EmptyState, ErrorBanner, Loading } from '@/components/ui';
import { DEFAULT_RADIUS_KM, PRICE_TOLERANCE_PCT, RADIUS_OPTIONS_KM } from '@/config';
import { formatPrice } from '@/lib/format';
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus';
import { colors, spacing } from '@/theme';

export default function FeedScreen() {
  const myItems = useQuery({ queryKey: ['items', 'mine'], queryFn: api.myItems });
  const active = (myItems.data ?? []).filter((i) => i.status === 'active');

  const [selectedId, setSelectedId] = useState<string>();
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  const myItemId = active.some((i) => i.id === selectedId) ? selectedId : active[0]?.id;

  const feed = useInfiniteQuery({
    queryKey: ['feed', myItemId, radiusKm],
    enabled: !!myItemId,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.feed({ myItemId, radiusKm, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  useRefreshOnFocus(feed.refetch);

  if (myItems.isPending) return <Loading />;
  if (myItems.isError) return <ErrorBanner message={myItems.error.message} onRetry={myItems.refetch} />;

  if (active.length === 0) {
    return (
      <EmptyState
        title="Cadastre um item para começar"
        message={`Mostramos itens de outras pessoas com valor parecido com o seu (±${PRICE_TOLERANCE_PCT}%), ordenados por distância.`}
        action={<Button title="Cadastrar item" onPress={() => router.push('/items/new')} />}
      />
    );
  }

  const entries = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const window = feed.data?.pages[0]?.priceWindow;

  const header = (
    <View style={styles.header}>
      <Text style={styles.label}>Trocar meu item</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {active.map((item) => (
          <Chip
            key={item.id}
            label={`${item.title} · ${formatPrice(item.priceCents)}`}
            selected={item.id === myItemId}
            onPress={() => setSelectedId(item.id)}
          />
        ))}
      </ScrollView>

      <Text style={styles.label}>Distância máxima</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {RADIUS_OPTIONS_KM.map((km) => (
          <Chip key={km} label={`${km} km`} selected={km === radiusKm} onPress={() => setRadiusKm(km)} />
        ))}
      </ScrollView>

      {window ? (
        <Text style={styles.window}>
          Valores entre {formatPrice(window.minCents)} e {formatPrice(window.maxCents)} (±{PRICE_TOLERANCE_PCT}%)
        </Text>
      ) : null}
    </View>
  );

  return (
    <FlatList
      data={entries}
      keyExtractor={(i) => i.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <ItemCard
          item={item}
          distanceKm={item.distanceKm}
          alreadyProposed={item.alreadyProposed}
          onPress={() =>
            router.push({ pathname: '/items/[id]', params: { id: item.id, distanceKm: String(item.distanceKm), offerId: myItemId } })
          }
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      ListEmptyComponent={
        feed.isPending ? (
          <Loading />
        ) : feed.isError ? (
          <ErrorBanner message={feed.error.message} onRetry={feed.refetch} />
        ) : (
          <EmptyState
            title="Nenhuma troca compatível por aqui"
            message="Aumente a distância ou cadastre outros itens. Novos itens aparecem todos os dias."
          />
        )
      }
      onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
      onEndReachedThreshold={0.5}
      ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator style={{ margin: spacing.lg }} /> : undefined}
      refreshControl={
        <RefreshControl
          refreshing={feed.isRefetching && !feed.isFetchingNextPage}
          onRefresh={() => {
            myItems.refetch();
            feed.refetch();
          }}
          tintColor={colors.primary}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { gap: spacing.sm, paddingBottom: spacing.xs },
  window: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
});
