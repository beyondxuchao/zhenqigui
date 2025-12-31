import { invoke } from '@tauri-apps/api/core';
import { Movie, AppConfig, AppInfo, MatchedFile, Material, TmdbMovie } from '../types';

export interface DetectedPlayer {
    name: string;
    path: string;
    icon?: string;
}

export const greet = async (name: string): Promise<string> => {
    return await invoke('greet', { name });
};

export const getMovies = async (): Promise<Movie[]> => {
    return await invoke('get_movies');
};

export const readImage = async (path: string): Promise<string> => {
    return await invoke('read_image', { path });
};

export const getAppInfo = async (): Promise<AppInfo> => {
    return await invoke('get_app_info');
};

export const addMovie = async (movie: Movie): Promise<Movie> => {
    return await invoke('add_movie', { movie });
};

export const autoMatchMovie = async (movieId: number): Promise<void> => {
    return await invoke('auto_match_movie', { movieId });
};

export const deleteMovie = async (id: number): Promise<void> => {
    return await invoke('delete_movie', { id });
};

export const updateMovie = async (movie: Movie): Promise<Movie> => {
    return await invoke('update_movie', { movie });
};

export const updateMovieStatus = async (id: number, status: string): Promise<void> => {
    return await invoke('update_movie_status', { id, status });
};

export const getMovieDetails = async (id: number): Promise<Movie | null> => {
    return await invoke('get_movie_details', { id });
};

export const getTmdbDetails = async (tmdbId: number, mediaType?: string): Promise<any> => {
    return await invoke('get_tmdb_details', { tmdbId, mediaType });
};

export const getConfig = async (): Promise<AppConfig> => {
    return await invoke('get_config');
};

export const saveConfig = async (config: AppConfig): Promise<void> => {
    return await invoke('save_config', { config });
};

export const searchTmdbMovies = async (query: string, page: number = 1): Promise<TmdbMovie[]> => {
    return await invoke('search_tmdb_movies', { query, page });
};

export const testTmdbConnection = async (apiKey: string, proxy?: string): Promise<boolean> => {
    return await invoke('test_tmdb_connection', { apiKey, proxy });
};

export const scanDirectories = async (paths: string[], titles?: string[], threshold?: number): Promise<MatchedFile[]> => {
    return await invoke('scan_directories', { paths, titles, threshold });
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

export const openFileWithPlayer = async (path: string, playerPath?: string): Promise<void> => {
    return await invoke('open_file_with_player', { path, playerPath });
};

export const fetchDoubanSubject = async (id: string, isTv: boolean): Promise<any> => {
    return await invoke('fetch_douban_subject', { urlOrId: id, isTv });
};

export const scanForMovies = async (paths: string[]): Promise<Movie[]> => {
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

export const listFiles = async (path: string): Promise<string[]> => {
    return invoke('list_dir_files', { path });
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

// Audio Processor
export interface AudioPreset {
    id: number;
    name: string;
    input_boost: number;
    max_amplitude: number;
    lookahead: number;
    release_time: number;
}

export const saveAudioPreset = async (name: string, inputBoost: number, maxAmplitude: number, lookahead: number, releaseTime: number): Promise<number> => {
    return await invoke('save_audio_preset', { name, inputBoost, maxAmplitude, lookahead, releaseTime });
};

export const getAudioPresets = async (): Promise<AudioPreset[]> => {
    return await invoke('get_audio_presets');
};

export const deleteAudioPreset = async (id: number): Promise<void> => {
    return await invoke('delete_audio_preset', { id });
};

export const processAudioLimiter = async (input: string, output: string, inputBoost: number, maxAmplitude: number, lookahead: number, releaseTime: number): Promise<void> => {
    return await invoke('process_audio_limiter', { input, output, inputBoost, maxAmplitude, lookahead, releaseTime });
};
