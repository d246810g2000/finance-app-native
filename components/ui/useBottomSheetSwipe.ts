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

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 850;
const HORIZONTAL_DISMISS_DISTANCE = 110;
const HORIZONTAL_DISMISS_VELOCITY = 800;

interface BottomSheetSwipeOptions {
    /** 允許左右滑動關閉（DetailModal 等） */
    enableHorizontalDismiss?: boolean;
}

function useDismissActions(
    translateY: SharedValue<number>,
    translateX: SharedValue<number>,
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

    const dismissSheetHorizontal = useCallback((dx: number) => {
        translateX.value = withTiming(dx > 0 ? SCREEN_WIDTH : -SCREEN_WIDTH, { duration: 220 }, (finished) => {
            if (finished) {
                runOnJS(close)();
            }
        });
    }, [close, translateX]);

    const snapBack = useCallback(() => {
        translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
        translateX.value = withSpring(0, { damping: 20, stiffness: 220 });
    }, [translateX, translateY]);

    return { dismissSheet, dismissSheetHorizontal, snapBack };
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
    const translateX = useSharedValue(0);
    const isAtTop = useSharedValue(true);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const enableHorizontalDismiss = !!options.enableHorizontalDismiss;
    const { dismissSheet, dismissSheetHorizontal, snapBack } = useDismissActions(translateY, translateX, onCloseRef);

    useEffect(() => {
        if (visible) {
            isAtTop.value = true;
            translateX.value = 0;
            // 自訂進場：從底部滑入，避免與 Modal animationType 衝突
            translateY.value = SCREEN_HEIGHT;
            translateY.value = withTiming(0, { duration: 280 });
        }
    }, [visible, isAtTop, translateX, translateY]);

    const headerGesture = useMemo(() => Gesture.Pan()
        .activeOffsetY([-4, 12])
        .failOffsetX([-28, 28])
        .onUpdate((e) => {
            'worklet';
            if (
                enableHorizontalDismiss &&
                Math.abs(e.translationX) > Math.abs(e.translationY) &&
                Math.abs(e.translationX) > 8
            ) {
                translateX.value = e.translationX;
                return;
            }
            if (e.translationY > 0) {
                translateY.value = e.translationY;
            }
        })
        .onEnd((e) => {
            'worklet';
            if (
                enableHorizontalDismiss &&
                (Math.abs(e.translationX) > HORIZONTAL_DISMISS_DISTANCE || Math.abs(e.velocityX) > HORIZONTAL_DISMISS_VELOCITY)
            ) {
                runOnJS(dismissSheetHorizontal)(e.translationX);
                return;
            }
            if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
                runOnJS(dismissSheet)();
            } else {
                runOnJS(snapBack)();
            }
        }),
    [dismissSheet, dismissSheetHorizontal, enableHorizontalDismiss, snapBack, translateX, translateY]);

    const sheetGesture = useMemo(() => Gesture.Pan()
        .manualActivation(true)
        .activeOffsetY([-4, 12])
        .failOffsetX([-28, 28])
        .onTouchesMove((_, state) => {
            if (isAtTop.value) {
                state.activate();
            } else {
                state.fail();
            }
        })
        .onUpdate((e) => {
            'worklet';
            if (
                enableHorizontalDismiss &&
                Math.abs(e.translationX) > Math.abs(e.translationY) &&
                Math.abs(e.translationX) > 8
            ) {
                translateX.value = e.translationX;
                return;
            }
            if (e.translationY > 0) {
                translateY.value = e.translationY;
            }
        })
        .onEnd((e) => {
            'worklet';
            if (!isAtTop.value) {
                runOnJS(snapBack)();
                return;
            }
            if (
                enableHorizontalDismiss &&
                (Math.abs(e.translationX) > HORIZONTAL_DISMISS_DISTANCE || Math.abs(e.velocityX) > HORIZONTAL_DISMISS_VELOCITY)
            ) {
                runOnJS(dismissSheetHorizontal)(e.translationX);
                return;
            }
            if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
                runOnJS(dismissSheet)();
            } else {
                runOnJS(snapBack)();
            }
        }),
    [dismissSheet, dismissSheetHorizontal, enableHorizontalDismiss, isAtTop, snapBack, translateX, translateY]);

    const sheetAnimatedStyle = useAnimatedStyle(() => ({
        transform: enableHorizontalDismiss
            ? [{ translateY: translateY.value }, { translateX: translateX.value }]
            : [{ translateY: translateY.value }],
    }), [enableHorizontalDismiss]);

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
