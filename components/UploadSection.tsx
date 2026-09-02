import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, ScrollView, Switch } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFinance } from '../context/FinanceContext';
import {
    readFileContent,
    parseCsvData,
    analyzeImport,
    ImportReport,
    UpsertResult,
    shareAndroMoneyCsv,
} from '../services/financeService';
import { RawRecord, CustomAccountMappings } from '../types';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { AppColors, SHADOWS, RADIUS, withContinuousRadius } from '../theme';
import { useAppTheme } from '../context/ThemeContext';
import { hapticSuccess, hapticLight } from '../utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import AccountMappingModal from './account/AccountMappingModal';

interface UploadSectionProps {
    onUploadSuccess?: () => void;
}

type ImportMode = 'merge' | 'replace';

export default function UploadSection({ onUploadSuccess }: UploadSectionProps) {
    const { colors, typography } = useAppTheme();
    const styles = useMemo(() => createStyles(colors, typography), [colors, typography]);
    const { loadRecords, mergeRecords, clearRecords, records, customMappings, saveCustomMappings } = useFinance();
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
    const [selectedFileObj, setSelectedFileObj] = useState<any>(null);
    const [encoding, setEncoding] = useState<'utf-8' | 'big5'>('utf-8');
    const [importMode, setImportMode] = useState<ImportMode>('merge');
    const [syncDelete, setSyncDelete] = useState(false);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [importReport, setImportReport] = useState<ImportReport | null>(null);
    const [mergeStats, setMergeStats] = useState<UpsertResult | null>(null);
    const [unmappedList, setUnmappedList] = useState<string[]>([]);
    const [isMappingModalVisible, setIsMappingModalVisible] = useState(false);
    const hasExistingData = records.length > 0;
    const hasSelectedFile = !!selectedFileUri;
    const successVisible = importReport != null;

    const resetSelectionExtras = () => {
        setError(null);
        setImportReport(null);
        setMergeStats(null);
    };

    const handlePickFile = useCallback(async () => {
        resetSelectionExtras();
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
        setImportReport(null);
        setMergeStats(null);
        try {
            const csvText = await readFileContent(targetFile, encoding);
            const parsedRecords: RawRecord[] = parseCsvData(csvText);
            if (parsedRecords.length === 0) {
                setError('未讀取到任何記錄，請確認 CSV 格式是否正確');
                setLoading(false);
                return;
            }

            const report = analyzeImport(parsedRecords, customMappings);
            setImportReport(report);

            const mode = hasExistingData ? importMode : 'replace';
            if (mode === 'merge' && hasExistingData) {
                const stats = mergeRecords(parsedRecords, { syncDelete });
                setMergeStats(stats);
            } else {
                clearRecords();
                loadRecords(parsedRecords);
                setMergeStats(null);
            }
            hapticSuccess();

            if (report.unmappedAccounts.length > 0) {
                setUnmappedList(report.unmappedAccounts);
                setIsMappingModalVisible(true);
            } else if (onUploadSuccess) {
                setTimeout(() => onUploadSuccess(), 1600);
            }
        } catch (e: any) {
            setError(`解析失敗：${e.message || '未知錯誤'}`);
        }
        setLoading(false);
    }, [
        selectedFileUri,
        selectedFileObj,
        encoding,
        clearRecords,
        loadRecords,
        mergeRecords,
        onUploadSuccess,
        customMappings,
        hasExistingData,
        importMode,
        syncDelete,
    ]);

    const handleSaveMappings = async (newMappings: CustomAccountMappings) => {
        await saveCustomMappings(newMappings);
        setIsMappingModalVisible(false);
        if (onUploadSuccess) onUploadSuccess();
    };

    const handleExportAndroMoney = useCallback(async () => {
        if (records.length === 0) {
            setError('尚無資料可匯出，請先匯入 CSV');
            return;
        }
        setExporting(true);
        setError(null);
        try {
            await shareAndroMoneyCsv(records);
            hapticSuccess();
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '未知錯誤';
            setError(`匯出失敗：${message}`);
        } finally {
            setExporting(false);
        }
    }, [records]);

    const formatYmd = (ymd: string | null) => {
        if (!ymd || ymd.length < 8) return '—';
        return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
    };

    return (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <Animated.View entering={FadeInDown.springify()}>
                <View style={styles.intro}>
                    <Text style={styles.eyebrow}>資料中心</Text>
                    <Text style={styles.pageTitle}>匯入你的消費紀錄</Text>
                    <Text style={styles.pageDescription}>
                        選擇 AndroMoney 匯出的 CSV 建立總覽；本機已有資料時可匯出回 AndroMoney 格式。
                    </Text>
                </View>

                {hasExistingData ? (
                    <View style={styles.exportSectionTop}>
                        <View style={styles.existingDataRow}>
                            <Ionicons name="stats-chart-outline" size={18} color={colors.primary} />
                            <Text style={styles.existingDataText}>
                                本機 {records.length.toLocaleString()} 筆 · 可匯出至 AndroMoney
                            </Text>
                        </View>
                        <Pressable
                            style={({ pressed }) => [
                                styles.exportBtn,
                                exporting && styles.uploadBtnDisabled,
                                pressed && !exporting ? styles.uploadBtnPressed : null,
                            ]}
                            onPress={handleExportAndroMoney}
                            disabled={exporting}
                            accessibilityRole="button"
                            accessibilityLabel="匯出 AndroMoney CSV"
                        >
                            {exporting ? (
                                <ActivityIndicator color={colors.primary} />
                            ) : (
                                <View style={styles.uploadBtnContent}>
                                    <Ionicons name="download-outline" size={20} color={colors.primary} />
                                    <Text style={styles.exportBtnText}>
                                        匯出 AndroMoney.csv
                                    </Text>
                                </View>
                            )}
                        </Pressable>
                        <Text style={styles.modeHint}>
                            官方 CSV 格式（含 Id、uid、Periodic），可匯入回 AndroMoney App。
                        </Text>
                    </View>
                ) : null}

                <Pressable
                    style={({ pressed }) => [styles.uploadArea, pressed ? { opacity: 0.85, transform: [{ scale: 0.98 }] } : {}]}
                    onPress={handlePickFile}
                    accessibilityRole="button"
                    accessibilityLabel="選擇 CSV 檔案"
                >
                    <View style={styles.uploadIconCircle}>
                        <Ionicons name="cloud-upload-outline" size={40} color={colors.primary} />
                    </View>
                    <Text style={styles.uploadTitle}>選擇 CSV 檔案</Text>
                    <Text style={styles.uploadSubtitle}>支援 AndroMoney 匯出格式（uid 增量合併）</Text>
                </Pressable>

                {selectedFileName ? (
                    <Animated.View entering={FadeInUp.springify()} style={styles.fileInfo}>
                        <View style={styles.fileIcon}>
                            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                        </View>
                        <View style={styles.fileTextWrap}>
                            <Text style={styles.fileStatus}>已選擇檔案</Text>
                            <Text style={styles.fileName} numberOfLines={1}>{selectedFileName}</Text>
                        </View>
                        <Pressable
                            onPress={() => {
                                setSelectedFileName(null);
                                setSelectedFileUri(null);
                                setSelectedFileObj(null);
                                resetSelectionExtras();
                            }}
                            hitSlop={10}
                            accessibilityRole="button"
                            accessibilityLabel="移除已選擇的檔案"
                        >
                            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                        </Pressable>
                    </Animated.View>
                ) : null}

                <View style={styles.encodingSection}>
                    <Text style={styles.encodingLabel}>編碼格式</Text>
                    <View style={styles.encodingToggle}>
                        {(['utf-8', 'big5'] as const).map(enc => (
                            <Pressable
                                key={enc}
                                style={[styles.encodingBtn, encoding === enc ? styles.encodingBtnActive : null]}
                                onPress={() => setEncoding(enc)}
                                accessibilityRole="button"
                                accessibilityLabel={`編碼 ${enc === 'utf-8' ? 'UTF-8' : 'Big-5'}`}
                                accessibilityState={{ selected: encoding === enc }}
                            >
                                <Text style={[styles.encodingBtnText, encoding === enc ? styles.encodingBtnTextActive : null]}>
                                    {enc === 'utf-8' ? 'UTF-8' : 'Big-5'}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

                {hasExistingData ? (
                    <View style={styles.encodingSection}>
                        <Text style={styles.encodingLabel}>匯入方式</Text>
                        <View style={styles.encodingToggle}>
                            <Pressable
                                style={[styles.encodingBtn, importMode === 'merge' ? styles.encodingBtnActive : null]}
                                onPress={() => setImportMode('merge')}
                                accessibilityRole="button"
                                accessibilityLabel="匯入方式：合併更新"
                                accessibilityState={{ selected: importMode === 'merge' }}
                            >
                                <Text style={[styles.encodingBtnText, importMode === 'merge' ? styles.encodingBtnTextActive : null]}>
                                    合併更新
                                </Text>
                            </Pressable>
                            <Pressable
                                style={[styles.encodingBtn, importMode === 'replace' ? styles.encodingBtnActive : null]}
                                onPress={() => setImportMode('replace')}
                                accessibilityRole="button"
                                accessibilityLabel="匯入方式：完全取代"
                                accessibilityState={{ selected: importMode === 'replace' }}
                            >
                                <Text style={[styles.encodingBtnText, importMode === 'replace' ? styles.encodingBtnTextActive : null]}>
                                    完全取代
                                </Text>
                            </Pressable>
                        </View>
                        <Text style={styles.modeHint}>
                            {importMode === 'merge'
                                ? (syncDelete
                                    ? '依 uid 更新／新增，並刪除 CSV 中不存在的本機紀錄。'
                                    : '依 CSV 的 uid／Id 更新或新增；本機多出的紀錄會保留。')
                                : `會清空並取代目前 ${records.length.toLocaleString()} 筆資料。`}
                        </Text>
                        {importMode === 'merge' ? (
                            <View style={styles.syncRow}>
                                <View style={styles.syncTextWrap}>
                                    <Text style={styles.syncLabel}>同步刪除 CSV 沒有的紀錄</Text>
                                    <Text style={styles.syncHint}>適合整份匯出當真相來源時開啟</Text>
                                </View>
                                <Switch
                                    value={syncDelete}
                                    onValueChange={setSyncDelete}
                                    trackColor={{ false: colors.border, true: colors.primary }}
                                    thumbColor={colors.textWhite}
                                />
                            </View>
                        ) : null}
                    </View>
                ) : null}

                {!successVisible && (
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
                            accessibilityLabel={hasExistingData ? '匯入 CSV' : '載入所選 CSV 資料'}
                        >
                            {loading ? (
                                <ActivityIndicator color={colors.textWhite} size="small" />
                            ) : (
                                <View style={styles.uploadBtnContent}>
                                    <Ionicons
                                        name={hasExistingData ? 'refresh-outline' : 'arrow-up-circle-outline'}
                                        size={20}
                                        color={hasSelectedFile ? colors.textWhite : colors.textMuted}
                                    />
                                    <Text style={[styles.uploadBtnText, !hasSelectedFile && styles.uploadBtnTextDisabled]}>
                                        {hasExistingData
                                            ? (importMode === 'merge' ? '合併匯入 CSV' : '取代並載入 CSV')
                                            : '載入 CSV 資料'}
                                    </Text>
                                </View>
                            )}
                        </Pressable>
                        {!hasSelectedFile ? <Text style={styles.actionHint}>請先選擇 CSV 檔案以啟用載入</Text> : null}
                    </View>
                )}

                {error ? (
                    <Animated.View entering={FadeInUp.springify()} style={styles.errorCard}>
                        <Ionicons name="alert-circle-outline" size={20} color={colors.red} />
                        <Text style={styles.errorText}>{error}</Text>
                    </Animated.View>
                ) : null}

                {importReport ? (
                    <Animated.View entering={FadeInUp.springify()} style={styles.reportCard}>
                        <View style={styles.reportHeader}>
                            <Ionicons name="checkmark-circle-outline" size={22} color={colors.green} />
                            <Text style={styles.reportTitle}>匯入完成</Text>
                        </View>
                        <Text style={styles.reportLine}>總列數 {importReport.totalRows.toLocaleString()}　·　可分析 {importReport.importableRows.toLocaleString()}</Text>
                        <Text style={styles.reportLine}>略過 SYSTEM {importReport.systemSkipped} 筆</Text>
                        <Text style={styles.reportLine}>
                            商家：欄位 {importReport.merchantFromField}　·　備註抽取 {importReport.merchantFromNotes}　·　後備 {importReport.merchantFallback}
                        </Text>
                        <Text style={styles.reportLine}>
                            日期 {formatYmd(importReport.dateMin)} – {formatYmd(importReport.dateMax)}　·　專案 {importReport.uniqueProjects} 種
                        </Text>
                        {importReport.unmappedAccounts.length > 0 ? (
                            <Text style={styles.reportWarn}>
                                未對應帳戶 {importReport.unmappedAccounts.length} 個：{importReport.unmappedAccounts.slice(0, 5).join('、')}
                                {importReport.unmappedAccounts.length > 5 ? '…' : ''}
                            </Text>
                        ) : (
                            <Text style={styles.reportOk}>帳戶皆已對應</Text>
                        )}
                        {mergeStats ? (
                            <Text style={styles.reportLine}>
                                合併：新增 {mergeStats.added}　·　更新 {mergeStats.updated}
                                {mergeStats.removed > 0 ? `　·　刪除 ${mergeStats.removed}` : `　·　保留本機 ${mergeStats.kept}`}
                            </Text>
                        ) : null}
                        {importReport.reviewHints.length > 0 ? (
                            <View style={styles.hintSection}>
                                <Text style={styles.hintTitle}>
                                    建議檢查（{importReport.reviewHintCounts.high + importReport.reviewHintCounts.medium} 項，不會自動修改）
                                </Text>
                                {importReport.reviewHints.slice(0, 5).map((hint) => (
                                    <Text key={`${hint.recordId}-${hint.kind}`} style={styles.hintLine}>
                                        · [{hint.severity}] {hint.date} {hint.category}/{hint.sub}
                                        {hint.project ? ` · ${hint.project}` : ''} — {hint.reason}
                                    </Text>
                                ))}
                                {importReport.reviewHints.length > 5 ? (
                                    <Text style={styles.hintMore}>另有 {importReport.reviewHints.length - 5} 項，執行 npm run audit:records 看完整報告</Text>
                                ) : null}
                            </View>
                        ) : (
                            <Text style={styles.reportOk}>記帳歸屬未發現需優先處理項目</Text>
                        )}
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
        </ScrollView>
    );
}

const createStyles = (colors: AppColors, typography: ReturnType<typeof useAppTheme>['typography']) => StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.surface },
    container: { padding: 24, justifyContent: 'flex-start', paddingTop: 32, paddingBottom: 40 },
    intro: { marginBottom: 24 },
    eyebrow: { ...typography.caption, color: colors.primary, marginBottom: 8 },
    pageTitle: { ...typography.h1, fontSize: 26, marginBottom: 8 },
    pageDescription: { ...typography.body, color: colors.textMuted, lineHeight: 22 },
    uploadArea: { backgroundColor: colors.surfaceContainer, borderWidth: 2, borderColor: colors.outlineVariant, borderStyle: 'dashed', ...withContinuousRadius(RADIUS.xl), paddingVertical: 48, alignItems: 'center' },
    uploadIconCircle: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.primaryContainer, justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: colors.outlineVariant },
    uploadTitle: { ...typography.h2, fontSize: 20, marginBottom: 6 },
    uploadSubtitle: { ...typography.body, color: colors.textMuted },
    fileInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, backgroundColor: colors.primaryContainer, padding: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.outlineVariant, ...SHADOWS.sm },
    fileIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceContainer, borderRadius: RADIUS.sm },
    fileTextWrap: { flex: 1 },
    fileStatus: { ...typography.caption, color: colors.primary, marginBottom: 2 },
    fileName: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
    encodingSection: { marginTop: 28 },
    exportSectionTop: {
        marginBottom: 24,
        padding: 16,
        backgroundColor: colors.primaryContainer,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: colors.outlineVariant,
        ...SHADOWS.sm,
    },
    existingDataRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    exportBtn: {
        marginTop: 12,
        backgroundColor: colors.surfaceContainer,
        minHeight: 56,
        paddingHorizontal: 18,
        borderRadius: RADIUS.lg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.outlineVariant,
    },
    exportBtnText: { ...typography.body, fontWeight: '700', color: colors.primary },
    encodingLabel: { ...typography.body, fontWeight: '700', marginBottom: 10 },
    encodingToggle: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: RADIUS.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.outlineVariant, ...SHADOWS.sm },
    encodingBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
    encodingBtnActive: { backgroundColor: colors.primary, borderRadius: RADIUS.sm, margin: 2, ...SHADOWS.sm },
    encodingBtnText: { ...typography.body, fontWeight: '600', color: colors.textMuted },
    encodingBtnTextActive: { color: colors.textWhite },
    modeHint: { ...typography.bodySm, color: colors.textMuted, marginTop: 10, lineHeight: 18 },
    syncRow: {
        flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, gap: 12,
    },
    syncTextWrap: { flex: 1 },
    syncLabel: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
    syncHint: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
    actionSection: { marginTop: 28 },
    uploadBtn: { backgroundColor: colors.primary, minHeight: 56, paddingHorizontal: 18, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
    uploadBtnDisabled: { backgroundColor: colors.surfaceContainer, shadowOpacity: 0, borderWidth: 1, borderColor: colors.outlineVariant },
    uploadBtnPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
    uploadBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    uploadBtnText: { color: colors.textWhite, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
    uploadBtnTextDisabled: { color: colors.textMuted },
    actionHint: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', marginTop: 10 },
    errorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, backgroundColor: colors.redLight, padding: 16, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.red, ...SHADOWS.sm },
    errorText: { ...typography.body, color: colors.red, fontWeight: '600', flex: 1 },
    reportCard: { marginTop: 20, backgroundColor: colors.greenLight, padding: 16, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.green, ...SHADOWS.sm, gap: 6 },
    reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    reportTitle: { ...typography.body, color: colors.green, fontWeight: '800', fontSize: 16 },
    reportLine: { ...typography.bodySm, color: colors.textPrimary, lineHeight: 20 },
    reportOk: { ...typography.bodySm, color: colors.green, fontWeight: '600' },
    reportWarn: { ...typography.bodySm, color: colors.yellow, fontWeight: '600', marginTop: 2 },
    hintSection: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, gap: 4 },
    hintTitle: { ...typography.bodySm, color: colors.textPrimary, fontWeight: '700' },
    hintLine: { ...typography.bodySm, color: colors.textSecondary, lineHeight: 18 },
    hintMore: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
    existingDataText: { ...typography.body, color: colors.primary, fontWeight: '600', textAlign: 'left', flex: 1 },
});
