
import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFinance } from '../context/FinanceContext';
import { readFileContent, parseCsvData } from '../services/financeService';
import { RawRecord } from '../types';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';

interface UploadSectionProps {
    onUploadSuccess?: () => void;
}

export default function UploadSection({ onUploadSuccess }: UploadSectionProps) {
    // @ts-ignore
    const { loadRecords, clearRecords, records, isLoading } = useFinance();
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
    const [selectedFileObj, setSelectedFileObj] = useState<any>(null); // Store the actual file object for Web support
    const [encoding, setEncoding] = useState<'utf-8' | 'big5'>('utf-8');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successCount, setSuccessCount] = useState<number | null>(null);

    const handlePickFile = useCallback(async () => {
        setError(null);
        setSuccessCount(null);
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
            });
            if (!result.canceled) {
                const file: any = result.assets ? result.assets[0] : result;
                if (file.uri) {
                    setSelectedFileName(file.name || 'selected_file');
                    setSelectedFileUri(file.uri);
                    // document-picker on web returns a "file" property which holds the native JavaScript File instance
                    setSelectedFileObj(file.file || file);
                }
            }
        } catch (e: any) {
            setError(`無法選擇文件: ${e.message || '未知錯誤'}`);
        }
    }, []);

    const handleParse = useCallback(async () => {
        const targetFile = selectedFileObj || selectedFileUri;
        if (!targetFile) return;
        setLoading(true);
        setError(null);
        setSuccessCount(null);
        try {
            // Pass the whole object if available (web), otherwise just the uri (native)
            const csvText = await readFileContent(targetFile, encoding);
            const records: RawRecord[] = parseCsvData(csvText);
            if (records.length === 0) {
                setError('未讀取到任何記錄，請確認 CSV 格式是否正確');
                setLoading(false);
                return;
            }
            clearRecords();
            loadRecords(records);
            setSuccessCount(records.length);
            if (onUploadSuccess) setTimeout(() => onUploadSuccess(), 1200);
        } catch (e: any) {
            setError(`解析失敗：${e.message || '未知錯誤'}`);
        }
        setLoading(false);
    }, [selectedFileUri, selectedFileObj, encoding, clearRecords, loadRecords, onUploadSuccess]);

    return (
        <View style={styles.container}>
            <Animated.View entering={FadeInDown.springify()}>
                {/* Upload Area */}
                <Pressable
                    style={({ pressed }) => [styles.uploadArea, pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : {}]}
                    onPress={handlePickFile}
                >
                    <Text style={styles.uploadIcon}>📂</Text>
                    <Text style={styles.uploadTitle}>選擇 CSV 檔案</Text>
                    <Text style={styles.uploadSubtitle}>支援 AndroMoney 匯出格式</Text>
                </Pressable>

                {/* Selected file */}
                {selectedFileName ? (
                    <Animated.View entering={FadeInUp.springify()} style={styles.fileInfo}>
                        <Text style={styles.fileIcon}>📄</Text>
                        <Text style={styles.fileName} numberOfLines={1}>{selectedFileName}</Text>
                        <Pressable onPress={() => { setSelectedFileName(null); setSelectedFileUri(null); setSelectedFileObj(null); setError(null); setSuccessCount(null); }}>
                            <Text style={styles.fileRemove}>✕</Text>
                        </Pressable>
                    </Animated.View>
                ) : null}

                {/* Encoding */}
                <View style={styles.encodingSection}>
                    <Text style={styles.encodingLabel}>編碼格式</Text>
                    <View style={styles.encodingToggle}>
                        {(['utf-8', 'big5'] as const).map(enc => (
                            <Pressable key={enc} style={[styles.encodingBtn, encoding === enc ? styles.encodingBtnActive : null]} onPress={() => setEncoding(enc)}>
                                <Text style={[styles.encodingBtnText, encoding === enc ? styles.encodingBtnTextActive : null]}>
                                    {enc === 'utf-8' ? 'UTF-8' : 'Big-5'}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>


                {/* Existing Data Notice */}
                {!successCount && records.length > 0 && !selectedFileName ? (
                    <Animated.View entering={FadeInDown.springify()} style={styles.existingDataCard}>
                        <Text style={styles.existingDataText}>
                            📊 目前已有 {records.length.toLocaleString()} 筆資料
                        </Text>
                    </Animated.View>
                ) : null}

                {/* Upload Button */}
                {successCount === null && (
                    <Pressable
                        style={({ pressed }) => [
                            styles.uploadBtn,
                            !selectedFileUri || loading ? styles.uploadBtnDisabled : null,
                            pressed && selectedFileUri && !loading ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : {}
                        ]}
                        onPress={handleParse}
                        disabled={!selectedFileUri || loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={[styles.uploadBtnText, (!selectedFileUri || loading) && styles.uploadBtnTextDisabled]}>
                                {records.length > 0 ? '🔄 重新載入資料' : '🚀 載入資料'}
                            </Text>
                        )}
                    </Pressable>
                )}

                {/* Error */}
                {error ? (
                    <Animated.View entering={FadeInUp.springify()} style={styles.errorCard}>
                        <Text style={styles.errorText}>⚠️ {error}</Text>
                    </Animated.View>
                ) : null}

                {/* Success */}
                {successCount !== null ? (
                    <Animated.View entering={FadeInUp.springify()} style={styles.successCard}>
                        <Text style={styles.successText}>✅ 已載入 {successCount.toLocaleString()} 筆記錄</Text>
                    </Animated.View>
                ) : null}
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg, padding: 24, justifyContent: 'flex-start', paddingTop: 40 },
    // Upload Area
    uploadArea: { backgroundColor: COLORS.card, borderWidth: 2, borderColor: COLORS.accentBorder, borderStyle: 'dashed', borderRadius: 24, paddingVertical: 60, alignItems: 'center', ...SHADOWS.md },
    uploadIcon: { fontSize: 64, marginBottom: 20 },
    uploadTitle: { ...TYPOGRAPHY.h2, marginBottom: 8 },
    uploadSubtitle: { ...TYPOGRAPHY.body, color: COLORS.textMuted },
    // File Info
    fileInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 24, backgroundColor: COLORS.accentLight, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: COLORS.accentBorder, ...SHADOWS.sm },
    fileIcon: { fontSize: 24, marginRight: 12 },
    fileName: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.textPrimary, flex: 1 },
    fileRemove: { color: COLORS.textMuted, fontSize: 18, padding: 8, fontWeight: '800' },
    // Encoding
    encodingSection: { marginTop: 32 },
    encodingLabel: { ...TYPOGRAPHY.body, fontWeight: '700', marginBottom: 12 },
    encodingToggle: { flexDirection: 'row', backgroundColor: COLORS.bg, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.cardBorder, ...SHADOWS.sm },
    encodingBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
    encodingBtnActive: { backgroundColor: COLORS.accent, borderRadius: 14, margin: 2, ...SHADOWS.sm },
    encodingBtnText: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.textMuted },
    encodingBtnTextActive: { color: '#fff' },
    // Upload Button
    uploadBtn: { backgroundColor: COLORS.accent, padding: 20, borderRadius: 20, alignItems: 'center', marginTop: 40, ...SHADOWS.lg },
    uploadBtnDisabled: { backgroundColor: 'rgba(226, 232, 240, 0.4)', shadowOpacity: 0, borderWidth: 1, borderColor: COLORS.cardBorder },
    uploadBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
    uploadBtnTextDisabled: { color: COLORS.textSecondary },
    // Messages
    errorCard: { marginTop: 24, backgroundColor: COLORS.redLight, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: COLORS.red, ...SHADOWS.sm },
    errorText: { ...TYPOGRAPHY.body, color: COLORS.red, fontWeight: '600' },
    successCard: { marginTop: 24, backgroundColor: COLORS.greenLight, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: COLORS.green, ...SHADOWS.sm },
    successText: { ...TYPOGRAPHY.body, color: COLORS.green, fontWeight: '700' },
    // Existing Data Info
    existingDataCard: { marginTop: 24, backgroundColor: '#EFF6FF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#BFDBFE', ...SHADOWS.sm },
    existingDataText: { ...TYPOGRAPHY.body, color: '#1E3A8A', fontWeight: '700', textAlign: 'center' },
});
