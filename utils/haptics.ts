import * as Haptics from 'expo-haptics';

const isWeb = process.env.EXPO_OS === 'web';

/** 輕微選擇回饋：Tab、Segment、Chips、月曆格 */
export function hapticSelection() {
  if (isWeb) return;
  void Haptics.selectionAsync().catch(() => undefined);
}

/** 微撞擊：日期箭頭、Switch */
export function hapticLight() {
  if (isWeb) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** 中等撞擊：對帳確認等重要操作 */
export function hapticMedium() {
  if (isWeb) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

/** 成功通知：儲存／匯入完成 */
export function hapticSuccess() {
  if (isWeb) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
