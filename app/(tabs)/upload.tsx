import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import UploadSection from '../../components/UploadSection';
import { useAppTheme } from '../../context/ThemeContext';

export default function UploadScreen() {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.container}>
            <UploadSection onUploadSuccess={() => router.replace('/(tabs)')} />
        </View>
    );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.bg,
        },
    });
