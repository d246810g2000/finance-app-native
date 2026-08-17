import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Dimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    type SharedValue,
} from 'react-native-reanimated';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 850;

interface BottomSheetSwipeOptions {
    /** 禁用列表內容區域的下滑手勢（僅頂部 Header / HandleBar 允許下滑關閉），適用於包含 Swipeable 列表的 Modal */
    disableSheetSwipe?: boolean;
}

function useDismissActions(
    translateY: SharedValue<number>,
    onCloseRef: React.MutableRefObject<() => void>,
) {
    const close = useCallback(() => {
        onCloseRef.current();
    }, [onCloseRef]);

    const dismissSheet = useCallback(() => {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 220 }, (finished) => {
            if (finished) {
                // 維持在螢幕外關閉，避免重置 translateY 造成彈窗閃回原位
                runOnJS(close)();
            }
        });
    }, [close, translateY]);

    const snapBack = useCallback(() => {
        translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
    }, [translateY]);

    return { dismissSheet, snapBack };
}

/**
 * 底部彈窗下滑關閉手勢（RNGH + Reanimated）。
 * - headerGesture：套在 handle + 標題列，隨時可下滑關閉
 * - sheetGesture：套在外層 sheet；列表捲到頂部時也可下滑關閉
 *
 * 請搭配 BottomSheetGestureWrapper，且 Modal 內需有 GestureHandlerRootView（ModalBackdrop 已內建）。
 */
export function useBottomSheetSwipe(
    onClose: () => void,
    visible: boolean,
    options: BottomSheetSwipeOptions = {},
) {
    const translateY = useSharedValue(0);
    const isAtTop = useSharedValue(true);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const disableSheetSwipe = !!options.disableSheetSwipe;
    const { dismissSheet, snapBack } = useDismissActions(translateY, onCloseRef);

    useEffect(() => {
        if (visible) {
            isAtTop.value = true;
            // 自訂進場：從底部滑入，避免與 Modal animationType 衝突
            translateY.value = SCREEN_HEIGHT;
            translateY.value = withTiming(0, { duration: 280 });
        }
    }, [visible, isAtTop, translateY]);

    const headerGesture = useMemo(() => Gesture.Pan()
        .activeOffsetY([0, 12])
        .failOffsetX([-24, 24])
        .onUpdate((e) => {
            'worklet';
            if (e.translationY > 0) {
                translateY.value = e.translationY;
            }
        })
        .onEnd((e) => {
            'worklet';
            if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
                runOnJS(dismissSheet)();
            } else {
                runOnJS(snapBack)();
            }
        }),
    [dismissSheet, snapBack, translateY]);

    const sheetGesture = useMemo(() => {
        if (disableSheetSwipe) {
            return Gesture.Native().enabled(false);
        }
        return Gesture.Pan()
            .activeOffsetY([12, 500])
            .failOffsetX([-18, 18])
            .onUpdate((e) => {
                'worklet';
                if (isAtTop.value && e.translationY > 0) {
                    translateY.value = e.translationY;
                }
            })
            .onEnd((e) => {
                'worklet';
                if (!isAtTop.value) {
                    runOnJS(snapBack)();
                    return;
                }
                if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
                    runOnJS(dismissSheet)();
                } else {
                    runOnJS(snapBack)();
                }
            });
    }, [disableSheetSwipe, dismissSheet, isAtTop, snapBack, translateY]);

    const sheetAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
        isAtTop.value = event.nativeEvent.contentOffset.y <= 2;
    }, [isAtTop]);

    return {
        headerGesture,
        sheetGesture,
        sheetAnimatedStyle,
        handleScroll,
        scrollEventThrottle: 16 as const,
    };
}
