import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFinance } from '../../context/FinanceContext';
import { useAppTheme } from '../../context/ThemeContext';
import { aggregateTravelProjects } from '../../services/shared';
import TravelDetailScreen from '../../components/travel/TravelDetailScreen';
import EmptyState from '../../components/ui/EmptyState';

export default function TravelDetailRoute() {
    const { name } = useLocalSearchParams<{ name: string }>();
    const { records } = useFinance();
    const { colors } = useAppTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const projectName = Array.isArray(name) ? name[0] : name;

    const project = useMemo(() => {
        if (!projectName) return null;
        const decoded = decodeURIComponent(projectName);
        return aggregateTravelProjects(records).find((p) => p.name === decoded) ?? null;
    }, [records, projectName]);

    if (!project) {
        return (
            <View style={[styles.emptyRoot, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
                <EmptyState
                    icon="airplane-outline"
                    title="找不到此旅遊專案"
                    description="資料可能已更新或專案名稱已變更"
                    actionLabel="返回"
                    onAction={() => router.back()}
                />
            </View>
        );
    }

    return <TravelDetailScreen project={project} />;
}

const styles = StyleSheet.create({
    emptyRoot: { flex: 1, justifyContent: 'center' },
});
