# SamCoupeWeb User Manual

Welcome to **SamCoupeWeb**, a modern, web-native SAM Coupé emulator. This version is specifically optimized for browser environments, offering high-performance WebGL rendering, cloud integration, and an intuitive user interface.

[English](#english) | [繁體中文](#繁體中文)

---

<a name="english"></a>
## English Manual

### 1. Getting Started
To begin, simply visit the [Live Demo](https://anomixer.github.io/samcoupeweb/).
*   **Enable Sound**: Most modern browsers (Chrome, Safari, Edge) block audio until you interact with the page. **Click anywhere on the emulator screen** to enable sound.
*   **Startup Screen**: By default, the emulator starts with the SAM Coupé startup screen. You can boot into DOS or software by inserting media.

### 2. Loading Software
SamCoupeWeb supports multiple ways to load media:

*   **Drag & Drop (Recommended)**: Drag any supported file (`.dsk`, `.mgt`, `.sad`, `.tap`, `.tzx`, `.hdf`, `.zip`, `.gz`, `.7z`) directly onto the browser window. The emulator will automatically identify the media type and mount it. The first dropped file automatically resets and boots the emulator, while any subsequent drops are purely mounted/inserted without resetting the machine, making it easy to swap disks during gameplay.
*   **Web Menu Bar**: Click `File -> Open Disk...` or `File -> Open Tape...` to select files from your computer using the standard browser file picker.
*   **Cloud Loading (URL Parameters)**: You can load games directly from the web by appending parameters to the URL:
    *   `?d1=[URL]` - Mount Disk 1 and Auto-Boot.
    *   `?tape=[URL]` - Mount Tape and Auto-Boot.
    *   `?interface=atomlite&d2=[URL]` - Mount Hard Disk (.hdf) to AtomLite interface.

### 3. Controls & Interaction
*   **Menu Bar**: Located at the top, providing access to:
    *   `File`: Open/Eject media, Recordings, and Exit.
    *   `Options`: Change Memory (256K/512K), SID Model, DAC type, and Joysticks.
    *   `View`: Adjust Zoom (50% - 500%, Fit to Window), toggle WebGL, and change Border visible area.
*   **Status Bar**: Located at the bottom, showing:
    *   **Left**: Current mounted media name (Smart truncated if too long).
    *   **Center**: Disk/Tape/Hard Disk activity indicators.
    *   **Right**: Real-time FPS (Targeting 50 FPS).

### 4. Keyboard Shortcuts
| Key | Function |
| :--- | :--- |
| **F1** | Quick Open Disk 1 |
| **F2** | Quick Open Disk 2 / Primary Master HDF |
| **F3** | Open Tape Browser |
| **F9 / Numpad 9** | Boot from Drive 1 |
| **F12** | Reset SAM Coupé |
| **Esc** | Close Modals / Release Mouse |
| **Keypad +/-** | Increase/Decrease Emulation Speed |
| **Keypad \*** | Turbo Speed Toggle |

### 5. Saving & Exporting
Since the emulator runs in a Virtual File System (VFS), "saving" works differently:
*   **Recordings**: When you stop recording (WAV, GIF, AVI) or take a screenshot, the browser will **automatically trigger a download** to save the file to your local `Downloads` folder.
*   **Save on Eject**: If you modify a disk (e.g., save a BASIC program in-game), the emulator tracks "dirty" sectors. When you **Eject** that disk or close the page, a prompt will ask if you want to download the modified `.dsk` or `.hdf` file back to your computer.

### 6. Advanced Features
*   **7z Support**: You can load `.7z` archives directly. The emulator will extract the media in memory.
*   **CORS Proxy**: If a cloud URL is blocked by the source server (like Archive.org), SamCoupeWeb automatically retries through a proxy to ensure successful loading.
*   **WebGL Acceleration**: Enabled by default for 60fps-like smoothness. If you see a black screen, disable it via `View -> Use WebGL Acceleration`.

---

<a name="繁體中文"></a>
## 繁體中文使用手冊

### 1. 快速入門
訪問 [線上體驗網址](https://anomixer.github.io/samcoupeweb/) 即可開始。
*   **啟動聲音**：現代瀏覽器限制自動播放。請在**模擬器畫面任意處點擊**以啟動音效。
*   **啟動畫面**：預設進入 SAM Coupé 條紋啟動畫面。插入磁碟後按下 F9 即可引導。

### 2. 載入軟體
SamCoupeWeb 提供多種直覺的載入方式：

*   **拖放載入 (推薦)**：直接將檔案（`.dsk`, `.tap`, `.hdf`, `.zip`, `.7z` 等）**拖入瀏覽器視窗**。系統會自動識別並掛載。第一個拖入的檔案會自動重置並引導開機，而後續拖入的檔案只會進行純掛載/插入（不重置模擬器），方便在遊戲中途進行換片。
*   **網頁選單**：使用上方選單 `File -> Open Disk...` 從電腦選取檔案。
*   **雲端載入 (URL 參數)**：在網址後加上參數即可自動載入網路上的遊戲：
    *   `?d1=[網址]` - 自動下載、掛載磁碟 1 並引導。
    *   `?tape=[網址]` - 自動載入錄音帶。
    *   `?interface=atomlite&d2=[網址]` - 掛載 HDF 硬碟影像至 AtomLite 介面。

### 3. 操作與互動
*   **上方選單列**：
    *   `File (檔案)`：開啟/彈出媒體、多媒體錄製、結束。
    *   `Options (設定)`：調整記憶體 (256K/512K)、SID 型號、DAC 類型與搖桿模式。
    *   `View (檢視)`：調整縮放 (50% - 500%、自動適應視窗)、切換 WebGL 硬體加速、調整邊框顯示區域。
*   **下方狀態列**：
    *   **左側**：顯示目前掛載的檔名（過長會自動智慧截斷）。
    *   **中間**：磁碟/磁帶/硬碟讀取燈號。
    *   **右側**：即時 FPS 監控（標準為 50 FPS）。

### 4. 常用快捷鍵
| 按鍵 | 功能 |
| :--- | :--- |
| **F1** | 快速開啟磁碟 1 |
| **F2** | 快速開啟磁碟 2 / 主硬碟 (HDF) |
| **F3** | 開啟錄音帶瀏覽器 |
| **F9 / 數字鍵 9** | 從磁碟 1 引導 (Boot) |
| **F12** | 硬體重置 (Reset) |
| **Esc** | 關閉對話框 / 釋放滑鼠 |
| **數字鍵 +/-** | 加速/減慢模擬速度 |
| **數字鍵 \*** | 強制加速模式 (Turbo) |

### 5. 存檔與導出機制
由於模擬器執行於瀏覽器的虛擬空間，存檔機制如下：
*   **錄製產物**：當你停止錄音 (WAV)、錄影 (GIF/AVI) 或擷取螢幕時，瀏覽器會**自動觸發下載**，將檔案存至你的本地下載資料夾。
*   **退出存檔提示**：如果你在遊戲中修改了磁碟（例如存入 BASIC 程式），系統會追蹤變更。當你**彈出磁碟 (Eject)** 或關閉頁面時，系統會詢問是否要下載修改後的影像檔。

### 6. 進階功能
*   **7z 壓縮支援**：直接支援 `.7z` 格式，系統會在記憶體中自動解壓。
*   **CORS 代理自動備援**：若雲端載入被遠端伺服器 (如 Archive.org) 阻擋，系統會自動透過代理伺服器重試。
*   **WebGL 硬體加速**：預設開啟。若遇到黑屏，請透過 `View` 選單取消勾選以改用軟體渲染。

---

### Credits
- **Original Engine**: SimCoupe by Simon Owen
- **SamCoupeWeb Evolution**: Developed and optimized for web by anomixer.
