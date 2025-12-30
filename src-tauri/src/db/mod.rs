use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use crate::models::{AppData, Movie, AppConfig, Material};
use anyhow::Result;
use dirs;
use rusqlite::{Connection, params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Serialize, Deserialize)]
struct LauncherConfig {
    data_root: String,
}

pub struct Database {
    conn: Mutex<Connection>,
    root_dir: PathBuf,
}

impl Database {
    fn get_launcher_config_path() -> PathBuf {
        let mut path = dirs::config_dir().expect("Could not find config directory");
        path.push("shuxge");
        std::fs::create_dir_all(&path).ok(); 
        path.push("launcher.json");
        path
    }

    fn get_data_root() -> Result<PathBuf> {
        let config_path = Self::get_launcher_config_path();
        if config_path.exists() {
            let content = fs::read_to_string(&config_path)?;
            let config: LauncherConfig = serde_json::from_str(&content)?;
            Ok(PathBuf::from(config.data_root))
        } else {
            let mut path = dirs::data_local_dir().ok_or(anyhow::anyhow!("Could not find local data directory"))?;
            path.push("shuxge");
            
            // Save default
            let config = LauncherConfig {
                data_root: path.to_string_lossy().to_string(),
            };
            fs::write(&config_path, serde_json::to_string_pretty(&config)?)?;
            
            Ok(path)
        }
    }

    pub fn new() -> Result<Self> {
        let path = Self::get_data_root()?;
        fs::create_dir_all(&path)?;
        
        let db_path = path.join("shuxge.db");
        let json_path = path.join("data.json");
        
        let conn = Connection::open(&db_path)?;
        
        // Enable WAL mode for better concurrency and performance
        // PRAGMA journal_mode returns the new mode, so we must consume the result or use query_row
        let _ : String = conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))?;
        
        // Init tables
        conn.execute(
            "CREATE TABLE IF NOT EXISTS movies (
                id INTEGER PRIMARY KEY,
                tmdb_id INTEGER,
                title TEXT NOT NULL,
                original_title TEXT,
                overview TEXT,
                poster_path TEXT,
                release_date TEXT,
                vote_average REAL,
                local_video_path TEXT,
                aliases TEXT,
                add_time TEXT,
                remark TEXT,
                viewing_date TEXT,
                category TEXT,
                production_status TEXT,
                matched_folders TEXT,
                genres TEXT,
                actors TEXT,
                directors TEXT,
                materialsvalue TEXT
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS audio_presets (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                input_boost REAL NOT NULL,
                max_amplitude REAL NOT NULL,
                lookahead REAL NOT NULL,
                release_time REAL NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        // Insert default preset
        conn.execute(
            "INSERT OR IGNORE INTO audio_presets (name, input_boost, max_amplitude, lookahead, release_time)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["配音剪辑", 12.0, -0.1, 5.0, 40.0],
        )?;

        // Create indexes for performance
        conn.execute("CREATE INDEX IF NOT EXISTS idx_movies_title ON movies (title)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_movies_original_title ON movies (original_title)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_movies_add_time ON movies (add_time)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_movies_release_date ON movies (release_date)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_movies_category ON movies (category)", [])?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )",
            [],
        )?;

        let db = Self {
            conn: Mutex::new(conn),
            root_dir: path.clone(),
        };

        // Migration check
        if json_path.exists() {
            if let Err(e) = db.migrate_from_json(&json_path) {
                eprintln!("Migration failed: {}", e);
            }
        }

        Ok(db)
    }

    fn migrate_from_json(&self, json_path: &PathBuf) -> Result<()> {
        let content = fs::read_to_string(json_path)?;
        let app_data: AppData = serde_json::from_str(&content)?;
        
        // Insert movies
        for movie in app_data.movies {
            let exists = self.get_movie(movie.id).is_some();
            if !exists {
                self.insert_movie_raw(movie)?;
            }
        }
        
        // Insert config
        self.save_config(app_data.config)?;
        
        // Rename json file
        let backup_path = json_path.with_extension("json.bak");
        fs::rename(json_path, backup_path)?;
        
        Ok(())
    }

    fn insert_movie_raw(&self, movie: Movie) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO movies (
                id, tmdb_id, title, original_title, overview, poster_path, release_date, 
                vote_average, local_video_path, aliases, add_time, remark, viewing_date, 
                category, production_status, matched_folders, genres, actors, directors, materials
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
            )",
            params![
                movie.id as i64,
                movie.tmdb_id.map(|id| id as i64),
                movie.title,
                movie.original_title,
                movie.overview,
                movie.poster_path,
                movie.release_date,
                movie.vote_average,
                movie.local_video_path,
                serde_json::to_string(&movie.aliases)?,
                movie.add_time,
                movie.remark,
                movie.viewing_date,
                movie.category,
                movie.production_status,
                serde_json::to_string(&movie.matched_folders)?,
                serde_json::to_string(&movie.genres)?,
                serde_json::to_string(&movie.actors)?,
                serde_json::to_string(&movie.directors)?,
                serde_json::to_string(&movie.materials)?
            ],
        )?;
        Ok(())
    }

    // Kept for compatibility if needed, though mostly unused now
    // pub fn save(&self) -> Result<()> {
    //    Ok(())
    // }

    pub fn get_root_dir(&self) -> PathBuf {
        self.root_dir.clone()
    }

    pub fn get_connection(&self) -> &Mutex<Connection> {
        &self.conn
    }

    fn set_data_root_config(new_path: &str) -> Result<()> {
        let config_path = Self::get_launcher_config_path();
        let config = LauncherConfig {
            data_root: new_path.to_string(),
        };
        fs::write(&config_path, serde_json::to_string_pretty(&config)?)?;
        Ok(())
    }

    pub fn move_data_directory(&self, new_path: &str) -> Result<()> {
        let new_path_buf = PathBuf::from(new_path);
        if !new_path_buf.exists() {
            fs::create_dir_all(&new_path_buf)?;
        }

        let conn = self.conn.lock().unwrap();
        let db_dest = new_path_buf.join("shuxge.db");
        // Backup the database to the new location safely
        conn.execute("VACUUM INTO ?1", params![db_dest.to_string_lossy().to_string()])?;
        
        // Recursive copy helper
        fn copy_dir_all(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> std::io::Result<()> {
            fs::create_dir_all(&dst)?;
            for entry in fs::read_dir(src)? {
                let entry = entry?;
                let ty = entry.file_type()?;
                let path = entry.path();
                let name = entry.file_name();
                
                // Skip DB files as we already vacuumed them
                if name == "shuxge.db" || name == "shuxge.db-wal" || name == "shuxge.db-shm" {
                    continue; 
                }
                
                let dst_path = dst.as_ref().join(name);
                if ty.is_dir() {
                    copy_dir_all(path, dst_path)?;
                } else {
                    fs::copy(path, dst_path)?;
                }
            }
            Ok(())
        }
        
        copy_dir_all(&self.root_dir, &new_path_buf)?;
        
        // Update launcher config
        Self::set_data_root_config(new_path)?;
        
        Ok(())
    }

    pub fn add_movie(&self, mut movie: Movie) -> Result<Movie> {
        let conn = self.conn.lock().unwrap();
        
        // Check duplicates by TMDB ID if present
        if let Some(tmdb_id) = movie.tmdb_id {
             let count: i64 = conn.query_row(
                 "SELECT count(*) FROM movies WHERE tmdb_id = ?1",
                 params![tmdb_id as i64],
                 |row| row.get(0),
             )?;
             if count > 0 {
                 return Err(anyhow::anyhow!("该影视已存在于库中"));
             }
        }
        
        conn.execute(
            "INSERT INTO movies (
                tmdb_id, title, original_title, overview, poster_path, release_date, 
                vote_average, local_video_path, aliases, add_time, remark, viewing_date, 
                category, production_status, matched_folders, genres, actors, directors, materials
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19
            )",
            params![
                movie.tmdb_id.map(|id| id as i64),
                movie.title,
                movie.original_title,
                movie.overview,
                movie.poster_path,
                movie.release_date,
                movie.vote_average,
                movie.local_video_path,
                serde_json::to_string(&movie.aliases)?,
                movie.add_time,
                movie.remark,
                movie.viewing_date,
                movie.category,
                movie.production_status,
                serde_json::to_string(&movie.matched_folders)?,
                serde_json::to_string(&movie.genres)?,
                serde_json::to_string(&movie.actors)?,
                serde_json::to_string(&movie.directors)?,
                serde_json::to_string(&movie.materials)?
            ],
        )?;
        
        let id = conn.last_insert_rowid() as u64;
        movie.id = id;
        
        Ok(movie)
    }

    fn row_to_movie(row: &Row) -> Result<Movie, rusqlite::Error> {
        let aliases_str: Option<String> = row.get("aliases")?;
        let matched_folders_str: Option<String> = row.get("matched_folders")?;
        let genres_str: Option<String> = row.get("genres")?;
        let actors_str: Option<String> = row.get("actors")?;
        let directors_str: Option<String> = row.get("directors")?;
        let materials_str: Option<String> = row.get("materials")?;

        Ok(Movie {
            id: row.get::<_, i64>("id")? as u64,
            tmdb_id: row.get::<_, Option<i64>>("tmdb_id")?.map(|id| id as u64),
            title: row.get("title")?,
            original_title: row.get("original_title")?,
            overview: row.get("overview")?,
            poster_path: row.get("poster_path")?,
            release_date: row.get("release_date")?,
            vote_average: row.get("vote_average")?,
            local_video_path: row.get("local_video_path")?,
            aliases: aliases_str.and_then(|s| serde_json::from_str(&s).ok()),
            add_time: row.get::<_, String>("add_time")?, 
            remark: row.get("remark")?,
            viewing_date: row.get("viewing_date")?,
            category: row.get("category")?,
            production_status: row.get("production_status")?,
            matched_folders: matched_folders_str.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default(),
            genres: genres_str.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default(),
            actors: actors_str.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default(),
            directors: directors_str.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default(),
            materials: materials_str.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default(),
        })
    }

    pub fn get_movies(&self) -> Vec<Movie> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT * FROM movies ORDER BY id DESC").unwrap();
        let movie_iter = stmt.query_map([], |row| Self::row_to_movie(row)).unwrap();

        let mut movies = Vec::new();
        for movie in movie_iter {
            if let Ok(m) = movie {
                movies.push(m);
            }
        }
        movies
    }

    pub fn delete_movie(&self, id: u64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM movies WHERE id = ?1", params![id as i64])?;
        Ok(())
    }

    pub fn update_movie(&self, movie: Movie) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE movies SET 
                tmdb_id = ?1, title = ?2, original_title = ?3, overview = ?4, poster_path = ?5, 
                release_date = ?6, vote_average = ?7, local_video_path = ?8, aliases = ?9, 
                add_time = ?10, remark = ?11, viewing_date = ?12, category = ?13, 
                production_status = ?14, matched_folders = ?15, genres = ?16, actors = ?17, 
                directors = ?18, materials = ?19
             WHERE id = ?20",
            params![
                movie.tmdb_id.map(|id| id as i64),
                movie.title,
                movie.original_title,
                movie.overview,
                movie.poster_path,
                movie.release_date,
                movie.vote_average,
                movie.local_video_path,
                serde_json::to_string(&movie.aliases)?,
                movie.add_time,
                movie.remark,
                movie.viewing_date,
                movie.category,
                movie.production_status,
                serde_json::to_string(&movie.matched_folders)?,
                serde_json::to_string(&movie.genres)?,
                serde_json::to_string(&movie.actors)?,
                serde_json::to_string(&movie.directors)?,
                serde_json::to_string(&movie.materials)?,
                movie.id as i64
            ],
        )?;
        Ok(())
    }

    pub fn update_movie_status(&self, id: u64, status: String) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE movies SET production_status = ?1 WHERE id = ?2",
            params![status, id as i64]
        )?;
        Ok(())
    }
    
    pub fn get_movie(&self, id: u64) -> Option<Movie> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT * FROM movies WHERE id = ?1", 
            params![id as i64], 
            |row| Self::row_to_movie(row)
        ).optional().unwrap_or(None)
    }

    pub fn get_config(&self) -> AppConfig {
        let conn = self.conn.lock().unwrap();
        let res: Result<String, rusqlite::Error> = conn.query_row(
            "SELECT value FROM settings WHERE key = 'config'",
            [],
            |row| row.get(0),
        );
        
        match res {
            Ok(json) => serde_json::from_str(&json).unwrap_or_else(|_| AppConfig::default()),
            Err(_) => AppConfig::default(),
        }
    }

    pub fn save_config(&self, config: AppConfig) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let json = serde_json::to_string(&config)?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('config', ?1)",
            params![json],
        )?;
        Ok(())
    }

    // New methods to support commands/mod.rs

    pub fn add_material(&self, movie_id: u64, material: Material) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        let materials_json: String = conn.query_row(
            "SELECT materials FROM movies WHERE id = ?1",
            params![movie_id as i64],
            |row| row.get(0)
        )?;
        
        let mut materials: Vec<Material> = serde_json::from_str(&materials_json).unwrap_or_default();
        
        if !materials.iter().any(|m| m.path == material.path) {
            materials.push(material);
            let new_json = serde_json::to_string(&materials)?;
            conn.execute(
                "UPDATE movies SET materials = ?1 WHERE id = ?2",
                params![new_json, movie_id as i64]
            )?;
        }
        Ok(())
    }

    pub fn add_materials(&self, movie_id: u64, new_materials: Vec<Material>) -> Result<()> {
        println!("[DB] add_materials called for movie_id: {} with {} items", movie_id, new_materials.len());
        let conn = self.conn.lock().unwrap();
        
        let materials_json: String = conn.query_row(
            "SELECT materials FROM movies WHERE id = ?1",
            params![movie_id as i64],
            |row| row.get(0)
        )?;
        
        let mut materials: Vec<Material> = serde_json::from_str(&materials_json).unwrap_or_default();
        println!("[DB] Current materials count: {}", materials.len());
        let mut updated = false;

        for mat in new_materials {
            if !materials.iter().any(|m| m.path == mat.path) {
                println!("[DB] Adding new material: {}", mat.path);
                materials.push(mat);
                updated = true;
            } else {
                println!("[DB] Material already exists: {}", mat.path);
            }
        }
        
        if updated {
            println!("[DB] Updating DB with {} total materials", materials.len());
            let new_json = serde_json::to_string(&materials)?;
            conn.execute(
                "UPDATE movies SET materials = ?1 WHERE id = ?2",
                params![new_json, movie_id as i64]
            )?;
        } else {
            println!("[DB] No updates needed");
        }
        Ok(())
    }

    pub fn remove_material(&self, movie_id: u64, material_id: String) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        
        let materials_json: String = conn.query_row(
            "SELECT materials FROM movies WHERE id = ?1",
            params![movie_id as i64],
            |row| row.get(0)
        )?;
        
        let mut materials: Vec<Material> = serde_json::from_str(&materials_json).unwrap_or_default();
        let initial_len = materials.len();
        
        materials.retain(|m| m.id != material_id);
        
        if materials.len() != initial_len {
            let new_json = serde_json::to_string(&materials)?;
            conn.execute(
                "UPDATE movies SET materials = ?1 WHERE id = ?2",
                params![new_json, movie_id as i64]
            )?;
        }
        Ok(())
    }

    pub fn clear_all_data(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM movies", [])?;
        // Optional: Reset settings? Keeping settings is usually better.
        // conn.execute("DELETE FROM settings", [])?;
        Ok(())
    }

    pub fn backup(&self, path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("VACUUM INTO ?1", params![path])?;
        Ok(())
    }

    pub fn restore(&self, path: &str) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        
        // Safety: Ensure we are in a transaction or atomic block
        let tx = conn.transaction()?;
        
        // Delete current data
        tx.execute("DELETE FROM movies", [])?;
        tx.execute("DELETE FROM settings", [])?;
        
        // Attach backup
        // Note: ATTACH cannot be run inside a transaction? 
        // Actually, ATTACH is not allowed in transaction in some versions, but let's see.
        // "ATTACH DATABASE statements are not allowed within a transaction."
        // So we must do it outside.
        drop(tx); // Rollback/Commit empty? Just drop to release borrow, but we need to commit deletes?
        // No, we want to be atomic.
        
        // Alternative:
        // 1. ATTACH
        // 2. BEGIN
        // 3. DELETE FROM main.movies
        // 4. INSERT INTO main.movies SELECT * FROM attached.movies
        // 5. COMMIT
        // 6. DETACH
        
        conn.execute("ATTACH DATABASE ?1 AS restore_db", params![path])?;
        
        let result = (|| -> Result<()> {
            let tx = conn.transaction()?;
            tx.execute("DELETE FROM movies", [])?;
            tx.execute("DELETE FROM settings", [])?;
            
            tx.execute("INSERT INTO main.movies SELECT * FROM restore_db.movies", [])?;
            tx.execute("INSERT INTO main.settings SELECT * FROM restore_db.settings", [])?;
            
            tx.commit()?;
            Ok(())
        })();
        
        // Always detach
        conn.execute("DETACH DATABASE restore_db", [])?;
        
        result
    }

    pub fn clear_cache(&self) -> Result<()> {
        // Assume cache is in 'images' folder or similar inside root_dir
        // Or strictly 'cache' if it exists.
        // Since we didn't have 'cache' dir explicitly defined, maybe it refers to images?
        // Let's assume images folder if user wants to clear cache (often means clearing downloaded images).
        let images_dir = self.root_dir.join("images");
        if images_dir.exists() {
            fs::remove_dir_all(&images_dir)?;
            fs::create_dir_all(&images_dir)?;
        }
        Ok(())
    }
}
