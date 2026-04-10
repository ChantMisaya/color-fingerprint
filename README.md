# color-fingerprint

本项目用于从图片中提取一个代表色，并生成一张新的 PNG 图片：

- 上半部分是与原图同尺寸的纯色块
- 纯色块中央会显示对应的十六进制颜色值
- 下半部分保留原图内容

当前支持两种使用方式：

- Web 界面：在浏览器里上传本地图片、选择处理方式，并保存结果
- 命令行：直接指定输入路径、输出路径和处理参数

## 功能说明

- 支持输入格式：`PNG`、`JPG`、`JPEG`
- 支持两种取色方式：
  - `average`：颜色平均值
  - `dominant`：颜色众数值
- 输出格式固定为 `PNG`
- 如果输入图带透明像素，会先按指定背景色铺底，再参与颜色计算

## 安装依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

依赖如下：

- `Flask`：本地 Web 服务
- `Pillow`：图像处理

## 启动 Web 界面

先激活虚拟环境：

```bash
source .venv/bin/activate
```

然后启动服务：

```bash
flask --app app run
```

也可以直接使用：

```bash
python app.py
```

启动后打开浏览器访问：

```text
http://127.0.0.1:5000
```

Web 页面支持：

- 选择本地图片
- 选择处理方式：`颜色平均值` 或 `颜色众数值`
- 输入透明区域铺底色，格式为 `R,G,B`
- 如果浏览器支持 `File System Access API`，可直接选择输出位置和文件名
- 如果浏览器不支持该 API，会自动回退为普通下载

## 命令行用法

基本用法：

```bash
python main.py input.png output.png --method average
```

输入也可以是 JPG / JPEG：

```bash
python main.py input.jpg output.png --method average
```

使用颜色众数值：

```bash
python main.py input.png output.png --method dominant
```

指定透明像素铺底颜色：

```bash
python main.py input.png output.png --method average --background 255,255,255
```

## 命令行参数

- `input`：输入图片路径，支持 `PNG`、`JPG`、`JPEG`
- `output`：输出图片路径，必须为 `PNG`
- `--method`：取色方式，支持 `average` 和 `dominant`
- `--background`：透明图铺底颜色，格式为 `R,G,B`

## 项目结构

```text
.
├── app.py
├── main.py
├── requirements.txt
├── static/
│   ├── app.js
│   └── styles.css
└── templates/
    └── index.html
```

## 说明

- Web 端和命令行端复用同一套图像处理逻辑
- Web 接口为 `POST /api/process`
- 输出文件名默认会基于输入文件名追加 `_fingerprint.png`
