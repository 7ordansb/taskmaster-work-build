use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // The SQL plugin stores its SQLite file in app-local data. This keeps
            // user data stable when the portable release folder is replaced.
            let data_dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(data_dir)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Taskmaster");
}
