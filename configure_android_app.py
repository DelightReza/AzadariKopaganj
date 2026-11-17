#!/usr/bin/env python3
"""
Configures the Capacitor Android project for Azadari Kopaganj:
- App Name: Azadari Kopaganj
- Package Name: com.azadari.kopaganj
- Launcher Icons: Applies logo.png / logo.svg and adaptive icon logo.xml across all mipmap densities
- Versioning & Signing: Injects versionCode, versionName, and release signingConfigs into android/app/build.gradle
"""

import os
import re
import shutil
from pathlib import Path

APP_NAME = "Azadari Kopaganj"
PACKAGE_ID = "com.azadari.kopaganj"

MIPMAP_SIZES = {
    "mipmap-mdpi": (48, 108),
    "mipmap-hdpi": (72, 162),
    "mipmap-xhdpi": (96, 216),
    "mipmap-xxhdpi": (144, 324),
    "mipmap-xxxhdpi": (192, 432),
}


def find_asset(candidates: list[str]) -> Path | None:
    for rel in candidates:
        p = Path(rel)
        if p.is_file():
            return p
    return None


def update_strings_xml(res_dir: Path) -> None:
    strings_xml = res_dir / "values" / "strings.xml"
    strings_xml.parent.mkdir(parents=True, exist_ok=True)
    content = f"""<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">{APP_NAME}</string>
    <string name="title_activity_main">{APP_NAME}</string>
    <string name="package_name">{PACKAGE_ID}</string>
    <string name="custom_url_scheme">{PACKAGE_ID}</string>
</resources>
"""
    strings_xml.write_text(content, encoding="utf-8")
    print(f"[configure_android_app] Updated {strings_xml} with app_name='{APP_NAME}' and package='{PACKAGE_ID}'")


def update_adaptive_icons(res_dir: Path) -> None:
    logo_png = find_asset(["logo.png", "public/logo.png", "public/pwa-512x512.png", "public/azadari-logo.png"])
    logo_xml = find_asset(["logo.xml", "public/logo.xml"])

    # 1. Configure ic_launcher_background color
    bg_xml = res_dir / "values" / "ic_launcher_background.xml"
    bg_xml.parent.mkdir(parents=True, exist_ok=True)
    bg_xml.write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
""",
        encoding="utf-8",
    )

    # 2. Configure adaptive icon XML in mipmap-anydpi-v26
    anydpi_dir = res_dir / "mipmap-anydpi-v26"
    anydpi_dir.mkdir(parents=True, exist_ok=True)
    adaptive_xml_content = (
        logo_xml.read_text(encoding="utf-8")
        if logo_xml
        else """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"""
    )
    (anydpi_dir / "ic_launcher.xml").write_text(adaptive_xml_content, encoding="utf-8")
    (anydpi_dir / "ic_launcher_round.xml").write_text(adaptive_xml_content, encoding="utf-8")
    print(f"[configure_android_app] Installed adaptive icon XML into {anydpi_dir}")

    if not logo_png:
        print("[configure_android_app] Warning: logo.png not found; skipping mipmap PNG generation")
        return

    # 3. Generate resized mipmap PNGs
    try:
        from PIL import Image, ImageDraw

        src_img = Image.open(logo_png).convert("RGBA")
        for folder, (legacy_px, fg_px) in MIPMAP_SIZES.items():
            out_dir = res_dir / folder
            out_dir.mkdir(parents=True, exist_ok=True)

            # Square legacy launcher icon on white background
            legacy_canvas = Image.new("RGBA", (legacy_px, legacy_px), (255, 255, 255, 255))
            pad = int(legacy_px * 0.08)
            inner_size = legacy_px - 2 * pad
            resized_legacy = src_img.copy()
            resized_legacy.thumbnail((inner_size, inner_size), Image.Resampling.LANCZOS)
            ox = (legacy_px - resized_legacy.width) // 2
            oy = (legacy_px - resized_legacy.height) // 2
            legacy_canvas.paste(resized_legacy, (ox, oy), resized_legacy)
            legacy_canvas.save(out_dir / "ic_launcher.png", format="PNG")

            # Round legacy launcher icon
            round_canvas = Image.new("RGBA", (legacy_px, legacy_px), (0, 0, 0, 0))
            mask = Image.new("L", (legacy_px, legacy_px), 0)
            draw = ImageDraw.Draw(mask)
            draw.ellipse((0, 0, legacy_px - 1, legacy_px - 1), fill=255)
            round_canvas.paste(legacy_canvas, (0, 0), mask)
            round_canvas.save(out_dir / "ic_launcher_round.png", format="PNG")

            # Adaptive foreground icon (108dp canvas with 66dp safe zone in center)
            fg_canvas = Image.new("RGBA", (fg_px, fg_px), (0, 0, 0, 0))
            safe_px = int(fg_px * 0.62)
            resized_fg = src_img.copy()
            resized_fg.thumbnail((safe_px, safe_px), Image.Resampling.LANCZOS)
            fx = (fg_px - resized_fg.width) // 2
            fy = (fg_px - resized_fg.height) // 2
            fg_canvas.paste(resized_fg, (fx, fy), resized_fg)
            fg_canvas.save(out_dir / "ic_launcher_foreground.png", format="PNG")

        print(f"[configure_android_app] Generated mipmap icons from {logo_png} using Pillow")
    except Exception as exc:
        print(f"[configure_android_app] Pillow resize fallback ({exc}); copying {logo_png} directly")
        for folder in MIPMAP_SIZES:
            out_dir = res_dir / folder
            out_dir.mkdir(parents=True, exist_ok=True)
            for name in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
                shutil.copyfile(logo_png, out_dir / name)


def update_build_gradle(app_build_gradle: Path) -> None:
    if not app_build_gradle.is_file():
        return
    version_code = os.environ.get("INPUT_VERSION_CODE", "1").strip() or "1"
    version_name = os.environ.get("INPUT_VERSION_NAME", "1.0.0").strip() or "1.0.0"

    text = app_build_gradle.read_text(encoding="utf-8")
    text = re.sub(r'namespace\s+["\'][^"\']+["\']', f'namespace "{PACKAGE_ID}"', text)
    text = re.sub(r'applicationId\s+["\'][^"\']+["\']', f'applicationId "{PACKAGE_ID}"', text)
    text = re.sub(r'versionCode\s+\d+', f'versionCode {version_code}', text)
    text = re.sub(r'versionName\s+["\'][^"\']+["\']', f'versionName "{version_name}"', text)

    signing_config_dsl = """    signingConfigs {
        release {
            if (System.getenv("RELEASE_STORE_FILE")) {
                storeFile file(System.getenv("RELEASE_STORE_FILE"))
                storePassword System.getenv("RELEASE_STORE_PASSWORD")
                keyAlias System.getenv("RELEASE_KEY_ALIAS")
                keyPassword System.getenv("RELEASE_KEY_PASSWORD")
                v1SigningEnabled true
                v2SigningEnabled true
            }
        }
    }
    buildTypes {"""

    if "signingConfigs" not in text and "buildTypes {" in text:
        text = text.replace("buildTypes {", signing_config_dsl, 1)
        text = re.sub(
            r'(buildTypes\s*\{\s*release\s*\{)',
            r'\1\n            signingConfig signingConfigs.release',
            text,
            count=1,
        )

    app_build_gradle.write_text(text, encoding="utf-8")
    print(
        f"[configure_android_app] Configured {app_build_gradle} "
        f"(pkg={PACKAGE_ID}, versionName={version_name}, versionCode={version_code})"
    )


def main() -> None:
    android_dir = Path("android")
    if not android_dir.is_dir():
        print("[configure_android_app] android/ directory not found")
        return

    res_dir = android_dir / "app" / "src" / "main" / "res"
    update_strings_xml(res_dir)
    update_adaptive_icons(res_dir)
    update_build_gradle(android_dir / "app" / "build.gradle")


if __name__ == "__main__":
    main()
