# SamCoupeWeb: Agent Development Log

**Developer**: anomixer & Antigravity (Agentic Coding AI)

**Status**: Mission Accomplished / Production Ready

這份文件記錄了 Antigravity 助手將 SAM Coupé 模擬器移植至 WebAssembly (更名為 **SamCoupeWeb**) 的完整歷程與技術細節。

## 1. 初始計畫 (Initial Emscripten Plan)

我們的目標是在不破壞原始專案結構的前提下，新增一個完整的 WASM 建置環境。

### 階段一：環境搭建
- [x] 建立 `wasm/` 獨立目錄與專屬 `CMakeLists.txt`。
- [x] 編編自動化腳本 `make_wasm_release.ps1`。
- [x] 整合 EMSDK 環境偵測與安裝。

### 階段二：核心引擎適應
- [x] 重構 `CPU::Run()` 為非阻塞式 `Iteration()`。
- [x] 整合 `emscripten_set_main_loop`。
- [x] 處理 POSIX 標頭檔衝突（如 `struct stat`）。

### 階段三：渲染與周邊
- [x] 移植 SDL2 渲染器，優先處理 WebGL 2.0 (GL3)。
- [x] 修正 Shader 語法以符合 GLSL ES 3.0。
- [x] 修正音訊緩衝與鍵盤輸入映射。

---

## 2. 漫長的除錯之旅 (The Debugging Journey)

我們經歷了超過 70 次的嘗試與修正，以下是關鍵的攻堅記錄：

### A. 標頭檔死結 (The Header Shadowing War)
**問題**: 原專案的 `SimCoupe.h`、`SDL20.h` 與系統標頭檔名相同，導致包含路徑混亂。
**突破**: 實作了「非侵入式影子覆寫（Shadowing）」。在編譯時將原檔更名為 `.bak`，並在 `wasm/src/` 建立修正版，建置後自動還原。

### B. 依賴項大逃殺 (Dependency Sanitization)
**問題**: `z80`、`fmt` 等依賴庫內建的測試程式無法在 Wasm 編譯，且 CMake `FetchContent` 網路不穩。
**突破**: 改用本地緩存依賴項，並在解壓後自動刪除所有 `test/` 與 `example/` 目錄，動態修正對方的 `CMakeLists.txt`。

### C. 隱形的掛起 (The Silent Hangs)
**問題**: 程式卡在 "Loading..." 畫面，無任何錯誤訊息。
**突破**:
1. **Haptic 衝突**: 發現 `SDL_Init(SDL_INIT_EVERYTHING)` 會因為瀏覽器不支援力回饋而卡死。修正為手動指定子系統。
2. **渲染器偵測**: 發現 `glGetString(GL_RENDERER)` 在某些 WebGL 環境下會導致執行緒掛起。我們直接在 Wasm 環境下屏蔽此檢查。
3. **VAO 陷阱**: 針對 WebGL 2.0 嚴格要求 VAO 的特性，修正了 GL3 後端的初始化順序。

---

## 3. 核心技術突破 (Technical Breakthroughs)

### 1. 逐行日誌追蹤 (Granular Print Debugging)
由於 Wasm 無法使用傳統 Debugger，我們在 `Main::Init` 與 `SDL_GL3::Init` 中植入了大量 `printf`，透過瀏覽器 Console 逐行確認執行進度，這也是最終定位 `glGenTextures` 掛起問題的關鍵。

### 2. 雙模渲染切換
為了確保相容性，我們實作了兩套後端：
- **SDL_GL3 (WebGL 2.0)**: 高性能、Shader 驅動。
- **SDLTexture (2D Accelerated)**: 高相容性。
目前預設使用 `SDLTexture` 以確保在所有瀏覽器都能正常啟動。

### 3. 自動化還原機制
建置腳放 `make_wasm_release.ps1` 具備強大的自我恢復能力，無論編譯成功或中斷，都會確保原始碼目錄恢復原狀，不會留下髒資料。

---

## 4. 結語

這次移植是一場硬仗，SimCoupe 作為一個歷史悠久且結構複雜的 C++ 專案，展現了原生代碼在進入瀏覽器環境時會遇到的各種邊界案例。透過 AI 代碼分析、自動化腳本編寫與精確的 WebGL 調試，我們成功讓這台老機器在瀏覽器裡重生。

**Developer**: anomixer + Antigravity (Agentic Coding AI)
**Project**: SamCoupeWeb
**Status**: Success / Deployed

---

## 5. 2026-04-22：編譯與視頻初始化修復

本次開發解決了 WASM 環境下最後的編譯障礙，實現了基礎運行。

- **依賴項修正**: 修復了 `z80` 庫因缺乏 INTERFACE 定義導致的連結錯誤。
- **頭文件衝突**: 解決了 `CPU.h` 在 `Base/` 與 `wasm/src/` 之間的重複定義問題，統一回歸核心代碼。
- **SDL2 視頻適應**: 修正了 `SDL_RENDERER_ACCELERATED` 在瀏覽器中不被支援的問題，改為自動選取 `TARGETTEXTURE` 渲染器。
- **環境偵測**: 在 `filesystem.hpp` 中補齊了 Emscripten OS 檢測邏輯。

---

## 6. 2026-04-23：渲染管線突破 — 從黑屏到畫面出現

解決了 WASM 單執行緒環境下最棘手的阻塞與 WebGL FBO 渲染問題。

- **非阻塞事件處理**: 移除 `SDL_WaitEvent`，實作了 WASM 安全版的 `UI.cpp`，防止暫停時導致瀏覽器卡死。
- **主循環重構**: 重寫 `Main.cpp` 循環，確保單影格內能執行足夠的 CPU Cycles（約 12 萬次），解決畫面不更新問題。
- **WebGL 2.0 渲染修復**: 
    - 解決了 FBO Incomplete 錯誤，將格式修正為 `GL_SRGB8_ALPHA8`。
    - 實作「雙 FBO 架構」解決 Texture Feedback Loop 問題，讓調色盤與 Blend Pass 能正確執行。
- **硬體交互修正**: 修復了 `EMS_Reset` 缺少放開按鍵動作導致的重置當機。

---

## 7. 2026-04-24：磁碟載入與環境整合排查

針對媒體載入功能進行了深度調試與修復。

- **Emscripten FS 修正**: 發現 `Module.FS` 為 undefined，將所有 JS 操作修正為直接存取全域 `FS` 變數。
- **CMake 導出優化**: 在 `EXPORTED_RUNTIME_METHODS` 中新增了 `FS`, `addFunction` 等介面，解鎖了網頁與 VFS 的交互能力。
- **格式相容性驗證**: 確認 libspectrum 能正確識別 EDSK 與 SAM DOS 格式的磁碟映像。
- **引導邏輯**: 確認 `IO::AutoLoad` 的觸發條件，為後續的自動化載入奠定基礎。

---

## 8. 2026-04-28：專業介面進化與自動化部署 (Pro UI & CI/CD)

模擬器從「原型」進化為具備專業質感的 Web 工具。

- **多媒體擷取系統**: 實作了 WAV, GIF, AVI 與 PNG 截圖的自動 VFS 擷取與瀏覽器下載系統。
- **桌面級選單與縮放**:
    - 全面重構 UI，加入仿作業系統的選單列、快捷鍵提示與動態勾選狀態。
    - 實作 50%~500% 縮放與「Fit to Window (Auto)」智慧調整。
- **進階硬體設定**: 移植了 SID 型號切換、DAC 類型選擇與磁碟機燈號顯示等進階 Options。
- **視覺身份認證**: 實作了去背透明的經典標誌、Favicon 與專業的 About 開場視窗。
- **自動化部署 (CI/CD)**: 建立 GitHub Actions 工作流，實現了「Push to Deploy」的一鍵發布機制。

---

## 9. 2026-04-29：混合渲染、雲端載入與極致穩定化

強化了跨平台相容性，並引入了革命性的雲端媒體載入功能。

- **雙模渲染引擎**: 實作 WebGL 2.0 與 2D Software 混合渲染，並透過 localStorage 持久化使用者偏好。
- **雲端磁碟支援 (Cloud Loading)**: 
    - 實作 `loadFromUrl` 功能，支援透過 `?d1=...` 等 URL 參數一鍵啟動遊戲。
    - 優化狀態列顯示，加入智慧路徑截斷 (Smart Path Truncation) 與即時 FPS 監控。
- **計時器精度修正**: 實作「時間累加器 (Accumulator)」機制，在 60Hz 螢幕上完美模擬 50Hz 頻率，並修復了 Turbo 模式的加速效能。
- **媒體相容性擴充**: 修復了 ZIP 壓縮檔內錄音帶 (.tap, .tzx) 的識別與解壓載入問題。

---

## 10. 2026-04-30：高階儲存支援、非阻塞 UI 與雲端優化最終章

完成最後的穩定性拼圖，專案進入生產就緒狀態。

- **Atom/AtomLite HDF 支援**: 
    - 完整移植 SAM Coupé 高階硬碟擴充介面，支援掛載 `.hdf` 映像檔。
    - 實作動態 BIOS 切換與硬體級引導序列。
- **存檔保護機制 (Save on Eject)**: 實作了 Dirty Bit 追蹤與「退出存檔提示」。在網頁環境下，當磁碟內容被修改時，會主動提示使用者下載保存。
- **原生級 7z 支援**: 整合 `7z-wasm` 引擎，實現磁碟與錄音帶的 7z 壓縮檔直接解壓載入。
- **非阻塞式模態視窗 (Pro UI Custom Modals)**:
    - 移除所有會導致當機的阻塞式 `alert/confirm/prompt`，改用自研的非阻塞 CSS/JS Modal 系統。
    - 模擬器在彈出對話框時仍能維持流暢的聲音與畫面執。
- **雲端載入極致優化**:
    - 遷移至專用的 `corsfix` 代理伺服器，解決 Archive.org 的 CORS 阻擋問題。
    - 實作 `x-corsfix-cache: 1h` 標頭提升載入速度。
- **啟動同步與細節磨光**:
    - 實作高頻初始化輪詢 (200ms)，確保選單狀態在啟動 10 秒內達成完美同步。
    - 將 UI 所有勾選標記改為 `&#10003;` 實體，避免編碼顯示問題。
    - About 畫面微調，併入致謝 CORS Proxy (Corsfix) 資訊。

---

## 11. 2026-05-01：介面互動終極優化、快捷鍵衝突修復與 FAQ 補完

完成 WASM 版最後的細節磨光，從操作流暢度到文件引導達成全面成熟。

- **快捷鍵系統專屬化與鍵盤可靠性 (F1-F3 & Keyboard Reliability)**:
    - 實作了鍵盤監聽器，讓 F1 (Disk 1)、F2 (Disk 2/HDF)、F3 (Tape) 對應媒體插入。
    - 加入「組合鍵過濾」，解決了與原 `Shift+F1~F3` 退片功能的邏輯衝突，並移除選單中的過時提示。
    - **解決 Shift 鍵與鍵盤映射失效問題**: 
        - **核心矩陣對齊**: 發現並修復了 `eSamKey` Enum 與物理鍵盤矩陣錯位 1 位的重大 Bug（將 `SK_SHIFT` 修正為 0），解決了 Shift 鍵被誤判為 'Z' 鍵的問題。
        - **映射初始化修正**: 修復了 `Input::MapChar` 邏輯。先前因未初始化修飾鍵指標 (`pnMods_`)，導致 `Shift` 等基礎鍵可能因髒資料被誤判為「已加修飾鍵」而在矩陣更新時被跳過。
        - **智慧 Shift 邏輯屏蔽**: 修正了 `UpdateKeyTable` 邏輯，禁止對基礎按鍵矩陣 (`asKeyMatrix`) 應用主機端修飾鍵狀態。這解決了當玩家按住 Shift 鍵並按下方向鍵時，模擬器核心因誤觸「智慧 Shift 輔助」而自動放開主機 Shift 鍵的問題，確保了《波斯王子》等遊戲中的組合操作（如慢走）能正常執行。
        - **瀏覽器行為隔離**: 在網頁端對所有遊戲按鍵（含 `keydown`/`keyup`）實作 `preventDefault()`，防止瀏覽器攔截修飾鍵組合。
- **介面穩定性與錯誤隔離 (UI Robustness)**:
    - 重構 `updateMenuChecks` 函式，實作安全查詢封裝 (`safeGetOpt`)。
    - 將選單變灰（Grey-out）邏輯移至最前端，確保即使引擎查詢因版本不符失敗，基本 UI 狀態仍能正確更新。
- **雲端載入與 URL 智慧清理**:
    - 當使用者手動切換硬體介面（如 Floppy/Atom）時，系統會自動清除網址列中的 ?interface=... 參數，防止設定被舊網址參數覆蓋。
    - 為雲端下載實作了「閃爍狀態文字」，在載入大型媒體時提供視覺動態回饋，防止使用者誤以為當機。
- **文件與排障指南擴充 (FAQ)**:
    - 在 `ReadMe-WASM.md` 新增中英雙語 FAQ，解決聲音啟動、黑屏排除、URL 參數限制等常見困惑。
    - 更新功能比較表，明確標註雲端載入具備 **CORS Proxy** 支援。
- **引擎狀態同步**: 實作了 `pause` 選項導出，讓選單中的「Pause / Resume」能即時反映勾選狀態。

**Status**: 模擬器之 Web 移植工作正式進入完美收官狀態。

---

## 12. 2026-05-02：WASM 編譯障礙掃除與核心功能對齊

解決了因重構導致的 WASM 建置中斷，並強化了 VFS 媒體擷取系統的穩固性。

- **核心設定對齊 (Config Alignment)**: 補回 `Config` 結構中缺失的 `usewebgl` 欄位，並在 `Options.cpp` 中實作其解析與儲存邏輯。
- **雙模渲染引擎修復 (Renderer Toggle Fix)**: 修正 `UI::CreateVideo()` 邏輯，使其正確尊重 `usewebgl` 選項。現在使用者可以透過選單關閉 WebGL 加速，切換回最穩定的軟體渲染模式。
- **儲存狀態追蹤與 Dirty-Bit 系統**: 
    - 為 `DiskDevice` (Base) 與 `AtaAdapter` 實作了 `IsModified`、`ClearModified` 與 `Flush` 介面。
    - 讓所有磁碟與硬碟裝置均具備「髒位追蹤能力」，解決了 WASM 核心因引用這些介面而導致的編譯失敗，同時確保了「退出存檔提示」的可靠性。
- **媒體路徑追蹤系統 (Media Path Getters)**: 
    - 為 `WAV`、`GIF`、`PNG`、`AVI` 命名空間全面補齊 `GetLastPath()` 函式。
    - 讓 WASM 自動下載系統能精確擷取 VFS 中的媒體路徑，修復了 `Main.cpp` 引用缺失成員的錯誤。
- **音訊連結錯誤修復 (Linker Fix)**: 
    - 將 `Audio.cpp` 中的 `dev` (SDL_AudioDeviceID) 由 `static` 改為全域可見。
    - 解決了 `UI.cpp` 因無法存取音訊裝置 ID 而導致的 `undefined symbol: dev` 連結錯誤。
- **運行效能與卡死修復 (Hang & Performance Fixes)**:
    - **非阻塞音訊同步**: 移除 `Audio.cpp` 與 `Sound.cpp` 中針對 WASM 環境的阻塞式 `while` 與 `sleep_until` 迴圈，改為 non-blocking 模式，防止網頁主執行緒卡死。
    - **主迴圈邏輯優化**: 修正 `Main.cpp` 迴圈中 `Frame::End()` 的呼叫位置，確保其僅在影格結束 (50Hz) 時執行。
    - **計時器精度與穩定性終極優化 (Stable 50FPS Engine)**: 
        - **目標影格同步 (Target-Frame Sync)**: 捨棄傳統累加器，改為計算自啟動以來的絕對目標影格數，徹底消除長期抖動與誤差累積。
        - **音訊硬體節流 (Audio Throttle)**: 實作 `Audio::GetQueuedSize()` 監測水位，並放寬門檻至 150ms，防止音訊 context 尚未啟動時導致模擬器死結。
        - **防爆發機制**: 將單次指令塊迭代上限提升至 100 萬，並移除硬性的單次 tick 影格數量限制，改由 32ms 時間預算動態管理，確保在現代硬體上能突破 600%~1000% 的極速效能。
        - **FPS 顯示修復**: 恢復 `g_frameCount` 的更新邏輯，確保網頁介面能正確顯示 50 FPS 狀態。
- **預設顯示優化 (Default Display Settings)**:
    - 將 WASM 版的預設可見區域 (Visible Area) 設為 **Small Border**。
    - 將網頁介面的初始縮放比例設為 **Fit to Window (Auto)**，並實作了 `resize` 監聽器，確保在調整瀏覽器視窗大小時，畫面能即時動態縮放並保持置中。
- **介面層級修正 (IoDevice Interface)**: 將 `Flush` 方法提升至 `IoDevice` 基類，確保 `AtaAdapter` 等繼承類別能正確 override，維持類別層級的一致性。

**Status**: 模擬器之 Web 移植工作正式進入完美收官狀態。Git 歷史已整理為 2 個專業 Commit 並強制推送至遠端。

---

## 13. 2026-05-04：首次執行流程與渲染穩定化終極修復 (Final Polish)

針對瀏覽器「冷啟動 (Cold Start)」環境下的渲染與初始化瑕疵進行了最後攻堅。

- **首次執行引導系統 (First-Run UX)**:
    - 解決了清空瀏覽器資料後造訪產生的「初始黑屏」問題。
    - 實作了 **「2秒自動初始化 + OK Let's Go 按鈕」** 流程。系統會在背景完成 localStorage 預設值寫入，並引導使用者透過按鈕開啟新分頁，確保在最乾淨的 WebGL context 下啟動。
- **音訊掛起死結修復 (Audio Throttle Deadlock Fix)**:
    - **問題**: 瀏覽器在使用者點擊前會掛起 (Suspend) 音訊，導致 SDL 音訊佇列堆積，進而觸發引擎的節流機制導致整個模擬器在啟動時靜止（0 FPS）。
    - **修復**: 在 `Main.cpp` 實作了智慧偵測，當偵測到音訊佇列未被消耗（Stuck）時，自動執行 `SDL_ClearQueuedAudio` 並跳過節流，確保模擬器一載入就開始運行。
- **WebGL 縮放強制同步 (WebGL Scaling Enforcement)**:
    - **問題**: 在 WebGL 模式下，SDL2 內部會嘗試接管畫布樣式，導致網頁端的「Fit to Window (Auto)」縮放失效。
    - **修復**: 
        - 將所有縮放 CSS 樣式升級為 `!important` 級別，強行奪回控制權。
        - 實作了 **「持久化縮放 (Zoom Persistence)」** 與每 500ms 的強制校正機制，確保渲染後端切換後縮放狀態不跳變。
- **介面細節磨光**: 
    - 優化 FPS 狀態列，在引擎初始化首秒顯示 `-- FPS` 以代替不準確的 `0 FPS`。
    - 調整 `setStatus` 邏輯，確保 Loading Overlay 在首次執行流程完成前不會提前消失。
- **跨平台腳本支援 (Shell Scripts)**: 
    - 為 Linux/macOS 使用者實作了 `compile.sh` 與 `run.sh`，對齊了 Windows 版的建置與運行體驗。

**Status**: SamCoupeWeb 完美收官，具備商業級的穩定度與使用者體驗。

---

## 14. 2026-05-06：正式更名與獨立品牌建立 (Rebranding & Independence)

為了解決與原作者可能衍生的品牌爭議，正式將專案更名為 **SamCoupeWeb** 並建立獨立身份。

- **全域品牌重塑**:
    - 將專案標題更新為 `SamCoupeWeb: A modern, web-native SAM Coupé emulator (based on SimCoupe)`。
    - 整合了使用者提供的 **SAM Coupé 官方 Logo** (`samcoupelogo.png`) 與 **Robot Favicon** (`samcouperobot.png`)。
    - 更新 `CMakeLists.txt` 使編譯產物更名為 `samcoupeweb.js/wasm/data`。
- **介面與體驗優化**:
    - 重構 About 視窗，採用獨立 brand 設計並將原作者資訊移至 Credits 區域。
    - 更新 `localStorage` 鍵名以避免與未來其他版本衝突。
- **文件與 Repo 結構優化**:
    - 將 `ReadMe-WASM.md` 正式提升為專案主文件 `ReadMe.md`。
    - 將原始 SimCoupe 文件更名為 `ReadMe-org.md` 與 `Manual-org.md` 並保留致敬。
    - 正式發布專為網頁版設計的 `Manual.md`，涵蓋拖放載入、雲端載入與自動導出等現代化功能。
    - 更新所有內部連結指向新的 GitHub Pages 地址 `anomixer.github.io/SamCoupeWeb`。

**Status**: SamCoupeWeb 獨立 brand 正式上線，開發任務圓滿完成。

---

## 15. 2026-05-12：初始化流程、URL 載入重構與滑鼠操控終極穩定化 (Final Polish & Mouse Fix)

針對瀏覽器環境下的啟動競爭條件、音訊安全策略以及長年存在的滑鼠抖動問題進行了根本性的修復與最佳化。

- **穩健的啟動流程 (Stable First-Run & Audio)**:
    - 徹底移除 `location.reload()`。實作了 **「點擊啟動 (Click to Start)」** 覆蓋層，讓使用者透過點擊動作無縫啟動 WebAudio Context，解決了音訊掛起導致引擎死結 (0 FPS) 的問題。
- **URL 參數載入極致穩固化**:
    - 重構 `processUrlParams` 偵測邏輯。現在參數載入會在引擎初始化成功後立即觸發，且不再受限於 `sessionStorage` 狀態，確保手動變更網址參數能即時生效。
- **滑鼠操控穩定化與 Pointer Lock 整合 (Mouse Stabilization)**:
    - **Pointer Lock API 整合**: 在 `Input::AcquireMouse` 中導入 `SDL_SetRelativeMouseMode`。透過瀏覽器原生鎖定游標，徹底根除傳統 `Warp-to-Center` 邏輯因非同步限制產生的位移誤差。
    - **解決游標亂跳問題**: 修正了原版執行檔在特定顯示倍率下下游標「噴走」或抖動的長年 Bug，提供極致精確且流暢的遊戲操控。
    - **動態縮放補償**: 位移量會自動適應 CSS 縮放（如 Fit to Window），無論畫布如何調整，操作靈敏度始終保持恆定。

**Status**: 滑鼠操控與初始化流程已完美修復，SamCoupeWeb 正式具備商業級的穩定度與操控體驗。

---

## 16. 2026-05-28：Upstream v1.2.16 同步與拖曳開機體驗深度優化

本次開發同步了 upstream 最新更新，並解決了拖曳載入開機、馬達重新讀取與高階儲存的相容性問題。

- **Upstream v1.2.16 同步**: 
    - 合併了 upstream 對於滑鼠精度、Turbo 模式音訊爆音修復、自動引導貼上字串 (auto-boot paste) 以及第二 IDE 控制器的支援。
    - 完整同步了 `Base/` 與 `wasm/src/Base/` 影子目錄的所有檔案。
- **儲存狀態與 Dirty-Bit 修正**:
    - 發現 upstream 在軟碟馬達啟動時會重新 Insert 檔案，這在 Web 的 VFS 環境中會重置髒位 (Dirty Bit)。
    - 在 [Drive.cpp](file:///c:/dev/SamCoupeWeb/Base/Drive.cpp) 中將此重啟讀取行為以 `#ifndef __EMSCRIPTEN__` 包裝，成功修復了 Web 版本的「退出存檔下載提示 (Save on Eject)」功能。
- **拖放開機邏輯優化（第一個自動開機，後續純掛載）**:
    - 重構了拖放處理器。目前第一個拖入的媒體（或透過 URL 參數載入的媒體）會自動執行引導開機 (Autoboot)。
    - 後續拖入的檔案只會單純掛載入對應磁區而不重置模擬器，與原 C++ 版本行為一致，解決了遊戲中途換片時被強制重設的缺陷。
- **About 視窗更新**:
    - 將 About 視窗的版號標題修改並更新至 `v1.2.16`。
- **Git 歷史 Squashed**:
    - 清理了今天的所有開發歷史，整理為一個單一、乾淨的專業 Commit 並強制推送至遠端主分支。

**Status**: 與 upstream v1.2.16 同步與相關優化已完美收官。

---

## 17. 2026-05-28：加載遮罩層競態條件與動態腳本載入問題修復

修復了加載遮罩層有時卡在 `Running...` 轉圈圈以及首次啟動時黑屏未正確加載選單勾選狀態的問題。

- **恢復靜態異步腳本載入**:
    - 移除了導致 `document.currentScript` 丟失且卡死在 `Running...` 的動態 script 注入，恢復靜態 `<script async src="samcoupeweb.js"></script>`，保證 `.wasm` 文件被正確尋址與載入。
- **基於 Main::Init 輸出的穩定加載完成判定**:
    - 重構了加載狀態判定。只在控制台輸出 `Main::Init: Success!` 時才關閉加載遮罩層並啟動選單狀態同步 (`startUiSync`)，確保 SDL、WebGL 上下文和音訊模塊全部就緒後才對用戶開放界面。
- **免點擊自動進入系統 (Seamless Clickless Init)**:
    - 徹底優化首次運行體驗。移除點擊啟動覆蓋層的要求，完成加載後自動隱藏遮罩層並開始仿真運作。
- **防止音訊掛起死鎖**:
    - 依託音訊水位檢測與自動重置，當瀏覽器限制未點擊前音訊掛起時，會自動清除堆積的緩衝區並跳過節流，防止主循環卡死（0 FPS），直到用戶與網頁產生任何鍵盤或鼠標點擊交互時無縫激活音頻。
- **修復 Linux 建置腳本產物檔名錯誤 (Fix Linux Build Script Artifact Names)**:
    - 發現 Linux 建置腳本 `make_wasm_release.sh` 中拷貝產物的檔名仍寫死為舊版的 `simcoupe.*`，導致 GitHub Actions 在 Linux 容器中構建並發佈到 GitHub Pages 時，未能拷貝新生成的 `samcoupeweb.*` 成品，使得 GitHub Pages 始終運行舊版的 JS/WASM/DATA 產生版本衝突卡死。現已將其修正為 `samcoupeweb.*`，以確保 CI 部署版本與本地代碼完全一致。

**Status**: 加載遮罩層、動態腳本競態條件與 CI 產物名稱問題全面修復，GitHub Pages 與本地版本完美同步。

---

## 18. 2026-11-11：v1.2.17 WOS Edition — World of SAM 軟體圖書館

本次大改版正式命名為 **v1.2.17 WOS Edition**（WOS = World of SAM），在模擬器內建完整的 World of SAM 目錄瀏覽與雲端啟動流程；全部以純前端（HTML / CSS / JS + 既有 corsfix 代理）實作，不需要任何後端伺服器。

- **品牌與版號**:
    - About 視窗、`<title>` 與版本字串統一為 `SamCoupeWeb v1.2.17 WOS Edition`，並在 About 中標註「Software Library data & screenshots from World of SAM」。
- **選單列標誌按鈕**:
    - 在 `Help` 右側新增 World of SAM 標誌按鈕（`https://www.worldofsam.org/themes/custom/worldofsam/images/logo.png`），點擊開啟／關閉圖書館（`SamLibrary.toggle()`），`Esc` 亦可關閉。
- **離線目錄資料 (`tools/build-library.mjs`)**:
    - 新增零依賴的 Node 產生器，抓取 World of SAM `products?field_category_target_id=3/4/5` 的全部分頁與產品頁，產出 `wasm/deploy/library-data.js`（`window.SAM_LIBRARY`）：465 筆（Games 213 / Demos 102 / Utilities 150）、331 筆有可下載媒體、格式 mgt 134 / dsk 266 / zip 49。
    - 資料僅保留標題、年份、分類、截圖 URL 與下載清單（`t/y/c/u/s/d`），不複製站上簡介文字；執行 `node tools/build-library.mjs` 約 20 秒即可重新產生。
    - **外部連結救援 (Media recovery)**: 產品頁若只張貼外部連結，產生器會解析出真正的影像檔：Google Drive 轉 `drive.usercontent.google.com/download?id=…&export=download`、Dropbox `dl=0` 轉 `dl=1`，再以 `content-disposition` 取得檔名；同時掃描整個產品頁的 `<a href>`，接受 `.dsk/.mgt/.hdf/.tap/.tzx/.zip` 等媒體附件（排除 manual/readme/source 與非 SAM 平台名稱），並讀取 ZIP 中央目錄確認內部真的含有磁碟／錄音帶影像才收錄（外部 `.7z/.gz` 不收）。若產品頁只連到發行商自己的下載頁（例如 Outsoftware 的 Jetpac／Maniac Mansion），會再往外走一跳抓取真正的檔案；GitHub 的 `/blob/` 檔案頁會轉成 `raw.githubusercontent.com`。為了避免收錯，外部檔案必須與標題有詞彙交集（`mediaMatchesTitle`，忽略 sam/disk/utility 等泛用字），且會實際探測 content-type 排除 HTML 假檔；版權限制頁只接受頁面自己張貼的連結，不追出站頁，也不套用 `library-recovery.json`。`tools/library-recovery.json` 另以精確標題匹配補上 archive.org TOSEC 的單檔解壓 URL 與鏡像檔。這次共救回 15 個可玩標題（Bubble Bobble、King's Valley、Prince of Persia、E-Tracker、Personal Filing System、Personal Banking System、Cross Lib、Triltex、Entro 2、SC_FILER、Spectrum Emulator、Jetpac、Maniac Mansion、Pac-Sam、Snaper），目錄由 316 增至 331 筆有媒體。
    - **版權限制標記**: World of SAM 產品頁有 `file--protected`／`not been approved` 者標記 `k: 1`，卡片顯示 `Restricted ↗`（其餘無媒體者才是 `No download ↗`）；53 個鎖定的產品仍維持限制，不繞過站方版權宣告。這 53 個頁面即使掃到第三方鏡像（例如 Money Bags 的 SAM Revival 磁片）也不會收錄，只有頁面本身張貼的連結才可能讓它們變成可玩。
- **分類檢視**:
    - 三張大型卡片 Games / Demos / Utilities，帶真實截圖背景、標題數與分類強調色；封面以人工指定優先（`COVER_HINTS`：Games 用 Astroball 這種街機標題畫面、Demos 用 Colorweeds 這種彩條效果、Utilities 用 Axword 指南畫面），找不到時才退回 `simc/snap` 截圖規則，避免兩張卡看起來像是對方的截圖。
    - 面板填滿整個模擬器工作區（選單列與狀態列維持可見）。
- **應用程式列表**:
    - 每張卡片含截圖、標題與年份（World of SAM 風格，如 `13 out (2002)`）；無截圖時顯示 `SAM` 紋理佔位。無下載的 134 筆淡化：World of SAM 標為版權限制的 53 筆標記 `Restricted ↗`，其餘 81 筆標記 `No download ↗`；卡片本身是 `<a target="_blank">` 連結，點擊／中鍵會另開分頁前往該作品的 World of SAM 頁面（`item.u`），不在模擬器內啟動。
    - 右上角排序：`A → Z`、`Z → A`、`Old → New`、`New → Old`（年份未知者固定排在最後），偏好存於 `localStorage`。
    - **搜尋框**: 在分類標題數（`Games 213 titles`）右側，隨輸入即時篩選目前分類；比對忽略大小寫與重音符號（`coupe` → `Coupé`）、支援多個空白分隔字詞，計數改顯示 `符合數 / 總數 titles`。無結果時顯示 `No titles match …` 與 *Show all* 按鈕；`/` 聚焦、`Esc` 先清除再離開（面板不會被關掉）、`Enter` 啟動第一筆。手機寬度下 header 自動排成兩列（搜尋框在上、排序與關閉在下）。**輸入框內的 `keydown`／`keypress`／`keyup` 會 `stopPropagation()`**：SDL 的鍵盤橋接在 `window` 上對每個按鍵呼叫 `preventDefault()`，若不攔下會導致搜尋框完全打不進字（連貼上、IME 也失效）。
    - 版面依視窗大小即時計算可容納的欄數／列數，卡片自動填滿畫面；視窗縮放時重新計算並停留在原頁。
- **分頁與導覽**:
    - 底部對齊 World of SAM 的分頁器：`‹`／頁碼頁籤（含 `…` 省略窗格）／`›`，左側顯示 `Page n / total`；`←`／`→`、`PageUp`／`PageDown` 亦可翻頁。
    - 左上角麵包屑 `‹ Games` 可回到分類。
- **啟動管線 (corsfix 下載 + 7z 解壓 + 掛載開機)**:
    - 下載一律走 `https://proxy.corsfix.com/?<url>`（`x-corsfix-cache: 1h`），僅同源檔案直接抓取；若 Corsfix 回 500（例如 outsoftware.it 的 ZIP）或網路錯誤，會自動改用第二個代理 `https://api.cors.lol/?url=<encodeURIComponent>` 重試（Jetpac／Maniac Mansion 已直接鏡像到 `wasm/deploy/media/`，不依賴代理）。以 **45 秒無資料的停滯偵測**（`AbortController`）中止，而非固定總時限，避免 256 MB 級大檔被砍斷，並在提示中顯示百分比／MB。重新載入後的掛載會顯示 `Attaching … to the AtomLite hard disk`，面板已關閉時同步寫入底部狀態列。
    - `.zip` / `.7z` / `.gz` 先以 `7z-wasm` 於瀏覽器內解壓，再依內部副檔名決定掛載方式。
    - `.dsk` / `.mgt` / `.sad` → `EMS_InsertDisk(0)` 掛入磁碟 1 後 `EMS_Boot(1)`；雙磁片產品會在使用者選擇後，把另一片自動掛入磁碟 2（Atom 介面則為 Sec. Master）。
    - `.tap` / `.tzx` → `EMS_InsertTape` + `EMS_Boot(2)`。
    - `.hdf` → 切換至 AtomLite 介面（`localStorage.samcoupeweb_interface = 2`）重新載入，並以 `sessionStorage.samcoupeweb_pending_launch` 記錄待啟動項目；引擎就緒後自動續傳、掛入 Primary Master (D2) 並 reset。
    - **壓縮檔內 `.hdf` 只下載一次**: 目錄中唯一的真實案例是 Games 的 **Time Gal**（`TimeGal-ALXM_256MB.zip` 內含 256 MB `.hdf`）。切換介面前先把解壓後的影像存入 IndexedDB（`samcoupeweb_hdf_cache`），重新載入後由 `consumePendingLaunch` 直接取出掛載，避免 256 MB 重複下載；快取不存在時才回退為重新抓壓縮檔解壓。
    - 多檔產品使用面板內建選擇視窗（不佔用全域 360px 的 modal），避免遮住列表。
- **互動細節**:
    - **介面與媒體自動配對 (Interface Follows the Media)**: 圖書館啟動 `.hdf` 會切到 AtomLite，啟動 `.dsk/.mgt/.sad/.tap/.tzx`（含壓縮檔內的同類檔案）則**切回 Floppy**。先前在 AtomLite 玩過 Time Gal 後再點別的磁片遊戲，`EMS_Boot(1)` 會沿用仍掛在 Primary Master 的 HDF，結果畫面全黑（或又啟動 Time Gal）；現在切換前會先卸下硬碟、把下載好（或已解壓）的影像暫存到 IndexedDB（`samcoupeweb_hdf_cache`），重新載入後由 `consumePendingLaunch` 直接掛載開機，因此影像只下載一次。若硬碟映像有未存的變更，會以三按鈕 modal（`Save & Switch` / `Discard & Switch` / `Cancel`）詢問是否先 `saveMedia()` 存回本機。
    - **存檔回本機 (File ▸ Save)**: `Save Disk 1…`、`Save Disk 2 · Pri. Disk…`、`Save Sec. Disk…`、`Save Tape…` 先 `EMS_FlushDisk` 把記憶體中的 VFS 影像落回 `/tmp/<name>`，再 `downloadVfsFile()` 下載到瀏覽器 Downloads；空磁碟機時項目維持 `disabled`（`updateMenuChecks` 依 `mediaNames` 開關），成功後清除 dirty bit 並在狀態列顯示 `Saved <name> to your Downloads folder`。這是雲端標題（WOS 圖書館／URL 載入）唯一能留一份到本機的方法，因為影像只存在記憶體。
    - 開啟圖書館時暫停模擬器（`pause` 選項），關閉或啟動標題後恢復；啟動前無條件解除暫停，確保開機與音效正常。
    - 啟動完成後面板自動關閉；以 `closeTimer` 修正「上一次啟動的關閉計時器」誤關剛開啟之面板／選擇視窗的競態。
    - 開啟圖書館時自動關閉啟動 About 視窗；若引擎初始化晚於使用者開啟圖書館，也不再跳出 About 遮住面板。
    - 底部狀態列僅保留媒體名稱（沿用 `mediaNames` / `statElements` / `truncatePath`），下載與開機進度全部改由上方膠囊提示呈現。
    - **下載／開機提示改到正上方**: 進度訊息不再寫入左上角標題數或底部狀態列，而是在面板正中央上方以發光、閃爍的膠囊提示（`#lib-toast`）顯示 `Downloading …` / `Extracting …` / `Booting …`；下載失敗改為紅光樣式，避免使用者低頭才看得到。
- **驗證**:
    - 以 Node + Chrome DevTools Protocol 建立無頭瀏覽器煙霧測試（30 項檢查）：分類卡、列表、排序、翻頁、頁籤、麵包屑、截圖載入、corsfix 下載、`.mgt` 開機、`.zip` 解壓、雙磁片選擇器、`.hdf` 介面切換與待啟動續傳，全數通過。
    - **媒體救援驗證（30 項）**：`Bubble Bobble`（Drive → `SamBubbleBobble.zip` → `.mgt`）、`King's Valley`（Dropbox `.mgt`）、`Prince of Persia`、`Triltex`、`SC_FILER`（TOSEC zip）皆能下載、掛入 D1、關閉面板並持續開機（實測截圖：Konami／Prince of Persia 標題畫面）；`Cross Lib` 開啟 5 片選單並掛入第一片；`Amalthea` 顯示 `Restricted ↗` 且仍是 product page 連結；當時目錄媒體數 327/465（第二輪已增至 331）。迴歸：煙霧 30、存檔 8、搜尋 11、介面切換 6，全數 0 failed。
    - **第二輪救援驗證（24 項）**：`Jetpac`（Outsoftware → 鏡像 ZIP → `Jetpac (Mode_4).mgt`，實測標題畫面）、`Maniac Mansion`（→ `Maniac_Mansion (Mode_3).mgt`，實測 Lucasfilm／SCUMM 標題畫面）、`Pac-Sam`（GitHub raw `PacSam.dsk`，迷宮畫面）、`Snaper`（velesoft → 2 片選單，第一片 `snaper-2010-v0_3.dsk`，實測 Snaper 2010 選單）；每個標題都下載、掛入 D1、關閉面板並持續 50 FPS。`Money Bags` 仍為 `Restricted ↗`／無媒體，未被第三方鏡像解鎖；目錄 331/465、53 restricted。
    - 週邊修正：頁碼器 markup 若在傳輸中掉字（`‹`／`›` 與 `✓` 等非 ASCII 字元被轉成 `??`）會讓 `</button>` 消失、頁籤被包進上一頁按鈕內，點頁碼時事件冒泡到 `prev` 而少跳一頁；現已還原為 UTF-8 原文，並在 `library.js` 為頁籤補上 `data-page` 方便測試。
    - 另以真實目錄驗證 **Time Gal**：下載 → 解壓 → 切 AtomLite 重新載入 → `Pri: TimeGal-ALXM_256MB.hdf` 掛載成功（全程只下載一次 256 MB 壓縮檔）。
    - 無下載卡片驗證：`<a>` 的 `href` 指向 `https://www.worldofsam.org/products/<slug>`、`target=_blank`；以真實滑鼠事件點擊會另開分頁並停留在模擬器頁面。
    - 搜尋框驗證（11 項）與存檔驗證（8 項）：以 CDP 真實按鍵逐字輸入 `sam`（而非直接指定 `value`，可抓出 SDL 吞鍵問題）、`符合數 / 總數`、無結果 empty state、清除鈕、`/` 聚焦、`Esc` 清空且面板不關、`Enter` 開機第一筆；以及 File 選單 Save 項目在空機時變灰、`saveMedia(2)` 回報 `Nothing inserted in that drive`、從圖書館掛載 `13 out` 後下載 `13Out_0.mgt` 且大小與 VFS 一致（819200 bytes）、狀態列顯示 `Saved …`，全數通過。
    - 介面配對驗證（6 項）：先以 `.hdf` 標題選 AtomLite 並掛上 Primary Master，再啟動 `13 out` → 介面切回 Floppy（`itf=0`）、影像掛入 D1、硬碟已卸下；並以 CDP `Network.requestWillBeSent` 確認 `13Out_0.mgt` 在切換前後只有 **1 次 GET**（另 1 次是 CORS preflight `OPTIONS`），全數通過。

**Status**: v1.2.17 WOS Edition 完成，World of SAM 目錄瀏覽與雲端開機流程全面上線。

