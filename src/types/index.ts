export interface Movie {
    id: number;
    tmdb_id?: number;
    title: string;
    original_title?: string;
    overview?: string;
    poster_path?: string;
    release_date?: string;
    vote_average?: number;
    local_video_path?: string;
    aliases?: string[];
    add_time: string;
    remark?: string;
    viewing_date?: string;
    category?: string; // 'movie' | 'tv'
    production_status?: string; // 'made' | 'unmade' | 'pending'
    matched_folders?: string[]; // Folders manually added/scanned for this movie
    genres?: string[];
    actors?: Person[];
    directors?: Person[];
    materials?: Material[];
}

export interface Person {
    id: number;
    name: string;
    original_name?: string;
    profile_path?: string;
}

export interface TmdbMovie {
    id: number;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    overview?: string;
    poster_path?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    media_type?: string;
}

export interface TmdbConfig {
    images: {
        base_url: string;
        secure_base_url: string;
        backdrop_sizes: string[];
        logo_sizes: string[];
        poster_sizes: string[];
        profile_sizes: string[];
        still_sizes: string[];
    };
    change_keys: string[];
}

export interface AppConfig {
    tmdb_api_key?: string;
    match_threshold?: number;
    theme?: string;
    primary_color?: string;
    proxy?: string;
    save_images_locally?: boolean;
    image_save_path?: string;
    default_monitor_folders?: string[];
    monitor_folders_source?: string[];
    monitor_folders_finished?: string[];
    local_player_path?: string;
    ffmpeg_path?: string;
    ai_model_path?: string;
}

export interface AppInfo {
    version: string;
    db_path: string;
    default_image_path: string;
}

export interface MatchedFile {
    key: string;
    name: string;
    path: string;
    size: string;
    similarity: number;
    file_type: string;
    category?: string;
    modified_time?: string;
}

export interface Material {
    id: string;
    name: string;
    path: string;
    size: string;
    file_type: string;
    category?: string;
    add_time: string;
    modified_time?: string;
}

export interface DetectedPlayer {
    name: string;
    path: string;
    icon?: string;
}
