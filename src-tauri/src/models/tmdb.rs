use serde::{Deserialize, Serialize};
use reqwest::blocking::Client;

const TMDB_BASE_URL: &str = "https://api.themoviedb.org/3";

#[derive(Debug, Serialize, Deserialize)]
pub struct TmdbSearchResult {
    pub results: Vec<TmdbMovie>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TmdbCredits {
    pub cast: Vec<TmdbCast>,
    pub crew: Vec<TmdbCrew>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TmdbCast {
    pub id: u64,
    pub name: String,
    pub original_name: Option<String>,
    pub profile_path: Option<String>,
    pub character: Option<String>,
    pub order: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TmdbCrew {
    pub id: u64,
    pub name: String,
    pub original_name: Option<String>,
    pub profile_path: Option<String>,
    pub job: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TmdbGenre {
    pub id: u64,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TmdbDetailResponse {
    pub credits: Option<TmdbCredits>,
    pub genres: Option<Vec<TmdbGenre>>,
    pub runtime: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TmdbMovie {
    pub id: u64,
    pub title: Option<String>,
    pub name: Option<String>, // For TV shows
    pub original_title: Option<String>,
    pub original_name: Option<String>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub release_date: Option<String>,
    pub first_air_date: Option<String>,
    pub vote_average: Option<f64>,
    pub media_type: Option<String>,
}



use reqwest::header;

pub fn create_client(proxy: Option<String>) -> Result<Client, String> {
    let mut headers = header::HeaderMap::new();
    headers.insert("accept", header::HeaderValue::from_static("application/json"));

    let mut client_builder = Client::builder()
        .default_headers(headers)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    if let Some(proxy_url) = proxy {
        if !proxy_url.trim().is_empty() {
             // println!("Using Proxy: {}", proxy_url);
             let proxy = reqwest::Proxy::all(&proxy_url).map_err(|e| format!("Proxy config error: {}", e))?;
             client_builder = client_builder.proxy(proxy);
        }
    }
    
    client_builder.build().map_err(|e| e.to_string())
}

pub fn search_tmdb(api_key: &str, query: &str, page: u64, proxy: Option<String>) -> Result<Vec<TmdbMovie>, String> {
    let client = create_client(proxy)?;
    let url = format!("{}/search/multi", TMDB_BASE_URL);
    
    let params = [
        ("api_key", api_key),
        ("query", query),
        ("language", "zh-CN"),
        ("page", &page.to_string()),
    ];

    let response = client.get(&url)
        .query(&params)
        .send()
        .map_err(|e| e.to_string())?;
    
    if response.status().is_success() {
        let result: TmdbSearchResult = response.json().map_err(|e| e.to_string())?;
        Ok(result.results)
    } else {
        Err(format!("TMDB API Error: {}", response.status()))
    }
}

pub fn test_connection(api_key: &str, proxy: Option<String>) -> Result<String, String> {
    let client = create_client(proxy)?;
    let url = format!("{}/configuration", TMDB_BASE_URL);
    
    let response = client.get(&url)
        .query(&[("api_key", api_key)])
        .send()
        .map_err(|e| {
            if e.is_timeout() {
                "Connection Timed Out. Please check your network or proxy settings.".to_string()
            } else if e.is_connect() {
                format!("Connection Failed: Could not connect to TMDB. Check proxy settings. Error: {}", e)
            } else {
                format!("Connection Failed: {}", e)
            }
        })?;

    if response.status().is_success() {
        Ok("Connection Successful!".to_string())
    } else {
        Err(format!("TMDB API Error: {} - {}", response.status(), response.text().unwrap_or_default()))
    }
}

pub fn get_movie_details(api_key: &str, id: u64, media_type: &str, proxy: Option<String>) -> Result<TmdbDetailResponse, String> {
    let client = create_client(proxy)?;
    let url = format!("{}/{}/{}", TMDB_BASE_URL, media_type, id); // media_type should be "movie" or "tv"
    
    let params = [
        ("api_key", api_key),
        ("language", "zh-CN"),
        ("append_to_response", "credits"),
    ];

    let response = client.get(&url)
        .query(&params)
        .send()
        .map_err(|e| e.to_string())?;
    
    if response.status().is_success() {
        let result: TmdbDetailResponse = response.json().map_err(|e| e.to_string())?;
        Ok(result)
    } else {
        Err(format!("TMDB API Error: {}", response.status()))
    }
}
