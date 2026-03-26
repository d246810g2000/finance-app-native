import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import UnifiedDateNavigator from './layout/UnifiedDateNavigator';

interface DateRangeSelectorProps {
    startDate: Date;
    endDate: Date;
    onDateChange: (start: Date, end: Date) => void;
    subLabel?: string;
}

export default function DateRangeSelector({ startDate, endDate, onDateChange, subLabel }: DateRangeSelectorProps) {
    const [showModal, setShowModal] = useState(false);

    const durationInDays = useMemo(() => {
        const diffTime = new Date(endDate).setHours(0, 0, 0, 0) - new Date(startDate).setHours(0, 0, 0, 0);
        return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }, [startDate, endDate]);

    const handleShift = useCallback((direction: 'prev' | 'next') => {
        const shiftMs = durationInDays * (1000 * 60 * 60 * 24);
        const shift = direction === 'prev' ? -shiftMs : shiftMs;
        const newStart = new Date(startDate.getTime() + shift);
        const newEnd = new Date(endDate.getTime() + shift);
        newStart.setHours(0, 0, 0, 0);
        newEnd.setHours(23, 59, 59, 999);
        onDateChange(newStart, newEnd);
    }, [startDate, endDate, durationInDays, onDateChange]);

    const dateDisplay = `${startDate.toLocaleDateString('zh-TW')} - ${endDate.toLocaleDateString('zh-TW')}`;

    // Preset ranges
    const setPresetRange = useCallback((days: number) => {
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const start = new Date();
        start.setDate(start.getDate() - (days - 1));
        start.setHours(0, 0, 0, 0);
        onDateChange(start, end);
        setShowModal(false);
    }, [onDateChange]);

    const setMonthRange = useCallback((offset: number) => {
        const now = new Date();
        const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        const end = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        onDateChange(targetMonth, end);
        setShowModal(false);
    }, [onDateChange]);

    return (
        <>
            <UnifiedDateNavigator
                dateLabel={dateDisplay}
                subLabel={subLabel}
                onPrev={() => handleShift('prev')}
                onNext={() => handleShift('next')}
                onCenterPress={() => setShowModal(true)}
            />

            {/* Preset Modal */}
            <Modal visible={showModal} animationType="fade" transparent>
                <BlurView intensity={30} tint="dark" style={styles.overlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowModal(false)} />
                    <View style={[styles.modalCard, SHADOWS.lg]}>
                        <Text style={styles.modalTitle}>選擇日期範圍</Text>

                        <Text style={styles.sectionLabel}>快捷選擇</Text>
                        <View style={styles.presetGrid}>
                            {[
                                { label: '7 天', days: 7 },
                                { label: '30 天', days: 30 },
                                { label: '90 天', days: 90 },
                                { label: '180 天', days: 180 },
                                { label: '365 天', days: 365 },
                            ].map(p => (
                                <Pressable
                                    key={p.days}
                                    style={({ pressed }) => [
                                        styles.presetBtn,
                                        pressed && styles.presetBtnPressed
                                    ]}
                                    onPress={() => setPresetRange(p.days)}
                                >
                                    <Text style={styles.presetBtnText}>{p.label}</Text>
                                </Pressable>
                            ))}
                        </View>

                        <Text style={styles.sectionLabel}>月份</Text>
                        <View style={styles.presetGrid}>
                            {[
                                { label: '本月', offset: 0 },
                                { label: '上月', offset: -1 },
                                { label: '前2月', offset: -2 },
                                { label: '前3月', offset: -3 },
                            ].map(m => (
                                <Pressable
                                    key={m.offset}
                                    style={({ pressed }) => [
                                        styles.presetBtn,
                                        pressed && styles.presetBtnPressed
                                    ]}
                                    onPress={() => setMonthRange(m.offset)}
                                >
                                    <Text style={styles.presetBtnText}>{m.label}</Text>
                                </Pressable>
                            ))}
                        </View>

                        <Pressable
                            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
                            onPress={() => setShowModal(false)}
                        >
                            <Text style={styles.cancelBtnText}>取消</Text>
                        </Pressable>
                    </View>
                </BlurView>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    // Modal
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.blackOverlay,
    },
    modalCard: {
        backgroundColor: COLORS.card,
        borderRadius: 24, // Rounder corners for premium feel
        padding: 24,
        width: '85%',
        maxWidth: 400,
        ...SHADOWS.lg,
    },
    modalTitle: {
        ...TYPOGRAPHY.h3,
        textAlign: 'center',
        marginBottom: 24,
        letterSpacing: -0.3,
    },
    sectionLabel: {
        ...TYPOGRAPHY.caption,
        marginBottom: 10,
        marginTop: 8,
    },
    presetGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 16,
    },
    presetBtn: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.bg,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: COLORS.divider,
    },
    presetBtnPressed: {
        backgroundColor: COLORS.accentLight,
        borderColor: COLORS.accentBorder,
        transform: [{ scale: 0.96 }],
    },
    presetBtnText: {
        ...TYPOGRAPHY.body,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    cancelBtn: {
        marginTop: 12,
        paddingVertical: 14,
        alignItems: 'center',
        borderRadius: 12,
        backgroundColor: COLORS.bg,
    },
    cancelBtnText: {
        ...TYPOGRAPHY.subtitle,
        color: COLORS.textSecondary,
    },
});
