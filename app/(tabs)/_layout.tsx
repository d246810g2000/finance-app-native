import { Tabs } from 'expo-router';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useMemo } from 'react';
import { useAppTheme } from '../../context/ThemeContext';
import HamburgerMenu from '../../components/layout/HamburgerMenu';
import SearchModal from '../../components/SearchModal';
import { useFinance, SearchFilters } from '../../context/FinanceContext';
import { useRouter } from 'expo-router';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { focused: IoniconsName, default: IoniconsName }> = {
    index: { focused: 'card', default: 'card-outline' },
    budget: { focused: 'cash', default: 'cash-outline' },
    records: { focused: 'list', default: 'list-outline' },
    project: { focused: 'folder', default: 'folder-outline' },
    travel: { focused: 'airplane', default: 'airplane-outline' },
};

export default function TabLayout() {
    const router = useRouter();
    const { colors, typography } = useAppTheme();
    const { menuVisible, setMenuVisible, searchModalVisible, setSearchModalVisible, setSearchFilters } = useFinance();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const handleApplySearch = (filters: SearchFilters) => {
        setSearchFilters(filters);
        router.push('/records');
        setSearchModalVisible(false);
    };

    return (
        <>
            <Tabs
                initialRouteName="index"
                screenOptions={({ route }) => ({
                    tabBarIcon: ({ focused, color, size }) => {
                        const iconSet = TAB_ICONS[route.name];
                        if (!iconSet) return null;
                        const iconName = focused ? iconSet.focused : iconSet.default;
                        return <Ionicons name={iconName} size={24} color={color} />;
                    },
                    tabBarActiveTintColor: colors.accent,
                    tabBarInactiveTintColor: colors.tabInactive,
                    tabBarLabelStyle: styles.tabLabel,
                    tabBarStyle: styles.tabBar,
                    headerStyle: styles.header,
                    headerTitleStyle: styles.headerTitle,
                    headerTintColor: colors.textPrimary,
                    headerLeft: () => (
                        <TouchableOpacity
                            onPress={() => setMenuVisible(true)}
                            style={{ marginLeft: 16 }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <Ionicons name="menu-outline" size={28} color={colors.textPrimary} />
                        </TouchableOpacity>
                    ),
                })}
            >
                <Tabs.Screen
                    name="upload"
                    options={{
                        title: '匯入',
                        href: null,
                    }}
                />
                <Tabs.Screen
                    name="index"
                    options={{ title: '資產' }}
                />
                <Tabs.Screen
                    name="budget"
                    options={{ title: '預算' }}
                />
                <Tabs.Screen
                    name="records"
                    options={{ title: '記錄' }}
                />
                <Tabs.Screen
                    name="project"
                    options={{ title: '專案' }}
                />
                <Tabs.Screen
                    name="travel"
                    options={{ title: '旅遊' }}
                />
            </Tabs>
            <HamburgerMenu visible={menuVisible} onClose={() => setMenuVisible(false)} />
            <SearchModal
                visible={searchModalVisible}
                onClose={() => setSearchModalVisible(false)}
                onApply={handleApplySearch}
            />
        </>
    );
}

const createStyles = (colors: any) => StyleSheet.create({
    tabBar: {
        backgroundColor: colors.tabBg,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        height: 88,
        paddingTop: 8,
        paddingBottom: 28,
    },
    tabLabel: {
        fontSize: 10,
        fontWeight: '600',
        marginTop: 2,
    },
    header: {
        backgroundColor: colors.headerBg,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 2,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
    },
    headerTitle: {
        color: colors.textPrimary,
        fontWeight: '700',
        fontSize: 17,
    },
});
