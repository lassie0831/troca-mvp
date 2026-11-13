import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { api, resolveUrl, type Item } from '@/api';
import { Badge, Button, Card, Chip, EmptyState, ErrorBanner, Loading, SectionTitle, TextField } from '@/components/ui';
import { MAX_PHOTOS, PRICE_TOLERANCE_PCT } from '@/config';
import { confirm, errorText, notify } from '@/lib/dialogs';
import { formatDistance, formatPrice, isPriceCompatible, ITEM_STATUS_LABEL } from '@/lib/format';
import { colors, spacing } from '@/theme';

export default function ItemScreen() {
  const { id, distanceKm, offerId } = useLocalSearchParams<{ id: string; distanceKm?: string; offerId?: string }>();
  const item = useQuery({ queryKey: ['item', id], queryFn: () => api.item(id) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: Infinity });

  if (item.isPending) return <Loading />;
  if (item.isError) return <ErrorBanner message={item.error.message} onRetry={item.refetch} />;

  const it = item.data;
  const categoryLabel = categories.data?.find((c) => c.slug === it.category)?.label ?? it.category;

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <Stack.Screen options={{ title: it.title }} />
      <Gallery item={it} />
      <View style={styles.content}>
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.title}>{it.title}</Text>
          <Text style={styles.price}>{formatPrice(it.priceCents)}</Text>
          <Text style={styles.meta}>
            {categoryLabel}
            {distanceKm ? ` · ≈ ${formatDistance(Number(distanceKm))}` : ''}
            {it.isMine ? '' : ` · ${it.owner.name}, ${it.owner.neighborhood}`}
          </Text>
          {it.isMine ? <Badge label={ITEM_STATUS_LABEL[it.status]} tone={it.status === 'active' ? 'success' : 'warning'} /> : null}
        </View>
        {it.description ? <Text style={styles.description}>{it.description}</Text> : null}

        {it.isMine ? <OwnerActions item={it} /> : <ProposeTrade item={it} preselectedId={offerId} />}
      </View>
    </ScrollView>
  );
}

function Gallery({ item }: { item: Item }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 640);
  if (item.photos.length === 0) {
    return (
      <View style={[styles.noPhoto, { height: w * 0.6 }]}>
        <Text style={{ color: colors.muted }}>Sem fotos</Text>
      </View>
    );
  }
  return (
    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ alignSelf: 'center', width: w }}>
      {item.photos.map((p) => (
        <Image
          key={p.id}
          source={{ uri: resolveUrl(p.url) }}
          placeholder={{ uri: resolveUrl(p.thumbUrl) }}
          style={{ width: w, height: w * 0.75, backgroundColor: colors.neutralSoft }}
          contentFit="cover"
          transition={200}
        />
      ))}
    </ScrollView>
  );
}

function OwnerActions({ item }: { item: Item }) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['item', item.id] }),
      queryClient.invalidateQueries({ queryKey: ['items', 'mine'] }),
      queryClient.invalidateQueries({ queryKey: ['feed'] }),
    ]);

  const addPhoto = useMutation({
    mutationFn: async () => {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled) return;
      await api.uploadPhoto(item.id, result.assets[0]!);
    },
    onSuccess: refresh,
    onError: (err) => notify('Não foi possível enviar a foto', errorText(err)),
  });

  const archive = useMutation({
    mutationFn: () => api.archiveItem(item.id),
    onSuccess: async () => {
      await refresh();
      router.back();
    },
    onError: (err) => notify('Não foi possível remover', errorText(err)),
  });

  if (item.status === 'traded') {
    return <Text style={styles.meta}>Este item já foi trocado. 🎉</Text>;
  }

  return (
    <View style={{ gap: spacing.md }}>
      {item.status === 'reserved' ? (
        <Card>
          <Text style={styles.meta}>
            Este item está reservado em uma troca aceita. Conclua ou cancele a troca na aba Propostas.
          </Text>
        </Card>
      ) : null}
      {item.photos.length < MAX_PHOTOS ? (
        <Button title="Adicionar foto" variant="secondary" onPress={() => addPhoto.mutate()} loading={addPhoto.isPending} />
      ) : null}
      {item.status === 'active' ? (
        <Button
          title="Remover item"
          variant="danger"
          loading={archive.isPending}
          onPress={async () => {
            if (await confirm('Remover item?', 'Ele sai do app e propostas abertas com ele são encerradas.', 'Remover')) archive.mutate();
          }}
        />
      ) : null}
    </View>
  );
}

function ProposeTrade({ item, preselectedId }: { item: Item; preselectedId?: string }) {
  const queryClient = useQueryClient();
  const mine = useQuery({ queryKey: ['items', 'mine'], queryFn: api.myItems });
  const candidates = (mine.data ?? []).filter((i) => i.status === 'active');
  const compatible = candidates.filter((i) => isPriceCompatible(i.priceCents, item.priceCents, PRICE_TOLERANCE_PCT));
  const [selected, setSelected] = useState<string | undefined>(preselectedId);
  const [message, setMessage] = useState('');
  const offeredId = compatible.some((i) => i.id === selected) ? selected : compatible[0]?.id;

  const send = useMutation({
    mutationFn: () => api.createProposal({ offeredItemId: offeredId!, requestedItemId: item.id, message: message.trim() || undefined }),
    onSuccess: async (proposal) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['proposals'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
      router.replace({ pathname: '/proposals/[id]', params: { id: proposal.id } });
    },
    onError: (err) => notify('Não foi possível enviar', errorText(err)),
  });

  if (item.status !== 'active') {
    return <Text style={styles.meta}>Este item não está mais disponível para troca.</Text>;
  }
  if (mine.isPending) return <Loading />;

  return (
    <Card style={{ gap: spacing.md }}>
      <SectionTitle>Propor troca</SectionTitle>
      {compatible.length === 0 ? (
        <EmptyState
          title="Nenhum item seu é compatível"
          message={`A troca exige valores estimados com diferença de até ${PRICE_TOLERANCE_PCT}%.`}
          action={<Button title="Cadastrar item" variant="secondary" onPress={() => router.push('/items/new')} />}
        />
      ) : (
        <>
          <Text style={styles.meta}>Qual item seu você oferece?</Text>
          <View style={styles.options}>
            {compatible.map((i) => (
              <Chip key={i.id} label={`${i.title} · ${formatPrice(i.priceCents)}`} selected={i.id === offeredId} onPress={() => setSelected(i.id)} />
            ))}
          </View>
          <TextField
            label="Mensagem (opcional)"
            value={message}
            onChangeText={setMessage}
            maxLength={280}
            multiline
            placeholder="Ex.: Posso buscar no fim de semana."
          />
          <Button title="Enviar proposta" onPress={() => send.mutate()} loading={send.isPending} disabled={!offeredId} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  price: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
  meta: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  description: { fontSize: 15, color: colors.text, lineHeight: 22 },
  noPhoto: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutralSoft },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

