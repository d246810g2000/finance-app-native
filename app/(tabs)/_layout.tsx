import { Tabs } from 'expo-router';
import { StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SCREEN_EDGE_MIN } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import HamburgerMenu from '../../components/layout/HamburgerMenu';
import HeaderMenuButton from '../../components/layout/HeaderMenuButton';
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
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useAppTheme();
    const { menuVisible, setMenuVisible, searchModalVisible, setSearchModalVisible, setSearchFilters } = useFinance();
    const edgeH = Math.max(insets.left, insets.right, SCREEN_EDGE_MIN);
    const styles = useMemo(() => createStyles(colors, insets.bottom, isDark, edgeH), [colors, insets.bottom, isDark, edgeH]);

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
                    tabBarIcon: ({ focused, color }) => {
                        const iconSet = TAB_ICONS[route.name];
                        if (!iconSet) return null;
                        const iconName = focused ? iconSet.focused : iconSet.default;
                        return <Ionicons name={iconName} size={24} color={color} />;
                    },
                    tabBarActiveTintColor: colors.accent,
                    tabBarInactiveTintColor: colors.tabInactive,
                    tabBarLabelStyle: styles.tabLabel,
                    tabBarStyle: styles.tabBar,
                    sceneContainerStyle: styles.sceneContainer,
                    headerStyle: styles.header,
                    headerTitleStyle: styles.headerTitle,
                    headerTintColor: colors.textPrimary,
                    headerLeftContainerStyle: styles.headerLeftContainer,
                    headerRightContainerStyle: styles.headerRightContainer,
                    headerLeft: () => (
                        <HeaderMenuButton onPress={() => setMenuVisible(true)} />
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

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors'], bottomInset: number, isDark: boolean, edgeH: number) => StyleSheet.create({
    sceneContainer: {
        flex: 1,
        backgroundColor: colors.bg,
        paddingHorizontal: edgeH,
    },
    tabBar: {
        backgroundColor: colors.tabBg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: isDark ? colors.divider : colors.cardBorder,
        height: 56 + bottomInset,
        paddingTop: 6,
        paddingBottom: Math.max(bottomInset, 8),
        paddingHorizontal: edgeH,
        ...Platform.select({
            android: {
                elevation: 8,
            },
            ios: {
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.06,
                shadowRadius: 12,
            },
            default: {},
        }),
    },
    tabLabel: {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 2,
        ...Platform.select({
            android: { includeFontPadding: false },
            default: {},
        }),
    },
    header: {
        backgroundColor: colors.headerBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.cardBorder,
        ...Platform.select({
            android: {
                elevation: 3,
            },
            ios: {
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 4,
            },
            default: {},
        }),
    },
    headerTitle: {
        color: colors.textPrimary,
        fontWeight: '700',
        fontSize: 18,
        letterSpacing: 0,
        ...Platform.select({
            android: { includeFontPadding: false },
            default: { letterSpacing: -0.3 },
        }),
    },
    headerLeftContainer: {
        paddingLeft: edgeH,
    },
    headerRightContainer: {
        paddingRight: edgeH,
    },
});
