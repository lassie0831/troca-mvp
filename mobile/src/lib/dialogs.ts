import { Alert, Platform } from 'react-native';

/** Cross-platform confirmation dialog (Alert.alert buttons are not supported on web). */
export function confirm(title: string, message: string, confirmLabel = 'Confirmar'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Algo deu errado. Tente novamente.';
}
