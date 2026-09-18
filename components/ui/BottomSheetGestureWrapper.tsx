import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Reanimated from 'react-native-reanimated';
import { useBottomSheetSwipe } from './useBottomSheetSwipe';

interface BottomSheetGestureWrapperProps {
    swipe: ReturnType<typeof useBottomSheetSwipe>;
    style?: StyleProp<ViewStyle>;
    header: React.ReactNode;
    children: React.ReactNode;
}

/** 正確嵌套 RNGH 手勢層：外層 sheet、內層 header 拖曳區 */
export default function BottomSheetGestureWrapper({
    swipe,
    style,
    header,
    children,
}: BottomSheetGestureWrapperProps) {
    const headerNode = (
        <GestureDetector gesture={swipe.headerGesture}>
            <View style={styles.dragHeader} collapsable={false}>
                {header}
            </View>
        </GestureDetector>
    );

    // 列表 Modal：不掛 sheet pan，避免與 FlashList/ScrollView 搶手勢
    if (swipe.disableSheetSwipe) {
        return (
            <Reanimated.View style={[style, swipe.sheetAnimatedStyle]}>
                {headerNode}
                {children}
            </Reanimated.View>
        );
    }

    return (
        <GestureDetector gesture={swipe.sheetGesture}>
            <Reanimated.View style={[style, swipe.sheetAnimatedStyle]}>
                {headerNode}
                {children}
            </Reanimated.View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    dragHeader: {
        width: '100%',
        zIndex: 2,
    },
});
