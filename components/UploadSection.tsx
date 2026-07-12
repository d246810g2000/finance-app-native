
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFinance } from '../context/FinanceContext';
import { readFileContent, parseCsvData, findUnmappedAccounts } from '../services/financeService';
import { RawRecord, CustomAccountMappings } from '../types';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { AppColors, SHADOWS } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import AccountMappingModal from './account/AccountMappingModal';

interface UploadSectionProps {
    onUploadSuccess?: () => void;
}

export default function UploadSection({ onUploadSuccess }: UploadSectionProps) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const { loadRecords, clearRecords, records, isLoading, customMappings, saveCustomMappings } = useFinance();
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
    const [selectedFileObj, setSelectedFileObj] = useState<any>(null); // Store the actual file object for Web support
    const [encoding, setEncoding] = useState<'utf-8' | 'big5'>('utf-8');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successCount, setSuccessCount] = useState<number | null>(null);
    const [unmappedList, setUnmappedList] = useState<string[]>([]);
    const [isMappingModalVisible, setIsMappingModalVisible] = useState(false);

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
            const parsedRecords: RawRecord[] = parseCsvData(csvText);
            if (parsedRecords.length === 0) {
                setError('未讀取到任何記錄，請確認 CSV 格式是否正確');
                setLoading(false);
                return;
            }
            clearRecords();
            loadRecords(parsedRecords);
            setSuccessCount(parsedRecords.length);

            // 檢查是否有未分類的帳戶
            const unmapped = findUnmappedAccounts(parsedRecords, customMappings);
            if (unmapped.length > 0) {
                setUnmappedList(unmapped);
                setIsMappingModalVisible(true);
            } else {
                if (onUploadSuccess) setTimeout(() => onUploadSuccess(), 1200);
            }
        } catch (e: any) {
            setError(`解析失敗：${e.message || '未知錯誤'}`);
        }
        setLoading(false);
    }, [selectedFileUri, selectedFileObj, encoding, clearRecords, loadRecords, onUploadSuccess, customMappings]);

    const handleSaveMappings = async (newMappings: CustomAccountMappings) => {
        await saveCustomMappings(newMappings);
        setIsMappingModalVisible(false);
        if (onUploadSuccess) onUploadSuccess();
    };

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
                            <ActivityIndicator color={colors.textWhite} size="small" />
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
            <AccountMappingModal
                visible={isMappingModalVisible}
                onClose={() => setIsMappingModalVisible(false)}
                unmappedAccounts={unmappedList}
                onSave={handleSaveMappings}
                existingMappings={customMappings}
            />
        </View>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'flex-start', paddingTop: 40 },
    // Upload Area
    uploadArea: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.accentBorder, borderStyle: 'dashed', borderRadius: 24, paddingVertical: 60, alignItems: 'center', ...SHADOWS.md },
    uploadIcon: { fontSize: 64, marginBottom: 20 },
    uploadTitle: { ...typography.h2, marginBottom: 8 },
    uploadSubtitle: { ...typography.body, color: colors.textMuted },
    // File Info
    fileInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 24, backgroundColor: colors.accentLight, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.accentBorder, ...SHADOWS.sm },
    fileIcon: { fontSize: 24, marginRight: 12 },
    fileName: { ...typography.body, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    fileRemove: { color: colors.textMuted, fontSize: 18, padding: 8, fontWeight: '800' },
    // Encoding
    encodingSection: { marginTop: 32 },
    encodingLabel: { ...typography.body, fontWeight: '700', marginBottom: 12 },
    encodingToggle: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.cardBorder, ...SHADOWS.sm },
    encodingBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
    encodingBtnActive: { backgroundColor: colors.accent, borderRadius: 14, margin: 2, ...SHADOWS.sm },
    encodingBtnText: { ...typography.body, fontWeight: '600', color: colors.textMuted },
    encodingBtnTextActive: { color: colors.textWhite },
    // Upload Button
    uploadBtn: { backgroundColor: colors.accent, padding: 20, borderRadius: 20, alignItems: 'center', marginTop: 40, ...SHADOWS.lg },
    uploadBtnDisabled: { backgroundColor: 'rgba(226, 232, 240, 0.4)', shadowOpacity: 0, borderWidth: 1, borderColor: colors.cardBorder },
    uploadBtnText: { color: colors.textWhite, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
    uploadBtnTextDisabled: { color: colors.textSecondary },
    // Messages
    errorCard: { marginTop: 24, backgroundColor: colors.redLight, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.red, ...SHADOWS.sm },
    errorText: { ...typography.body, color: colors.red, fontWeight: '600' },
    successCard: { marginTop: 24, backgroundColor: colors.greenLight, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.green, ...SHADOWS.sm },
    successText: { ...typography.body, color: colors.green, fontWeight: '700' },
    // Existing Data Info
    existingDataCard: { marginTop: 24, backgroundColor: colors.blueLight, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.accentBorder, ...SHADOWS.sm },
    existingDataText: { ...typography.body, color: colors.accent, fontWeight: '700', textAlign: 'center' },
});
