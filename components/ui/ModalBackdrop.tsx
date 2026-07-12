import React from 'react';
import { View, StyleSheet, Platform, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppColors } from '../../theme';

interface ModalBackdropProps {
    colors: AppColors;
    children: React.ReactNode;
    style?: ViewStyle;
    placement?: 'bottom' | 'center';
    isDark?: boolean;
}

export default function ModalBackdrop({
    colors,
    children,
    style,
    placement = 'bottom',
    isDark = false,
}: ModalBackdropProps) {
    const overlayStyle = placement === 'center' ? styles.centerOverlay : styles.bottomOverlay;

    // Modal 在 Android 會脫離 App 的 GestureHandlerRootView，手勢必須在 Modal 內再包一層
    const content = (
        <GestureHandlerRootView style={[styles.fullScreen, overlayStyle, style]}>
            {children}
        </GestureHandlerRootView>
    );

    if (Platform.OS === 'android') {
        return (
            <View style={[styles.fullScreen, { backgroundColor: colors.blackOverlay }]}>
                {content}
            </View>
        );
    }

    return (
        <BlurView
            intensity={30}
            tint={isDark ? 'dark' : 'light'}
            style={styles.fullScreen}
        >
            {content}
        </BlurView>
    );
}

const styles = StyleSheet.create({
    fullScreen: {
        flex: 1,
    },
    bottomOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    centerOverlay: {
        flex: 1,
        justifyContent: 'center',
        padding: 20,
    },
});
