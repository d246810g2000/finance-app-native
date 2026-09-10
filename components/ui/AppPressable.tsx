import React, { useCallback, type ComponentProps } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { hapticLight, hapticSelection } from '../../utils/haptics';

type HapticKind = 'selection' | 'light' | 'none';

type AppPressableProps = Omit<ComponentProps<typeof Pressable>, 'style'> & {
  style?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  /** 預設 selection；導覽／開關可用 light；靜音用 none */
  haptic?: HapticKind;
  /** 按下時縮放（預設 0.98；設 1 關閉） */
  pressScale?: number;
};

/**
 * 統一觸控回饋：opacity + 輕微 scale + haptic。
 * 動畫只動 transform／opacity，避免 layout thrash。
 */
export default function AppPressable({
  onPress,
  onPressIn,
  style,
  pressedStyle,
  haptic = 'selection',
  pressScale = 0.98,
  disabled,
  children,
  ...rest
}: AppPressableProps) {
  const handlePressIn = useCallback(
    (event: Parameters<NonNullable<ComponentProps<typeof Pressable>['onPressIn']>>[0]) => {
      if (!disabled) {
        if (haptic === 'selection') hapticSelection();
        else if (haptic === 'light') hapticLight();
      }
      onPressIn?.(event);
    },
    [disabled, haptic, onPressIn],
  );

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      style={({ pressed }) => [
        styles.base,
        style,
        pressed && !disabled && pressScale !== 1
          ? { opacity: 0.88, transform: [{ scale: pressScale }] }
          : null,
        pressed && !disabled ? pressedStyle : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    // Keep identity for StyleSheet composition; consumers supply layout.
  },
});
