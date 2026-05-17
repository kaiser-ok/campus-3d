# 工作日誌

## 2026-05-16

### 專案

壽山高中 WiFi 3D 校園監控圖

### 今日目標

將學校 2D 平面圖轉成可在 Web 中互動檢視的 3D 校園監控介面，並可顯示 AP、switch、設備狀態、WiFi 訊號問題區與流量熱點。

### 完成事項

- 建立 Vite + React 專案，使用 Three.js 製作可旋轉、縮放、俯視與透視檢視的 3D 場景。
- 將原始學校平面圖放入 3D 地面底圖，並依照圖面位置建立主要建築量體。
- 加入監控模式切換：
  - 設備狀態
  - 訊號熱區
  - 用戶流量
  - 樓層規劃
- 加入 AP / switch 示範資料，顯示設備狀態、樓層、用戶數、流量與頻道資訊。
- 設備狀態以顏色區分：
  - 淡綠色：正常
  - 黃色：警告
  - 紅色：故障
- 加入 WiFi 熱區視覺化，標示訊號差、斷線、流量高與壅塞區域。
- 建築物加入樓層分隔線、樓層標籤與簡單窗帶，不再只是 solid box。
- 加入教室/空間編號資料，點選建築物時會在 3D 立面與右側資訊面板顯示房號。
- 點選建築物或設備時，鏡頭會自動聚焦放大到該目標。
- AP / switch 改為依樓層高度顯示，而不是全部放在屋頂。
- 故障設備會在對應樓層位置顯示紅色標記、紅色警示圈與故障標籤。
- AP / switch 圖層開啟時，建築物會自動進入 X-ray 半透明模式，避免設備被建築遮住。
- 建立 Playwright 視覺驗證腳本，檢查桌面與手機尺寸下 canvas 是否正確渲染、工具列是否在畫面內。
- 初始化 git repository 並建立第一個 commit。

### 主要檔案

- `src/App.jsx`：3D 場景、資料模型、設備標記、熱區、建築、樓層與互動邏輯。
- `src/styles.css`：整體 UI、控制面板、響應式樣式。
- `public/school-plan.jpg`：學校平面圖底圖。
- `scripts/verify-visual.mjs`：Playwright 視覺驗證腳本。
- `package.json`：React、Vite、Three.js 與驗證工具設定。

### 驗證紀錄

- `npm run build`：通過。
- `node scripts/verify-visual.mjs`：通過。
- 驗證內容包含桌面與手機 viewport、WebGL canvas 非空白、控制工具列可見、模式列可見。

### Git 紀錄

- `d302119 Build interactive 3D WiFi campus map`

### 目前限制

- 建築位置、教室編號、AP / switch 位置目前是示範資料，仍需依實際盤點資料校正。
- 2D 平面圖尚未自動辨識，仍是手動建立建築 footprint 與房號資料。
- WiFi 熱區目前是示範模型，尚未接入真實 RSSI、client count、throughput 或 NMS API。
- 訊號熱圖尚未考慮牆體材質、樓層衰減、頻段差異與 AP 天線方向。

### 下一階段建議

- 建立正式資料格式，分離 `buildings`、`devices`、`heatZones` 到 JSON 或 API。
- 製作匯入精靈，讓使用者上傳平面圖後可手動框選建築並產生 3D。
- 加入 OCR / AI 輔助辨識，讀取平面圖上的建築名稱、樓層與教室編號。
- 串接真實監控來源，例如 UniFi、Aruba、Cisco、Ruckus、Fortinet 或自家 NMS API。
- 加入時間軸，查看不同時段的用戶數、流量、斷線與熱區變化。
- 加入設備搜尋與快速定位，例如輸入 AP ID 後鏡頭自動移動到設備位置。
