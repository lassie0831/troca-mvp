import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, type LocalImage } from '@/api';
import { Button, Chip, ErrorBanner, SectionTitle, TextField } from '@/components/ui';
import { MAX_PHOTOS } from '@/config';
import { errorText, notify } from '@/lib/dialogs';
import { parsePriceToCents } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

type Errors = Partial<Record<'title' | 'price' | 'category' | 'photos', string>>;

async function currentPosition(): Promise<{ latitude: number; longitude: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Precisamos da sua localização para mostrar o item a pessoas próximas. Ela nunca é exibida.');
  }
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

export default function NewItemScreen() {
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: Infinity });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<string>();
  const [photos, setPhotos] = useState<LocalImage[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  async function pick(source: 'library' | 'camera') {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return notify('Permissão necessária', 'Autorize o acesso à câmera nas configurações.');
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        ...options,
        allowsMultipleSelection: true,
        selectionLimit: MAX_PHOTOS - photos.length,
      });
    }
    if (result.canceled) return;
    setPhotos((prev) => [...prev, ...result.assets].slice(0, MAX_PHOTOS));
    setErrors((e) => ({ ...e, photos: undefined }));
  }

  function validate(): number | null {
    const e: Errors = {};
    if (title.trim().length < 3) e.title = 'Mínimo de 3 caracteres.';
    const cents = parsePriceToCents(price);
    if (!cents || cents < 100) e.price = 'Informe um valor estimado (mínimo R$ 1).';
    if (!category) e.category = 'Escolha uma categoria.';
    if (photos.length === 0) e.photos = 'Adicione ao menos uma foto.';
    setErrors(e);
    return Object.keys(e).length ? null : cents;
  }

  async function submit() {
    const priceCents = validate();
    if (!priceCents) return;
    setError(null);
    try {
      setStep('Obtendo localização…');
      const position = await currentPosition();
      setStep('Salvando item…');
      const item = await api.createItem({
        title: title.trim(),
        description: description.trim() || undefined,
        priceCents,
        category: category!,
        ...position,
      });

      let failed = 0;
      for (const [i, photo] of photos.entries()) {
        setStep(`Enviando foto ${i + 1} de ${photos.length}…`);
        await api.uploadPhoto(item.id, photo).catch(() => failed++);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
      ]);
      if (failed) notify('Item salvo', `${failed} foto(s) não puderam ser enviadas. Você pode adicioná-las na página do item.`);
      router.replace({ pathname: '/items/[id]', params: { id: item.id } });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setStep(null);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={{ gap: spacing.sm }}>
          <SectionTitle>Fotos ({photos.length}/{MAX_PHOTOS})</SectionTitle>
          <ScrollView horizontal contentContainerStyle={{ gap: spacing.sm }} showsHorizontalScrollIndicator={false}>
            {photos.map((p, i) => (
              <Pressable
                key={p.uri}
                onPress={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                accessibilityLabel="Remover foto"
                style={styles.photo}>
                <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <View style={styles.remove}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>×</Text>
                </View>
              </Pressable>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <View style={{ gap: spacing.sm }}>
                <Pressable style={[styles.photo, styles.add]} onPress={() => pick('library')}>
                  <Text style={styles.addText}>Galeria</Text>
                </Pressable>
              </View>
            ) : null}
            {photos.length < MAX_PHOTOS && Platform.OS !== 'web' ? (
              <Pressable style={[styles.photo, styles.add]} onPress={() => pick('camera')}>
                <Text style={styles.addText}>Câmera</Text>
              </Pressable>
            ) : null}
          </ScrollView>
          {errors.photos ? <Text style={styles.error}>{errors.photos}</Text> : null}
        </View>

        <TextField label="Título" value={title} onChangeText={setTitle} error={errors.title} maxLength={80} placeholder="Ex.: Sofá 3 lugares" />
        <TextField
          label="Valor estimado (R$)"
          value={price}
          onChangeText={setPrice}
          error={errors.price}
          keyboardType="decimal-pad"
          placeholder="Ex.: 1.200"
          hint="Usado para encontrar trocas de valor parecido (±20%)."
        />
        <View style={{ gap: spacing.sm }}>
          <SectionTitle>Categoria</SectionTitle>
          <View style={styles.categories}>
            {(categories.data ?? []).map((c) => (
              <Chip key={c.slug} label={c.label} selected={c.slug === category} onPress={() => setCategory(c.slug)} />
            ))}
          </View>
          {categories.isError ? <Text style={styles.error}>Não foi possível carregar as categorias.</Text> : null}
          {errors.category ? <Text style={styles.error}>{errors.category}</Text> : null}
        </View>
        <TextField
          label="Descrição (opcional)"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={1000}
          placeholder="Estado de conservação, medidas, marca…"
        />

        <View style={styles.privacy}>
          <Text style={styles.privacyText}>
            📍 Vamos registrar a localização do seu aparelho agora. Ela fica guardada só no servidor: outras pessoas veem
            apenas uma distância aproximada.
          </Text>
        </View>

        {error ? <ErrorBanner message={error} /> : null}
        <Button title={step ?? 'Publicar item'} onPress={submit} loading={!!step} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  photo: { width: 96, height: 96, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.neutralSoft },
  add: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary },
  addText: { color: colors.primaryDark, fontWeight: '600' },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { color: colors.danger, fontSize: 12 },
  privacy: { backgroundColor: colors.primarySoft, padding: spacing.md, borderRadius: radius.md },
  privacyText: { color: colors.primaryDark, fontSize: 13, lineHeight: 18 },
});
