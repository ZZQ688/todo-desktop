mod commands;
pub mod storage;
pub mod workspace;

use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let result = (|| -> Result<rusqlite::Connection, Box<dyn std::error::Error>> {
                let directory = app.path().app_data_dir()?;
                std::fs::create_dir_all(&directory)?;
                Ok(storage::open_database(&directory.join("todo.sqlite"))?)
            })();
            if let Err(error) = &result {
                eprintln!("Database initialization failed: {error}");
            }
            app.manage(commands::DatabaseState {
                connection: Mutex::new(result.ok()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_workspace,
            commands::mutate_workspace
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run the desktop application");
}
