fn main() {
    // The window loads http://127.0.0.1, which Tauri treats as a remote origin:
    // app commands must be declared here and allowed in capabilities/default.json.
    let manifest = tauri_build::AppManifest::new().commands(&["check_signed_update", "install_signed_update"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)).expect("failed to run tauri-build");
}
