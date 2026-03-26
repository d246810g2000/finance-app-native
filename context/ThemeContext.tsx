import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppColors, LIGHT_COLORS, DARK_COLORS, getTypography } from '../theme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: ThemeMode;
    isDark: boolean;
    colors: AppColors;
    typography: ReturnType<typeof getTypography>;
    setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@app_theme_mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const deviceColorScheme = useDeviceColorScheme();
    const [theme, setThemeState] = useState<ThemeMode>('system');

    useEffect(() => {
        const loadTheme = async () => {
            try {
                const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
                if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
                    setThemeState(storedTheme);
                }
            } catch (e) {
                console.error('Failed to load theme preference', e);
            }
        };
        loadTheme();
    }, []);

    const setTheme = async (mode: ThemeMode) => {
        try {
            await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
            setThemeState(mode);
        } catch (e) {
            console.error('Failed to save theme preference', e);
        }
    };

    const isDark = theme === 'system' ? deviceColorScheme === 'dark' : theme === 'dark';
    const colors = isDark ? DARK_COLORS : LIGHT_COLORS;
    const typography = getTypography(colors);

    return (
        <ThemeContext.Provider value={{ theme, isDark, colors, typography, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useAppTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useAppTheme must be used within a ThemeProvider');
    }
    return context;
};
