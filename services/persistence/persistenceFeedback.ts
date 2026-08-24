import { Alert } from 'react-native';

export function showPersistenceIssueAlert(message: string): void {
  Alert.alert('儲存錯誤', message);
}
