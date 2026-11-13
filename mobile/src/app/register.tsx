import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { Button, ErrorBanner, TextField } from '@/components/ui';
import { errorText } from '@/lib/dialogs';
import { colors, spacing } from '@/theme';

type Field = 'name' | 'email' | 'neighborhood' | 'password';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [form, setForm] = useState<Record<Field, string>>({ name: '', email: '', neighborhood: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (field: Field) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  function validate() {
    const e: Partial<Record<Field, string>> = {};
    if (form.name.trim().length < 2) e.name = 'Informe seu nome.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'E-mail inválido.';
    if (form.neighborhood.trim().length < 2) e.neighborhood = 'Informe seu bairro.';
    if (form.password.length < 8) e.password = 'Mínimo de 8 caracteres.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setError(null);
    setLoading(true);
    try {
      await signUp({
        name: form.name.trim(),
        email: form.email.trim(),
        neighborhood: form.neighborhood.trim(),
        password: form.password,
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TextField label="Nome" value={form.name} onChangeText={set('name')} error={errors.name} autoComplete="name" />
        <TextField
          label="E-mail"
          value={form.email}
          onChangeText={set('email')}
          error={errors.email}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          label="Bairro"
          value={form.neighborhood}
          onChangeText={set('neighborhood')}
          error={errors.neighborhood}
          hint="Aparece para outras pessoas junto aos seus itens."
        />
        <TextField
          label="Senha"
          value={form.password}
          onChangeText={set('password')}
          error={errors.password}
          secureTextEntry
          autoComplete="new-password"
        />
        <Text style={styles.legal}>
          Sua localização exata nunca é exibida. Outras pessoas veem apenas uma distância aproximada dos seus itens.
        </Text>
        {error ? <ErrorBanner message={error} /> : null}
        <Button title="Criar conta" onPress={submit} loading={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.lg, maxWidth: 480, width: '100%', alignSelf: 'center' },
  legal: { fontSize: 13, color: colors.muted, lineHeight: 18 },
});
