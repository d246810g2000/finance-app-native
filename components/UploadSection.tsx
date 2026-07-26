
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFinance } from '../context/FinanceContext';
import { readFileContent, parseCsvData, findUnmappedAccounts } from '../services/financeService';
import { RawRecord, CustomAccountMappings } from '../types';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { AppColors, SHADOWS, RADIUS, withContinuousRadius } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import AccountMappingModal from './account/AccountMappingModal';

interface UploadSectionProps {
    onUploadSuccess?: () => void;
}

export default function UploadSection({ onUploadSuccess }: UploadSectionProps) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const { loadRecords, clearRecords, records, customMappings, saveCustomMappings } = useFinance();
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
    const [selectedFileObj, setSelectedFileObj] = useState<any>(null); // Store the actual file object for Web support
    const [encoding, setEncoding] = useState<'utf-8' | 'big5'>('utf-8');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successCount, setSuccessCount] = useState<number | null>(null);
    const [unmappedList, setUnmappedList] = useState<string[]>([]);
    const [isMappingModalVisible, setIsMappingModalVisible] = useState(false);
    const hasExistingData = records.length > 0;
    const hasSelectedFile = !!selectedFileUri;

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
                <View style={styles.intro}>
                    <Text style={styles.eyebrow}>資料中心</Text>
                    <Text style={styles.pageTitle}>匯入你的消費紀錄</Text>
                    <Text style={styles.pageDescription}>選擇 AndroMoney 匯出的 CSV，快速建立你的財務總覽。</Text>
                </View>
                {/* Upload Area */}
                <Pressable
                    style={({ pressed }) => [styles.uploadArea, pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : {}]}
                    onPress={handlePickFile}
                >
                    <View style={styles.uploadIconCircle}>
                        <Ionicons name="cloud-upload-outline" size={40} color={colors.accent} />
                    </View>
                    <Text style={styles.uploadTitle}>選擇 CSV 檔案</Text>
                    <Text style={styles.uploadSubtitle}>支援 AndroMoney 匯出格式</Text>
                </Pressable>

                {/* Selected file */}
                {selectedFileName ? (
                    <Animated.View entering={FadeInUp.springify()} style={styles.fileInfo}>
                        <View style={styles.fileIcon}>
                            <Ionicons name="document-text-outline" size={20} color={colors.accent} />
                        </View>
                        <View style={styles.fileTextWrap}>
                            <Text style={styles.fileStatus}>已選擇檔案</Text>
                            <Text style={styles.fileName} numberOfLines={1}>{selectedFileName}</Text>
                        </View>
                        <Pressable
                            onPress={() => { setSelectedFileName(null); setSelectedFileUri(null); setSelectedFileObj(null); setError(null); setSuccessCount(null); }}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel="移除已選擇的檔案"
                        >
                            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
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
                {!successCount && hasExistingData ? (
                    <Animated.View entering={FadeInDown.springify()} style={[styles.existingDataCard, hasSelectedFile && styles.replacementNotice]}>
                        <Ionicons name={hasSelectedFile ? 'alert-circle-outline' : 'stats-chart-outline'} size={18} color={hasSelectedFile ? colors.yellow : colors.accent} />
                        <Text style={[styles.existingDataText, hasSelectedFile && styles.replacementText]}>
                            {hasSelectedFile
                                ? `載入後會取代目前的 ${records.length.toLocaleString()} 筆資料`
                                : `目前已有 ${records.length.toLocaleString()} 筆資料；選擇新檔案即可更新`}
                        </Text>
                    </Animated.View>
                ) : null}

                {/* Import action */}
                {successCount === null && (
                    <View style={styles.actionSection}>
                        <Pressable
                            style={({ pressed }) => [
                                styles.uploadBtn,
                                (!hasSelectedFile || loading) && styles.uploadBtnDisabled,
                                pressed && hasSelectedFile && !loading ? styles.uploadBtnPressed : null,
                            ]}
                            onPress={handleParse}
                            disabled={!hasSelectedFile || loading}
                            accessibilityRole="button"
                            accessibilityLabel={hasExistingData ? '使用所選檔案更新資料' : '載入所選 CSV 資料'}
                        >
                            {loading ? (
                                <ActivityIndicator color={colors.textWhite} size="small" />
                            ) : (
                                <View style={styles.uploadBtnContent}>
                                    <Ionicons name={hasExistingData ? 'refresh-outline' : 'arrow-up-circle-outline'} size={20} color={hasSelectedFile ? colors.textWhite : colors.textMuted} />
                                    <Text style={[styles.uploadBtnText, !hasSelectedFile && styles.uploadBtnTextDisabled]}>
                                        {hasExistingData ? '更新現有資料' : '載入 CSV 資料'}
                                    </Text>
                                </View>
                            )}
                        </Pressable>
                        {!hasSelectedFile ? <Text style={styles.actionHint}>請先選擇 CSV 檔案以啟用載入</Text> : null}
                    </View>
                )}

                {/* Error */}
                {error ? (
                    <Animated.View entering={FadeInUp.springify()} style={styles.errorCard}>
                        <Ionicons name="alert-circle-outline" size={20} color={colors.red} />
                        <Text style={styles.errorText}>{error}</Text>
                    </Animated.View>
                ) : null}

                {/* Success */}
                {successCount !== null ? (
                    <Animated.View entering={FadeInUp.springify()} style={styles.successCard}>
                        <Ionicons name="checkmark-circle-outline" size={20} color={colors.green} />
                        <Text style={styles.successText}>已載入 {successCount.toLocaleString()} 筆記錄</Text>
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
    container: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'flex-start', paddingTop: 32 },
    intro: { marginBottom: 24 },
    eyebrow: { ...typography.caption, color: colors.accent, marginBottom: 8 },
    pageTitle: { ...typography.h1, fontSize: 26, marginBottom: 8 },
    pageDescription: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
    // Upload Area
    uploadArea: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.accentBorder, borderStyle: 'dashed', ...withContinuousRadius(RADIUS.xl), paddingVertical: 48, alignItems: 'center', ...SHADOWS.md },
    uploadIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accentLight, justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.accentBorder },
    uploadTitle: { ...typography.h2, fontSize: 20, marginBottom: 6 },
    uploadSubtitle: { ...typography.body, color: colors.textMuted },
    // File Info
    fileInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, backgroundColor: colors.accentLight, padding: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.accentBorder, ...SHADOWS.sm },
    fileIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderRadius: RADIUS.sm },
    fileTextWrap: { flex: 1 },
    fileStatus: { ...typography.caption, color: colors.accent, marginBottom: 2 },
    fileName: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
    // Encoding
    encodingSection: { marginTop: 28 },
    encodingLabel: { ...typography.body, fontWeight: '700', marginBottom: 10 },
    encodingToggle: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.cardBorder, ...SHADOWS.sm },
    encodingBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    encodingBtnActive: { backgroundColor: colors.accent, borderRadius: RADIUS.sm, margin: 2, ...SHADOWS.sm },
    encodingBtnText: { ...typography.body, fontWeight: '600', color: colors.textMuted },
    encodingBtnTextActive: { color: colors.textWhite },
    // Upload Button
    actionSection: { marginTop: 28 },
    uploadBtn: { backgroundColor: colors.accent, minHeight: 56, paddingHorizontal: 18, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', ...SHADOWS.lg },
    uploadBtnDisabled: { backgroundColor: colors.card, shadowOpacity: 0, borderWidth: 1, borderColor: colors.cardBorder },
    uploadBtnPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
    uploadBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    uploadBtnText: { color: colors.textWhite, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
    uploadBtnTextDisabled: { color: colors.textMuted },
    actionHint: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', marginTop: 10 },
    // Messages
    errorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, backgroundColor: colors.redLight, padding: 16, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.red, ...SHADOWS.sm },
    errorText: { ...typography.body, color: colors.red, fontWeight: '600', flex: 1 },
    successCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, backgroundColor: colors.greenLight, padding: 16, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.green, ...SHADOWS.sm },
    successText: { ...typography.body, color: colors.green, fontWeight: '700', flex: 1 },
    // Existing Data Info
    existingDataCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, backgroundColor: colors.accentLight, padding: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.accentBorder, ...SHADOWS.sm },
    replacementNotice: { backgroundColor: colors.yellowLight, borderColor: colors.yellow + '70' },
    existingDataText: { ...typography.body, color: colors.accent, fontWeight: '600', textAlign: 'left', flex: 1 },
    replacementText: { color: colors.yellow },
});
