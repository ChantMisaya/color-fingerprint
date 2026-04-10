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

let outputHandle = null;
let previewRequestId = 0;
let previewObjectUrl = null;
let previewController = null;

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

function showPreview(blob) {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
  }

  previewObjectUrl = URL.createObjectURL(blob);
  previewImage.src = previewObjectUrl;
  previewImage.classList.add("is-visible");
  previewEmpty.hidden = true;
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
  refreshPreview();
});

methodSelect.addEventListener("change", refreshPreview);
backgroundInput.addEventListener("change", refreshPreview);

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
