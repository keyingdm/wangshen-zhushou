"""Package only the distributable extension, with a local dependency inventory."""
import hashlib
import json
from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"
VENDOR = EXTENSION / "vendor"
INVENTORY = VENDOR / "SHA256.json"


def main():
    manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    inventory = [
        {"path": file.relative_to(VENDOR).as_posix(), "bytes": file.stat().st_size,
         "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}
        for file in sorted(VENDOR.rglob("*"))
        if file.is_file() and file != INVENTORY
    ]
    INVENTORY.write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    required = [
        "manifest.json", "panel.html", "options.html", "background.js", "THIRD_PARTY.md",
        "vendor/SHA256.json", "vendor/jszip/LICENSE.markdown", "vendor/pdfjs/LICENSE",
        "vendor/pdfjs/pdf.mjs", "vendor/pdfjs/pdf.worker.mjs", "vendor/ocr/LICENSE.md",
        "vendor/ocr/core/LICENSE", "vendor/ocr/lang/LICENSE",
        "vendor/ocr/lang/chi_sim.traineddata", "vendor/ocr/lang/eng.traineddata",
    ]
    for name in required:
        if not (EXTENSION / name).is_file():
            raise RuntimeError(f"Missing distribution resource: {name}")
    files = [file for file in sorted(EXTENSION.rglob("*")) if file.is_file()]
    for file in files:
        if file.suffix.lower() in {".log", ".pid", ".docx", ".pdf", ".zip", ".pyc"}:
            raise RuntimeError(f"Unexpected distribution file: {file.relative_to(EXTENSION)}")
    output = ROOT / f"网申助手_通用插件_v{manifest['version']}.zip"
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in files:
            archive.write(file, file.relative_to(EXTENSION).as_posix())
    with zipfile.ZipFile(output) as archive:
        if archive.testzip():
            raise RuntimeError("Archive integrity check failed")
        assert json.loads(archive.read("manifest.json"))["version"] == manifest["version"]
        assert set(required).issubset(archive.namelist())
        assert len(archive.namelist()) == len(files)
    print(json.dumps({"package": output.name, "version": manifest["version"],
                      "files": len(files), "vendor_files": len(inventory),
                      "bytes": output.stat().st_size,
                      "sha256": hashlib.sha256(output.read_bytes()).hexdigest()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
