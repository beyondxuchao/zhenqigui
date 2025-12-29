import { invoke } from '@tauri-apps/api/core';
import { Movie, TmdbMovie, AppConfig, AppInfo, DetectedPlayer, Material, MatchedFile } from '../types';

export const getMovies = async (): Promise<Movie[]> => {
    return await invoke('get_movies');
};

export const getMovieDetails = async (id: number): Promise<Movie> => {
    return await invoke('get_movie_details', { id });
};

export const addMovie = async (movie: Movie): Promise<Movie> => {
    return await invoke('add_movie', { movie });
};

export const updateMovie = async (movie: Movie): Promise<void> => {
    return await invoke('update_movie', { movie });
};

export const deleteMovie = async (id: number): Promise<void> => {
    return await invoke('delete_movie', { id });
};

export const updateMovieStatus = async (id: number, status: string): Promise<void> => {
    return await invoke('update_movie_status', { id, status });
};

export const searchTmdbMovies = async (query: string, page: number = 1): Promise<TmdbMovie[]> => {
    return await invoke('search_tmdb_movies', { query, page });
};

export const getTmdbDetails = async (tmdbId: number, type: string): Promise<any> => {
    return await invoke('get_tmdb_details', { tmdbId, type });
};

export const getConfig = async (): Promise<AppConfig> => {
    return await invoke('get_config');
};

export const saveConfig = async (config: AppConfig): Promise<void> => {
    return await invoke('save_config', { config });
};

export const scanDirectories = async (paths: string[], titles?: string[], threshold?: number): Promise<MatchedFile[]> => {
    return await invoke('scan_directories', { paths, titles, threshold });
};

export const autoMatchMovie = async (movieId: number): Promise<void> => {
    return await invoke('auto_match_movie', { movieId });
};

export const refreshMovieMaterials = async (movieId: number): Promise<Material[]> => {
    return await invoke('refresh_movie_materials', { movieId });
};

export const addMaterialToMovie = async (movieId: number, material: Material): Promise<void> => {
    return await invoke('add_material_to_movie', { movieId, material });
};

export const removeMaterialFromMovie = async (movieId: number, materialId: string): Promise<void> => {
    return await invoke('remove_material_from_movie', { movieId, materialId });
};

export const openFileWithPlayer = async (path: string): Promise<void> => {
    return await invoke('open_file_with_player', { path });
};

export const readImage = async (path: string): Promise<string> => {
    return await invoke('read_image', { path });
};

export const getAppInfo = async (): Promise<AppInfo> => {
    return await invoke('get_app_info');
};

export const testTmdbConnection = async (apiKey: string, proxy?: string): Promise<boolean> => {
    return await invoke('test_tmdb_connection', { apiKey, proxy });
};

export const fetchDoubanSubject = async (id: string): Promise<Movie> => {
    return await invoke('fetch_douban_subject', { id });
};

export const scanForMovies = async (paths: string[]): Promise<MatchedFile[]> => {
    return await invoke('scan_for_movies', { paths });
};

export const clearData = async (): Promise<void> => {
    return await invoke('clear_data');
};

export const backupDatabase = async (path: string): Promise<void> => {
    return await invoke('backup_database', { path });
};

export const restoreDatabase = async (path: string): Promise<void> => {
    return await invoke('restore_database', { path });
};

export const clearCache = async (): Promise<void> => {
    return await invoke('clear_cache');
};

export const setDataDirectory = async (path: string): Promise<void> => {
    return await invoke('set_data_directory', { path });
};

export const detectLocalPlayers = async (): Promise<DetectedPlayer[]> => {
    return await invoke('detect_local_players');
};

export const renameMovieFile = async (id: number, newName: string): Promise<void> => {
    return invoke('rename_movie_file', { id, newName });
};

export const listVideoFiles = async (path: string): Promise<string[]> => {
    return invoke('list_video_files', { path });
};

export const renameFileDirect = async (path: string, newName: string): Promise<string> => {
    return invoke('rename_file_direct', { path, newName });
};

// New Tools
export const checkFfmpeg = async (): Promise<boolean> => {
    return await invoke('check_ffmpeg');
};

export const getMediaInfo = async (path: string): Promise<string> => {
    return await invoke('get_media_info', { path });
};

export const convertVideo = async (input: string, output: string, format: string): Promise<void> => {
    return await invoke('convert_video', { input, output, format });
};

export const extractAudio = async (input: string, output: string): Promise<void> => {
    return await invoke('extract_audio', { input, output });
};

export const extractSubtitles = async (input: string, outputDir: string): Promise<string[]> => {
    return await invoke('extract_subtitles', { input, outputDir });
};

export const searchUsnJournal = async (volume: string, keyword: string): Promise<string[]> => {
    return await invoke('search_usn_journal', { volume, keyword });
};

export const openDirectory = async (path: string): Promise<void> => {
    return await invoke('open_directory', { path });
};
