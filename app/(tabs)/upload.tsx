
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import UploadSection from '../../components/UploadSection';

export default function UploadScreen() {
    return (
        <View style={styles.container}>
            <UploadSection onUploadSuccess={() => router.replace('/(tabs)')} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0F1A',
    },
});
