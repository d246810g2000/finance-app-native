import { Tabs } from 'expo-router';
import { StyleSheet, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, SCREEN_EDGE_MIN, withContinuousRadius } from '../../theme';
import { useAppTheme } from '../../context/ThemeContext';
import HamburgerMenu from '../../components/layout/HamburgerMenu';
import HeaderMenuButton from '../../components/layout/HeaderMenuButton';
import SearchModal from '../../components/SearchModal';
import { SearchFilters } from '../../context/FinanceContext';
import { useFinanceUI } from '../../context/FinanceUIContext';
import { useRouter } from 'expo-router';
import ReconciliationModal from '../../components/reconciliation/ReconciliationModal';
import { hapticSelection } from '../../utils/haptics';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { focused: IoniconsName, default: IoniconsName }> = {
    index: { focused: 'card', default: 'card-outline' },
    budget: { focused: 'cash', default: 'cash-outline' },
    records: { focused: 'list', default: 'list-outline' },
    project: { focused: 'folder', default: 'folder-outline' },
    travel: { focused: 'airplane', default: 'airplane-outline' },
};

function TabBarIcon({
    routeName,
    focused,
    color,
}: {
    routeName: string;
    focused: boolean;
    color: string;
}) {
    const { colors } = useAppTheme();
    const iconSet = TAB_ICONS[routeName];
    if (!iconSet) return null;
    const iconName = focused ? iconSet.focused : iconSet.default;

    return (
        <View
            style={[
                tabIconStyles.wrap,
                focused && {
                    backgroundColor: colors.primaryContainer,
                    ...withContinuousRadius(RADIUS.full),
                },
            ]}
        >
            <Ionicons name={iconName} size={22} color={color} />
        </View>
    );
}

const tabIconStyles = StyleSheet.create({
    wrap: {
        minWidth: 56,
        minHeight: 32,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
});

export default function TabLayout() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    const { menuVisible, setMenuVisible, searchModalVisible, setSearchModalVisible, setSearchFilters, reconcilingCard, closeReconciliation } = useFinanceUI();
    const edgeH = Math.max(insets.left, insets.right, SCREEN_EDGE_MIN);
    const styles = useMemo(() => createStyles(colors, insets.bottom, edgeH), [colors, insets.bottom, edgeH]);

    const handleApplySearch = (filters: SearchFilters) => {
        setSearchFilters(filters);
        router.push('/records');
        setSearchModalVisible(false);
    };

    return (
        <>
            <Tabs
                initialRouteName="index"
                screenListeners={{
                    tabPress: () => {
                        hapticSelection();
                    },
                }}
                screenOptions={({ route }) => ({
                    tabBarIcon: ({ focused, color }) => (
                        <TabBarIcon routeName={route.name} focused={focused} color={color} />
                    ),
                    tabBarActiveTintColor: colors.primary as string,
                    tabBarInactiveTintColor: colors.tabInactive as string,
                    tabBarLabelStyle: styles.tabLabel,
                    tabBarStyle: styles.tabBar,
                    sceneContainerStyle: styles.sceneContainer,
                    headerStyle: styles.header,
                    headerTitleStyle: styles.headerTitle,
                    headerTintColor: colors.onSurface as string,
                    headerLeftContainerStyle: styles.headerLeftContainer,
                    headerRightContainerStyle: styles.headerRightContainer,
                    headerShadowVisible: false,
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
                    name="merchant"
                    options={{
                        title: '商家',
                        href: null,
                    }}
                />
                <Tabs.Screen
                    name="health"
                    options={{
                        title: '財務健檢',
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
            {reconcilingCard ? (
                <ReconciliationModal
                    visible
                    cardName={reconcilingCard}
                    onClose={closeReconciliation}
                />
            ) : null}
        </>
    );
}

const createStyles = (
    colors: ReturnType<typeof useAppTheme>['colors'],
    bottomInset: number,
    edgeH: number,
) => StyleSheet.create({
    sceneContainer: {
        flex: 1,
        backgroundColor: colors.surface,
        paddingHorizontal: edgeH,
    },
    tabBar: {
        backgroundColor: colors.surfaceContainer,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.outlineVariant,
        height: 68 + bottomInset,
        paddingTop: 4,
        paddingBottom: Math.max(bottomInset, 12),
        paddingHorizontal: edgeH,
        elevation: 0,
    },
    tabLabel: {
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
        ...Platform.select({
            android: { includeFontPadding: false },
            default: {},
        }),
    },
    header: {
        backgroundColor: colors.surfaceContainer,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.outlineVariant,
        elevation: 0,
        shadowOpacity: 0,
    },
    headerTitle: {
        color: colors.onSurface,
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
