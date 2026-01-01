use tauri::State;
use crate::db::Database;
use crate::models::{Movie, Person};
use crate::models::tmdb::search_tmdb;
use regex::Regex;

#[tauri::command]
pub fn get_tmdb_details(state: State<Database>, tmdb_id: u64, media_type: Option<String>) -> Result<crate::models::tmdb::TmdbDetailResponse, String> {
    let config = state.get_config();
    let api_key = config.tmdb_api_key.ok_or("TMDB API Key not set")?;
    let proxy = config.proxy;
    let m_type = media_type.unwrap_or_else(|| "movie".to_string());
    crate::models::tmdb::get_movie_details(&api_key, tmdb_id, &m_type, proxy)
}

#[tauri::command]
pub fn search_tmdb_movies(state: State<Database>, query: String, page: u64) -> Result<Vec<crate::models::tmdb::TmdbMovie>, String> {
    let config = state.get_config();
    let api_key = config.tmdb_api_key.ok_or("TMDB API Key not set")?;
    let proxy = config.proxy;
    search_tmdb(&api_key, &query, page, proxy)
}

#[tauri::command]
pub fn test_tmdb_connection(api_key: String, proxy: Option<String>) -> Result<bool, String> {
    crate::models::tmdb::test_connection(&api_key, proxy).map(|_| true)
}

#[tauri::command]
pub async fn fetch_douban_subject(url_or_id: String, is_tv: Option<bool>) -> Result<Movie, String> {
    let mut douban_id = url_or_id.clone();
    
    // Check if it is a URL
    if url_or_id.contains("douban.com") {
        let re = Regex::new(r"subject/(\d+)").map_err(|e| e.to_string())?;
        if let Some(caps) = re.captures(&url_or_id) {
            if let Some(m) = caps.get(1) {
                douban_id = m.as_str().to_string();
            }
        }
    }

    // Use the API from wp-douban (fatesinger.com)
    // Reference: wp-douban-4.4.3/src/functions.php fetch_subject
    // Use /tv/ endpoint if is_tv is explicitly true, otherwise default to /movie/ (which handles redirects)
    let endpoint = if is_tv.unwrap_or(false) { "tv" } else { "movie" };
    let url = format!("https://fatesinger.com/dbapi/{}/{}?ck=xgtY&for_mobile=1", endpoint, douban_id);
    
    println!("Fetching Douban subject: {}", url);

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !res.status().is_success() {
         return Err(format!("Douban API returned status: {}", res.status()));
    }

    let data: serde_json::Value = res.json().await.map_err(|e| format!("JSON parse error: {}", e))?;

    // Parse into Movie struct
    let mut movie = Movie::default();
    
    if let Some(title) = data["title"].as_str() {
        movie.title = title.to_string();
    }
    
    if let Some(img) = data["pic"]["large"].as_str() {
        // Try to upgrade to larger image if possible, though 'large' is usually good enough
        movie.poster_path = Some(img.to_string());
    } else if let Some(img) = data["pic"]["normal"].as_str() {
        movie.poster_path = Some(img.to_string());
    }
    
    // Use intro for description if available, fallback to card_subtitle
    if let Some(intro) = data["intro"].as_str() {
        movie.overview = Some(intro.to_string());
    } else if let Some(subtitle) = data["card_subtitle"].as_str() {
        movie.overview = Some(subtitle.to_string());
    }

    // Release date
    if let Some(pubdates) = data["pubdate"].as_array() {
        if let Some(first) = pubdates.first().and_then(|v| v.as_str()) {
             movie.release_date = Some(first.to_string());
        }
    }
    if movie.release_date.is_none() {
        if let Some(year) = data["year"].as_str() {
             movie.release_date = Some(year.to_string());
        } else if let Some(year) = data["year"].as_u64() {
             movie.release_date = Some(year.to_string());
        }
    }
    
    if let Some(rating) = data["rating"]["value"].as_f64() {
        movie.vote_average = Some(rating);
    } else if let Some(rating_str) = data["rating"]["value"].as_str() {
        movie.vote_average = rating_str.parse::<f64>().ok();
    }

    if let Some(genres) = data["genres"].as_array() {
        movie.genres = genres.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
    }

    // Attempt to parse directors and actors if available in the API response
    // Common Douban API structure for these fields
    if let Some(directors) = data["directors"].as_array() {
        for d in directors {
             if let Some(name) = d["name"].as_str() {
                 let clean_name = name.split_whitespace().next().unwrap_or(name).to_string();
                 movie.directors.push(Person {
                     id: 0,
                     name: clean_name,
                     original_name: None,
                     profile_path: d["avatars"]["large"].as_str().map(|s| s.to_string())
                 });
             }
        }
    }

    if let Some(actors) = data["actors"].as_array() {
        for a in actors {
             if let Some(name) = a["name"].as_str() {
                 let clean_name = name.split_whitespace().next().unwrap_or(name).to_string();
                 movie.actors.push(Person {
                     id: 0,
                     name: clean_name,
                     original_name: None,
                     profile_path: a["avatars"]["large"].as_str().map(|s| s.to_string())
                 });
             }
        }
    }

    movie.add_time = chrono::Utc::now().to_rfc3339();
    
    // Determine category
    // The API URL used 'movie' but douban IDs are unique across types usually?
    // Or check data["subtype"] if available
    if let Some(subtype) = data["subtype"].as_str() {
        if subtype == "tv" {
            movie.category = Some("tv".to_string());
        } else {
            movie.category = Some("movie".to_string());
        }
    } else {
        movie.category = Some("movie".to_string());
    }

    Ok(movie)
}
