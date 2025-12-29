import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getConfig } from '../services/api';

interface AppContextType {
    isDark: boolean;
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    primaryColor: string;
    setPrimaryColor: (color: string) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    refreshTrigger: number;
    triggerRefresh: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light');
    const [primaryColor, setPrimaryColor] = useState('#1677ff');
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isDark, setIsDark] = useState(false);

    // Initial load
    useEffect(() => {
        // Wrap async call to avoid unhandled promise rejection if invoke fails initially
        const loadConfig = async () => {
            try {
                const config = await getConfig();
                if (config) {
                    if (config.theme) {
                        setThemeMode(config.theme as any);
                    }
                    if (config.primary_color) {
                        setPrimaryColor(config.primary_color);
                    }
                }
            } catch (error) {
                console.warn('Failed to load initial config, using defaults:', error);
            }
        };
        loadConfig();
    }, []);

    // Calculate effective dark mode
    useEffect(() => {
        if (themeMode === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            setIsDark(mediaQuery.matches);
            
            const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
            mediaQuery.addEventListener('change', handler);
            return () => mediaQuery.removeEventListener('change', handler);
        } else {
            setIsDark(themeMode === 'dark');
        }
    }, [themeMode]);

    const setTheme = (mode: 'light' | 'dark' | 'system') => {
        setThemeMode(mode);
    };

    const triggerRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <AppContext.Provider value={{ 
            isDark, 
            setTheme, 
            primaryColor,
            setPrimaryColor,
            searchQuery, 
            setSearchQuery,
            refreshTrigger,
            triggerRefresh
        }}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};
