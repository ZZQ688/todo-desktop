fn main() {
    #[cfg(feature = "tauri-runtime")]
    tauri_build::build()
}
