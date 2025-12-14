# 数据与音频更新指南

本文档详细说明了如何向项目中添加新的韩语单词/句子数据，以及如何生成和更新对应的音频文件。

## 前置准备

确保你的开发环境已安装以下工具：

1.  **Node.js**: 用于运行构建脚本。
2.  **FFmpeg**: 用于音频处理（`tools/process_audio.js` 依赖 `ffmpeg` 和 `ffprobe` 命令）。
    *   Mac: `brew install ffmpeg`
    *   Windows: 下载 FFmpeg 并将 `bin` 目录添加到环境变量 PATH 中。

---

## 步骤一：更新数据文件 (`data/*.js`)

所有韩语练习数据都存储在 `data/` 目录下。

1.  打开对应类别的 `.js` 文件（例如 `data/beginnerWords.js`）。
2.  按照现有格式添加新的条目。通常格式如下：
    ```javascript
    {
      korean: "안녕하세요",
      english: "Hello",
      // 其他字段...
    },
    ```
3.  **注意**：`korean` 字段的值将作为音频文件的匹配键（Key）。

---

## 步骤二：准备音频文件

1.  将新的 MP3 音频文件放入 `data/voice/<类别名>/` 目录下。
    *   例如：`beginnerWords` 类别的音频应放入 `data/voice/beginnerWords/`。
2.  **命名规则**：音频文件名必须与 `data/*.js` 中的 `korean` 字段完全一致（不包含 `.mp3` 后缀）。
    *   数据：`korean: "안녕하세요"`
    *   音频文件：`data/voice/beginnerWords/안녕하세요.mp3`
3.  如果找不到对应文件，构建脚本会发出警告。

---

## 步骤三：处理音频 (`process_audio.js`)

此步骤会将散乱的 MP3 文件合并为雪碧图（Sprite），并生成 JSON 映射表。

1.  在项目根目录打开终端。
2.  运行命令：
    ```bash
    node tools/process_audio.js
    ```
3.  **脚本执行过程**：
    *   扫描 `data/voice/` 下的所有子目录。
    *   检查每个音频文件是否在 `data/*.js` 中有对应的条目。
    *   将音频文件合并（每段音频之间会自动插入 0.5秒静音），并进行压缩（48kbps）。
    *   如果总大小超过 1.6MB，会自动分割成多个文件（如 `beginnerWords_0.mp3`, `beginnerWords_1.mp3`）。
    *   在 `assets/audio/` 下生成 `.mp3` 合集文件和 `.json` 映射表。

---

## 步骤四：更新资源分包 (`update_assets.js`)

此步骤会将生成的音频文件分发到各个分包目录，并将 JSON 映射表转换为 JS 模块。

1.  继续在终端运行命令：
    ```bash
    node tools/update_assets.js
    ```
2.  **脚本执行过程**：
    *   **移动 MP3**: 根据脚本内的 `MP3_MAPPING` 配置，将 `assets/audio/` 下的 `.mp3` 文件移动到 `subpackages/audio_p*/static/` 目录中。
    *   **转换 JSON**: 读取 `assets/audio/*.json`，将其转换为 `export default {...}` 格式的 `.js` 文件，保存到 `assets/audio_maps/`。
3.  **注意**：如果生成的音频文件数量发生变化（例如因为文件太大新增了 `_2.mp3`），你需要手动修改 `tools/update_assets.js` 中的 `MP3_MAPPING` 配置，指定新文件应该放入哪个分包。

---

## 步骤五：验证

1.  在微信开发者工具中重新编译项目。
2.  进入对应的练习模式。
3.  点击右上角的 **喇叭图标**，检查新添加的单词是否能正常播放音频。
4.  检查控制台是否有报错（如音频加载失败）。

---

## 常见问题排查

*   **Q: `process_audio.js` 报错 "command not found: ffmpeg"**
    *   A: 请检查电脑是否已安装 FFmpeg 并配置好环境变量。
*   **Q: 音频文件没有被打包进去**
    *   A: 检查 `tools/update_assets.js` 中的 `MP3_MAPPING` 是否包含了你新生成的文件名。
*   **Q: 数据文件里有单词，但提示找不到音频**
    *   A: 确保 `data/voice/` 下的 MP3 文件名与 `korean` 字段完全一致（包括空格和标点符号）。可以使用 `node tools/check_matches.js` 脚本来辅助检查缺失的音频。
