import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { api } from '@/api';
import { useAuth } from '@/auth/auth-context';
import { Button, Card, ErrorBanner, Loading, SectionTitle, TextField } from '@/components/ui';
import { confirm, errorText, notify } from '@/lib/dialogs';
import { colors, spacing } from '@/theme';

export default function ProfileScreen() {
  const { signOut, forgetSession } = useAuth();
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });
  const [name, setName] = useState('');
  const [neighborhood, setNeighborhood] = useState('');

  useEffect(() => {
    if (me.data) {
      setName(me.data.name);
      setNeighborhood(me.data.neighborhood);
    }
  }, [me.data]);

  const save = useMutation({
    mutationFn: () => api.updateMe({ name: name.trim(), neighborhood: neighborhood.trim() }),
    onSuccess: (user) => {
      queryClient.setQueryData(['me'], user);
      notify('Perfil atualizado');
    },
    onError: (err) => notify('Não foi possível salvar', errorText(err)),
  });

  const remove = useMutation({
    mutationFn: api.deleteMe,
    onSuccess: () => forgetSession(),
    onError: (err) => notify('Não foi possível excluir a conta', errorText(err)),
  });

  if (me.isPending) return <Loading />;
  if (me.isError) return <ErrorBanner message={me.error.message} onRetry={me.refetch} />;

  const dirty = name.trim() !== me.data.name || neighborhood.trim() !== me.data.neighborhood;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={{ gap: spacing.lg }}>
        <SectionTitle>Seus dados</SectionTitle>
        <TextField label="Nome" value={name} onChangeText={setName} />
        <TextField label="E-mail" value={me.data.email} editable={false} style={{ color: colors.muted }} />
        <TextField label="Bairro" value={neighborhood} onChangeText={setNeighborhood} />
        <Button
          title="Salvar alterações"
          onPress={() => save.mutate()}
          loading={save.isPending}
          disabled={!dirty || name.trim().length < 2 || neighborhood.trim().length < 2}
        />
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <SectionTitle>Privacidade</SectionTitle>
        <Text style={styles.text}>
          Guardamos a localização do aparelho no momento em que você cadastra um item apenas para calcular distâncias.
          Ela nunca é exibida: outras pessoas veem uma posição aproximada (deslocada até 1 km) e a distância arredondada.
          As fotos têm os metadados (incluindo GPS) removidos. Seu e-mail só é compartilhado quando você aceita uma troca.
        </Text>
      </Card>

      <Button title="Sair" variant="secondary" onPress={signOut} />
      <Button
        title="Excluir minha conta"
        variant="danger"
        loading={remove.isPending}
        onPress={async () => {
          const ok = await confirm(
            'Excluir conta?',
            'Seus itens, fotos, propostas e localizações serão apagados definitivamente. Esta ação não pode ser desfeita.',
            'Excluir',
          );
          if (ok) remove.mutate();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  text: { fontSize: 14, color: colors.muted, lineHeight: 20 },
});
