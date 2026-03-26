import * as FileSystem from 'expo-file-system/legacy';

const ACCOUNT_CONFIG_FILE_NAME = 'account_config.json';
const ACCOUNT_CONFIG_FILE_URI = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + ACCOUNT_CONFIG_FILE_NAME;

export const loadExcludedAccounts = async (): Promise<string[]> => {
    try {
        const info = await FileSystem.getInfoAsync(ACCOUNT_CONFIG_FILE_URI);
        if (!info.exists) return [];
        const content = await FileSystem.readAsStringAsync(ACCOUNT_CONFIG_FILE_URI);
        return JSON.parse(content);
    } catch (e) {
        console.error('Failed to load account config', e);
        return [];
    }
};

export const saveExcludedAccounts = async (excludedAccounts: string[]): Promise<void> => {
    try {
        await FileSystem.writeAsStringAsync(ACCOUNT_CONFIG_FILE_URI, JSON.stringify(excludedAccounts));
    } catch (e) {
        console.error('Failed to save account config', e);
    }
};
