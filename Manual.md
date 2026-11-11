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
*   **Built-in Library**: Click the **World of SAM** logo at the right end of the menu bar to browse 465 titles and boot them without any local file (see section 7).

### 3. Controls & Interaction
*   **Menu Bar**: Located at the top, providing access to:
    *   `File`: Open/Eject media, Save mounted images to your local disk, Recordings, and Exit.
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
*   **Save at any time**: `File ▸ Save Disk 1… / Save Disk 2 · Pri. Disk… / Save Sec. Disk… / Save Tape…` flush the mounted image and download it straight to your `Downloads` folder — handy for cloud titles (World of SAM library, URL loading), whose images only live in memory until you save them. Entries grey out while the drive is empty; after a successful save the dirty flag is cleared.

### 6. Advanced Features
*   **7z Support**: You can load `.7z` archives directly. The emulator will extract the media in memory.
*   **CORS Proxy**: If a cloud URL is blocked by the source server (like Archive.org), SamCoupeWeb automatically retries through a proxy to ensure successful loading.
*   **WebGL Acceleration**: Enabled by default for 60fps-like smoothness. If you see a black screen, disable it via `View -> Use WebGL Acceleration`.

### 7. World of SAM Software Library (v1.2.17 WOS Edition)
The **World of SAM** logo at the right end of the menu bar opens a library of **465 titles**, so nothing has to be downloaded beforehand:

1. Pick a category: **Games**, **Demos** or **Utilities**. The breadcrumb at the top-left (`‹ Games`) takes you back.
2. Choose a card: each shows a screenshot, the title and its release year (e.g. `13 out (2002)`). Sort with `A→Z`, `Z→A`, `Old→New` or `New→Old`, and page with `‹`, the page tabs and `›` in the bottom bar (`←`/`→` also work). The **search box** right of the category count (e.g. `Games 213 titles`) filters the list as you type — `/` focuses it, `Esc` clears it, `Enter` starts the first match, and it matches without accents (`coupe` finds `Coupé`).
3. Click a card: the image is downloaded through the Corsfix proxy and auto-booted — `.dsk`/`.mgt`/`.sad` in **Disk 1**, `.tap`/`.tzx` on **tape**, `.hdf` on the **AtomLite Primary Master** (the emulator switches interface and re-boots), and `.zip` archives are unpacked in the browser first. The interface always follows the media: a hard-disk title switches to AtomLite, while picking a floppy or tape title after one switches back to **Floppy** and ejects the hard disk (so the previous HDF can no longer hijack the boot). If that hard disk has unsaved changes you are asked to save it first.
4. If a product offers several images, a picker appears; the second disk of a 2-disk set is mounted in Disk 2.
5. **331 of the 465 titles have a playable image** (15 of them recovered from links that the World of SAM page only points to: Google Drive, Dropbox, GitHub releases, archive.org and one outbound hop to a publisher's own download page, e.g. Jetpac on outsoftware.it). Generated card data rejects look-alike files (manuals, source drops, blank/ZX images), and the site's 53 copyright-restricted titles stay locked and are labelled **Restricted ↗**.

`Esc` (or the logo again) closes the library; the emulator is paused while it is open and resumes when the selected title boots. Cards tagged **Restricted ↗** are marked as copyright-restricted by World of SAM; products with no hosted image show **No download ↗**. Both open that product's page on worldofsam.org in a new tab (middle-click works too). Cloud images live in memory only, so if you want to keep one, use **File ▸ Save Disk 1** (or the matching drive) after it boots. While a title loads, a bright blinking banner at the top of the library reports `Downloading…`, `Extracting…` and `Booting…` (failures are shown in red).

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
*   **內建圖書館**：點擊選單列最右側的 **World of SAM** 標誌，即可瀏覽 465 個標題並直接開機，無需任何本機檔案（詳見第 7 節）。

### 3. 操作與互動
*   **上方選單列**：
    *   `File (檔案)`：開啟/彈出媒體、把掛載中的影像存回本機、多媒體錄製、結束。
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
*   **隨時存回本機**：`File ▸ Save Disk 1… / Save Disk 2 · Pri. Disk… / Save Sec. Disk… / Save Tape…` 會先把掛載中的影像 flush 回記憶體檔案系統，再直接下載到你的 `Downloads`。雲端標題（World of SAM 圖書館、URL 載入）的影像原本只存在記憶體，重新整理就會消失，用這個功能就能留一份在本機；磁碟機沒插片時項目會變灰，存檔成功後也會清除「已修改」標記。

### 6. 進階功能
*   **7z 壓縮支援**：直接支援 `.7z` 格式，系統會在記憶體中自動解壓。
*   **CORS 代理自動備援**：若雲端載入被遠端伺服器 (如 Archive.org) 阻擋，系統會自動透過代理伺服器重試。
*   **WebGL 硬體加速**：預設開啟。若遇到黑屏，請透過 `View` 選單取消勾選以改用軟體渲染。

### 7. World of SAM 軟體圖書館 (v1.2.17 WOS Edition)
選單列最右側的 **World of SAM** 標誌按鈕會開啟內建的圖書館，收錄 **465 個標題**，不必事先下載任何檔案：

1. 選擇分類：**Games**、**Demos** 或 **Utilities**；左上角麵包屑（`‹ Games`）可回到分類。
2. 挑選卡片：每張卡片顯示截圖、標題與發行年份（例如 `13 out (2002)`）。可用 `A→Z`、`Z→A`、`Old→New`、`New→Old` 排序，底部以 `‹`、頁碼頁籤、`›` 翻頁（`←`/`→` 亦可）。分類標題數（例如 `Games 213 titles`）右側的 **搜尋框** 會隨輸入即時篩選，`/` 聚焦、`Esc` 清除、`Enter` 啟動第一筆；比對忽略重音符號（`coupe` 可找到 `Coupé`）。
3. 點擊卡片：系統會透過 Corsfix 代理下載影像並自動開機 — `.dsk`/`.mgt`/`.sad` 掛入**磁碟 1**、`.tap`/`.tzx` 掛入**錄音帶**、`.hdf` 掛入 **AtomLite Primary Master**（模擬器會自動切換介面並重載），`.zip` 則先在瀏覽器內解壓。介面一律跟著媒體走：硬碟標題切到 AtomLite，之後再挑磁片或錄音帶標題會**切回 Floppy** 並卸下硬碟（先前掛著的 HDF 就不會再搶走去開機）；若該硬碟有未存的變更，會先問你要不要存檔。
4. 若產品提供多個影像，會彈出選擇視窗；雙磁片組合的第二片會掛入磁碟 2。
5. **465 個標題中有 331 個具備可開機影像**（其中 15 個是從 World of SAM 頁面僅張貼的連結救回：Google Drive、Dropbox、GitHub release、archive.org，以及再往外一跳的發行商下載頁，例如 outsoftware.it 的 Jetpac）。產生器會排除山寨檔（手冊、原始碼、空白或 ZX 專用影像）；站方列為版權限制的 53 個標題仍維持鎖定並標示 **Restricted ↗**。

按 `Esc`（或再次點擊標誌）關閉圖書館；開啟期間模擬器會暫停，選定標題開機後恢復。標示 **Restricted ↗** 的卡片代表 World of SAM 將其列為版權限制，其他沒有可下載影像的產品則標示 **No download ↗**；兩者都會另開新分頁前往該作品的 World of SAM 頁面（中鍵點擊亦可）。雲端影像只存在記憶體，想留一份的話，開機後用 **File ▸ Save Disk 1**（或對應的磁碟機）即可存回本機。載入期間，圖書館正上方會以發光、閃爍的提示顯示 `Downloading…`、`Extracting…`、`Booting…`（失敗時轉為紅光）。

---

### Credits
- **Original Engine**: SimCoupe by Simon Owen
- **SamCoupeWeb Evolution**: Developed and optimized for web by anomixer.
