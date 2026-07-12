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
    return (
        <GestureDetector gesture={swipe.sheetGesture}>
            <Reanimated.View style={[style, swipe.sheetAnimatedStyle]}>
                <GestureDetector gesture={swipe.headerGesture}>
                    <View style={styles.dragHeader} collapsable={false}>
                        {header}
                    </View>
                </GestureDetector>
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
