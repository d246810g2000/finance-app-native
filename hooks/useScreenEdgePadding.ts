import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SCREEN_EDGE_MIN } from '../theme';

/** 曲面螢幕 / 打孔螢幕的左右安全留白 */
export function useScreenEdgePadding() {
    const insets = useSafeAreaInsets();
    const horizontal = Math.max(insets.left, insets.right, SCREEN_EDGE_MIN);
    const left = Math.max(insets.left, SCREEN_EDGE_MIN);
    const right = Math.max(insets.right, SCREEN_EDGE_MIN);

    return { horizontal, left, right };
}
