const form = document.getElementById("process-form");
const imageInput = document.getElementById("image");
const methodSelect = document.getElementById("method");
const statusText = document.getElementById("status-text");
const submitButton = document.getElementById("submit-button");
const pickOutputButton = document.getElementById("pick-output");
const outputHint = document.getElementById("output-hint");
const previewImage = document.getElementById("preview-image");
const previewEmpty = document.getElementById("preview-empty");
const backgroundInput = document.getElementById("background");
const histogramChart = document.getElementById("hue-histogram");
const histogramEmpty = document.getElementById("histogram-empty");
const histogramSummary = document.getElementById("histogram-summary");

let outputHandle = null;
let previewRequestId = 0;
let previewObjectUrl = null;
let previewController = null;
let histogramRequestId = 0;

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.dataset.error = String(isError);
}

function fallbackDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

function clearPreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  previewImage.removeAttribute("src");
  previewImage.classList.remove("is-visible");
  previewEmpty.hidden = false;
}

function clearHueHistogram(message = "等待输入") {
  histogramChart.replaceChildren();
  histogramEmpty.hidden = false;
  histogramChart.hidden = true;
  histogramSummary.textContent = message;
}

function showPreview(blob) {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }

  previewObjectUrl = URL.createObjectURL(blob);
  previewImage.src = previewObjectUrl;
  previewImage.classList.add("is-visible");
  previewEmpty.hidden = true;
}

function parseBackground(value) {
  const parts = value.split(",").map((part) => Number.parseInt(part.trim(), 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    throw new Error("RGB 必须是 0-255 的 R,G,B 格式");
  }

  return parts;
}

function rgbToHue(red, green, blue) {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = max - min;

  if (delta < 1 / 255) {
    return null;
  }

  let hue;
  if (max === normalizedRed) {
    hue = ((normalizedGreen - normalizedBlue) / delta) % 6;
  } else if (max === normalizedGreen) {
    hue = (normalizedBlue - normalizedRed) / delta + 2;
  } else {
    hue = (normalizedRed - normalizedGreen) / delta + 4;
  }

  return Math.round(((hue * 60) + 360) % 360);
}

function drawHueHistogram(histogram, peakCount) {
  histogramChart.replaceChildren();

  const fragment = document.createDocumentFragment();
  histogram.forEach((count, index) => {
    const bar = document.createElement("div");
    const heightPercent = peakCount > 0 ? Math.max(2, Math.round((count / peakCount) * 100)) : 0;

    bar.className = "histogram-bar";
    bar.style.height = `${heightPercent}%`;
    bar.style.setProperty("--bar-color", `hsl(${index * 5} 78% 48%)`);
    bar.title = `${index * 5}°-${index * 5 + 5}°: ${count}`;
    fragment.append(bar);
  });

  histogramChart.append(fragment);
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("无法读取图片内容"));
    };
    image.src = objectUrl;
  });
}

async function loadRasterSource(file) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }

  return loadImageElement(file);
}

async function refreshHueHistogram() {
  const file = imageInput.files[0];
  if (!file) {
    clearHueHistogram();
    return;
  }

  const currentRequestId = ++histogramRequestId;

  try {
    const background = parseBackground(backgroundInput.value);
    const imageBitmap = await loadRasterSource(file);
    if (currentRequestId !== histogramRequestId) {
      imageBitmap.close?.();
      return;
    }

    const maxPixels = 180000;
    const scale = Math.min(1, Math.sqrt(maxPixels / (imageBitmap.width * imageBitmap.height)));
    const sampleWidth = Math.max(1, Math.round(imageBitmap.width * scale));
    const sampleHeight = Math.max(1, Math.round(imageBitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      imageBitmap.close?.();
      throw new Error("当前浏览器无法生成色相直方图");
    }

    context.fillStyle = `rgb(${background.join(",")})`;
    context.fillRect(0, 0, sampleWidth, sampleHeight);
    context.drawImage(imageBitmap, 0, 0, sampleWidth, sampleHeight);
    imageBitmap.close?.();

    const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
    const histogram = new Array(72).fill(0);
    let chromaticPixels = 0;
    let neutralPixels = 0;

    for (let index = 0; index < data.length; index += 4) {
      const hue = rgbToHue(data[index], data[index + 1], data[index + 2]);
      if (hue === null) {
        neutralPixels += 1;
        continue;
      }

      histogram[Math.min(histogram.length - 1, Math.floor(hue / 5))] += 1;
      chromaticPixels += 1;
    }

    if (currentRequestId !== histogramRequestId) {
      return;
    }

    const peakCount = Math.max(...histogram, 0);
    if (peakCount === 0) {
      clearHueHistogram("图像里几乎没有可统计的色相，主要是黑白灰。");
      return;
    }

    const dominantBin = histogram.indexOf(peakCount);
    const dominantStart = dominantBin * 5;
    const dominantEnd = dominantStart + 5;
    drawHueHistogram(histogram, peakCount);
    histogramEmpty.hidden = true;
    histogramChart.hidden = false;
    histogramSummary.textContent =
      `主峰位于 ${dominantStart}°-${dominantEnd}°，` +
      `彩色像素约 ${Math.round((chromaticPixels / (chromaticPixels + neutralPixels)) * 100)}%，` +
      `灰阶像素约 ${Math.round((neutralPixels / (chromaticPixels + neutralPixels)) * 100)}%。`;
  } catch (error) {
    clearHueHistogram(error.message || "色相直方图生成失败");
  }
}

async function refreshPreview() {
  const file = imageInput.files[0];
  if (!file) {
    clearPreview();
    return;
  }

  if (previewController) {
    previewController.abort();
  }

  previewController = new AbortController();
  const currentRequestId = ++previewRequestId;
  const formData = new FormData();
  formData.append("image", file);
  formData.append("method", methodSelect.value);
  formData.append("background", backgroundInput.value);

  setStatus("正在生成预览...");

  try {
    const response = await fetch("/api/preview", {
      method: "POST",
      body: formData,
      signal: previewController.signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "预览生成失败");
    }

    const blob = await response.blob();
    if (currentRequestId !== previewRequestId) {
      return;
    }

    showPreview(blob);
    setStatus("预览已更新。");
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    clearPreview();
    setStatus(error.message || "预览生成失败", true);
  }
}

async function saveWithPicker(blob, suggestedName) {
  if (!window.showSaveFilePicker) {
    fallbackDownload(blob, suggestedName);
    setStatus("浏览器不支持直接选保存位置，结果已走默认下载。");
    return;
  }

  if (!outputHandle) {
    outputHandle = await window.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "PNG image",
          accept: { "image/png": [".png"] },
        },
      ],
    });
  }

  const writable = await outputHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  setStatus(`已保存到 ${outputHandle.name}`);
}

pickOutputButton.addEventListener("click", async () => {
  const file = imageInput.files[0];
  const suggestedName = file
    ? `${file.name.replace(/\.[^.]+$/, "")}_fingerprint.png`
    : "output_fingerprint.png";

  if (!window.showSaveFilePicker) {
    outputHandle = null;
    outputHint.textContent = "当前浏览器不支持原生保存位置选择，将使用默认下载。";
    setStatus("当前浏览器不支持保存位置选择。");
    return;
  }

  try {
    outputHandle = await window.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "PNG image",
          accept: { "image/png": [".png"] },
        },
      ],
    });
    outputHint.textContent = `已选择输出文件：${outputHandle.name}`;
    setStatus("输出位置已选择。");
  } catch (error) {
    if (error.name !== "AbortError") {
      outputHandle = null;
      outputHint.textContent = "输出位置选择失败，将使用默认下载。";
      setStatus("输出位置选择失败。", true);
    }
  }
});

imageInput.addEventListener("change", () => {
  outputHandle = null;
  outputHint.textContent = "如需指定保存位置，请重新点击“选择输出位置”。";
  refreshHueHistogram();
  refreshPreview();
});

methodSelect.addEventListener("change", refreshPreview);
backgroundInput.addEventListener("change", () => {
  refreshHueHistogram();
  refreshPreview();
});

clearHueHistogram();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = imageInput.files[0];
  if (!file) {
    setStatus("请先选择一张图片。", true);
    return;
  }

  const formData = new FormData();
  formData.append("image", file);
  formData.append("method", methodSelect.value);
  formData.append("background", document.getElementById("background").value);

  submitButton.disabled = true;
  setStatus("正在处理图片...");

  try {
    const response = await fetch("/api/process", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "图片处理失败");
    }

    const blob = await response.blob();
    const header = response.headers.get("Content-Disposition") || "";
    const match = header.match(/filename="?([^"]+)"?/);
    const downloadName = match ? match[1] : "output_fingerprint.png";
    await saveWithPicker(blob, downloadName);
  } catch (error) {
    setStatus(error.message || "处理失败", true);
  } finally {
    submitButton.disabled = false;
  }
});
