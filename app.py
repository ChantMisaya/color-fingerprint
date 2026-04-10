from __future__ import annotations

from io import BytesIO
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.utils import secure_filename

from main import SUPPORTED_INPUT_SUFFIXES, parse_rgb, process_image_stream

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/process")
def process_upload():
    upload = request.files.get("image")
    method = request.form.get("method", "average")
    background_value = request.form.get("background", "255,255,255")

    if upload is None or upload.filename == "":
        return jsonify({"error": "Please choose an image file."}), 400

    filename = secure_filename(upload.filename)
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_INPUT_SUFFIXES:
        return jsonify({"error": "Only PNG, JPG, and JPEG files are supported."}), 400

    try:
        background = parse_rgb(background_value)
        final_image = process_image_stream(upload.stream, method=method, background=background)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

    output = BytesIO()
    final_image.save(output, format="PNG")
    output.seek(0)

    download_name = f"{Path(filename).stem}_fingerprint.png"
    return send_file(output, mimetype="image/png", as_attachment=True, download_name=download_name)


if __name__ == "__main__":
    app.run(debug=True)
