# color-fingerprint

本项目现在同时支持两种使用方式：

- 命令行工具：读取一张 PNG/JPG/JPEG 图片，分析其颜色，生成一张与原图同尺寸的纯色图，在纯色图上打印 RGB 信息，并将纯色图拼接在上方、原图拼接在下方，最终输出为 PNG。
- 本地 Web 界面：在浏览器里选择本地图片、处理方式，并将结果保存到你选择的位置。

## 安装依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 启动 Web 界面

```bash
flask --app app run
```

启动后打开命令行里显示的地址，默认通常是：

```text
http://127.0.0.1:5000
```

页面支持：

- 选择本地 `PNG` / `JPG` / `JPEG` 图片
- 选择处理方式：`颜色平均值` 或 `颜色众数值`
- 指定透明像素铺底颜色，格式 `R,G,B`
- 如果浏览器支持 `File System Access API`，可以直接选择输出位置和文件名
- 如果浏览器不支持，会自动退回普通下载

## 使用方式

```bash
python3 main.py input.png output.png --method average
```

输入也可以是 JPG / JPEG，例如：

```bash
python3 main.py input.jpg output.png --method average
```

也可以使用最多像素颜色：

```bash
python3 main.py input.png output.png --method dominant
```

如果输入图像包含透明像素，会先按指定背景色铺底再分析：

```bash
python3 main.py input.png output.png --method average --background 255,255,255
```

## 参数说明

- `input`：输入图片路径，支持 `PNG`、`JPG`、`JPEG`
- `output`：输出图片路径，固定要求为 `PNG`
- `--method`：取色方式，支持 `average` 和 `dominant`
- `--background`：透明图铺底颜色，格式为 `R,G,B`
