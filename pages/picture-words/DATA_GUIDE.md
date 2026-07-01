# 看图想韩语数据填写

数据入口在 `data.js` 的 `PICTURE_WORD_CATALOG`。

```js
{
  schemaVersion: 1,
  version: '20260628.001',
  defaultGroupId: 'animals',
  groups: [
    {
      id: 'animals',
      name: '动物',
      promptKo: '이게 뭐예요?',
      items: [
        {
          id: 'fox',
          korean: '여우',
          roman: 'yeo-u',
          cn: '狐狸',
          en: 'Fox',
          image: 'https://...',
          tags: ['animal']
        }
      ]
    }
  ]
}
```

必填字段：

- catalog: `schemaVersion`, `version`, `defaultGroupId`, `groups`
- group: `id`, `name`, `items`，每个 group 的 `id` 必须唯一
- item: `id`, `korean`, `cn`, `en`, `image`

可选字段：

- `promptKo`: 提问句。group 级默认是 `이게 뭐예요?`，item 级可以覆盖。
- `roman`: 罗马音。
- `audio`: 预生成音频地址。通常不用手写，执行音频生成脚本后会自动补上 `audio.ko` 和 `audio.ko-KR`。
- `level`, `tags`, `sort`: 用于分类展示、排序和后续筛选。

缓存规则：

- 页面只调用 `content.js`。
- `content.js` 一次加载完整 catalog：所有分组和所有 items。
- 切分类只读内存/本地 storage，不重新请求数据库或云函数。
- `content.js` 会用本地数据签名自动识别“新增分类/新增词”，旧缓存会失效。
- 每次准备热更时，修改 `data.js` 里的 `version`，再重新生成 OSS JSON。

OSS 热更：

- 修改 `data.js` 后，执行 `node tools/generate-picture-words-config.js`。
- 再执行 `node tools/generate-picture-word-audio.js`，它会生成韩语音频到 `oss-config/kr_picturebook/audio/ko-KR/`，并把音频 URL 写回当前 catalog。
- 生成文件在 `oss-config/kr_picturebook/config/` 和 `oss-config/kr_picturebook/audio/ko-KR/`。
- 上传 `picture-words.manifest.json` 和当前版本的 `picture-words.catalog.*.json` 到 OSS 的 `/kr_picturebook/config/`。
- 上传 `audio/ko-KR/` 下的 mp3 到 OSS 的 `/kr_picturebook/audio/ko-KR/`。
- 远程 catalog 是纯 JSON，不要直接上传 `data.js`。

推荐命令：

```bash
node tools/generate-picture-words-config.js
node tools/generate-picture-word-audio.js
```

如果只是检查还缺哪些音频，不写文件：

```bash
node tools/generate-picture-word-audio.js --dry-run
```
