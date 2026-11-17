#!/usr/bin/env python3
"""
update_feed.py — Zero-API Full-History YouTube Channel Scraper & Static Manifest Generator
Repository: https://github.com/DelightReza/AzadariKopaganj
Channel: Azadari Kopaganj (UCyCIC43pbujKarf1irIjtrA)

Features:
- Requires NO YouTube Data API v3 keys, NO OAuth login, and NO paid hosting.
- Paginates through ALL historical channel tabs from 2018 to today via YouTube InnerTube:
  * /videos  (all uploaded videos since channel creation in Sep 2018)
  * /streams (all live & past live broadcasts since Nov 2018)
  * /shorts  (all channel shorts)
  * /posts   (all community posts & announcements)
- Also fetches the public YouTube RSS XML feed for exact timestamps on recent uploads.
- Resolves exact publication dates for videos (/youtubei/v1/next) and community posts
  (FEpost_detail) using persistent keep-alive TLS connections and caches resolved dates
  in `assets/YYYY/MM/videos.json` and `assets/YYYY/MM/post.json` so subsequent runs only
  need to query newly added items.
- Detects active live streams reliably via `/streams` + InnerTube `isLive` status and
  updates `assets/livenow.json`.
- Updates `config.json` (single base discovery manifest).
"""

from __future__ import annotations

import calendar
import datetime
import http.client
import json
import re
import sys
import threading
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

CHANNEL_ID = "UCyCIC43pbujKarf1irIjtrA"
CHANNEL_NAME = "Azadari Kopaganj"
CHANNEL_URL = f"https://www.youtube.com/channel/{CHANNEL_ID}"
RSS_URL = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
LIVE_URL = f"https://www.youtube.com/channel/{CHANNEL_ID}/live"

ROOT_DIR = Path(__file__).resolve().parent
ASSETS_DIR = ROOT_DIR / "assets"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
CONSENT_COOKIE = "CONSENT=YES+cb.20210328-17-p0.en+FX+417"
DEFAULT_CLIENT_VERSION = "2.20250201.01.00"

_tls = threading.local()


def get_keepalive_conn() -> http.client.HTTPSConnection:
    conn = getattr(_tls, "conn", None)
    if conn is None:
        conn = http.client.HTTPSConnection("www.youtube.com", timeout=20)
        _tls.conn = conn
    return conn


def reset_keepalive_conn() -> None:
    conn = getattr(_tls, "conn", None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass
    _tls.conn = None


def fetch_url(url: str, timeout: int = 25) -> Optional[str]:
    for attempt in range(3):
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Accept-Language": "en-US,en;q=0.9",
                "Cookie": CONSENT_COOKIE,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            if attempt == 2:
                print(f"[WARN] Failed to fetch {url}: {exc}")
    return None


def innertube_post(path: str, payload: Dict[str, Any]) -> Optional[str]:
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json",
        "Cookie": CONSENT_COOKIE,
        "Connection": "keep-alive",
    }
    for _ in range(3):
        try:
            conn = get_keepalive_conn()
            conn.request("POST", path, body=body, headers=headers)
            resp = conn.getresponse()
            raw = resp.read().decode("utf-8", errors="replace")
            if resp.status == 200 and raw:
                return raw
            reset_keepalive_conn()
        except Exception:
            reset_keepalive_conn()
    return None


def clean_video_title(raw_title: str) -> str:
    cleaned = re.sub(r"^[🔴🟢🟡🔵⚫⚪]+\s*", "", (raw_title or "").strip()).strip()
    cleaned = re.sub(
        r",\s*[\d,.]+\s*(?:thousand|million|billion|[KMB])?\s+views?\s*-\s*play Short.*$",
        "",
        cleaned,
        flags=re.I,
    ).strip()
    return cleaned or "Azadari Kopaganj Broadcast"


def parse_view_count_text(text: str) -> int:
    raw = (text or "").strip()
    if not raw:
        return 0
    m = re.search(r"([\d.,]+)\s*(thousand|million|billion|[KMB])?(?:\s+views?)?", raw, flags=re.I)
    if not m:
        return 0
    try:
        base = float(m.group(1).replace(",", ""))
    except ValueError:
        return 0
    if base <= 0:
        return 0
    unit = (m.group(2) or "").lower()
    if unit in ("thousand", "k"):
        return int(round(base * 1000))
    if unit in ("million", "m"):
        return int(round(base * 1_000_000))
    if unit in ("billion", "b"):
        return int(round(base * 1_000_000_000))
    return int(round(base))


def parse_rss_videos(xml_text: str) -> Dict[str, Dict[str, str]]:
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }
    videos: Dict[str, Dict[str, str]] = {}
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        print(f"[WARN] Failed to parse RSS XML: {exc}")
        return videos

    for entry in root.findall("atom:entry", ns):
        video_id_el = entry.find("yt:videoId", ns)
        title_el = entry.find("atom:title", ns)
        published_el = entry.find("atom:published", ns)

        if video_id_el is None or not video_id_el.text:
            continue

        vid = video_id_el.text.strip()
        raw_title = (title_el.text or "Untitled Video").strip() if title_el is not None else "Untitled Video"
        title = clean_video_title(raw_title)
        published = (
            published_el.text.strip()
            if (published_el is not None and published_el.text)
            else datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        )
        # Normalize +00:00 to Z
        if published.endswith("+00:00"):
            published = published[:-6] + "Z"

        videos[vid] = {
            "id": vid,
            "title": title,
            "youtube_id": vid,
            "published": published,
            "thumbnail": f"https://img.youtube.com/vi/{vid}/hqdefault.jpg",
        }
    return videos


def extract_initial_data(html: str) -> Tuple[Optional[Dict[str, Any]], str]:
    ver_m = re.search(r'"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"', html)
    client_ver = ver_m.group(1) if ver_m else DEFAULT_CLIENT_VERSION
    m = re.search(r"var ytInitialData\s*=\s*(\{.*?\});</script>", html)
    if not m:
        m = re.search(r"ytInitialData\s*=\s*(\{.*?\});", html)
    if not m:
        return None, client_ver
    try:
        return json.loads(m.group(1)), client_ver
    except json.JSONDecodeError:
        return None, client_ver


def scrape_channel_video_tab(tab_slug: str) -> List[Dict[str, Any]]:
    """
    Paginates through a channel video tab ('videos', 'streams', or 'shorts')
    and returns all discovered video items in reverse-chronological order.
    """
    url = f"{CHANNEL_URL}/{tab_slug}?hl=en"
    html = fetch_url(url)
    if not html:
        return []

    data, client_ver = extract_initial_data(html)
    if not data:
        return []

    selected_content: Any = data
    for t in data.get("contents", {}).get("twoColumnBrowseResultsRenderer", {}).get("tabs", []):
        tr = t.get("tabRenderer", {})
        if tr.get("selected"):
            selected_content = tr.get("content", {})
            break

    items: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    visited_tokens: Set[str] = set()

    def extract_step(node: Any) -> List[str]:
        tokens: List[str] = []

        def _walk(n: Any) -> None:
            if isinstance(n, dict):
                if "lockupViewModel" in n:
                    lvm = n["lockupViewModel"]
                    cid = lvm.get("contentId")
                    if isinstance(cid, str) and len(cid) == 11 and cid not in seen_ids:
                        seen_ids.add(cid)
                        md = lvm.get("metadata", {}).get("lockupMetadataViewModel", {})
                        title = md.get("title", {}).get("content") or ""
                        views = 0
                        rows = (
                            md.get("metadata", {})
                            .get("contentMetadataViewModel", {})
                            .get("metadataRows", [])
                        )
                        for row in rows:
                            for part in row.get("metadataParts", []):
                                acc_label = str(part.get("accessibilityLabel") or "")
                                txt_label = str(part.get("text", {}).get("content") or "")
                                if "view" in acc_label.lower() or "view" in txt_label.lower():
                                    views = parse_view_count_text(acc_label or txt_label)
                                    if views > 0:
                                        break
                            if views > 0:
                                break
                        items.append(
                            {
                                "youtube_id": cid,
                                "title": clean_video_title(title),
                                "views": views,
                                "tab": tab_slug,
                            }
                        )
                elif "videoRenderer" in n:
                    vr = n["videoRenderer"]
                    cid = vr.get("videoId")
                    if isinstance(cid, str) and len(cid) == 11 and cid not in seen_ids:
                        seen_ids.add(cid)
                        runs = vr.get("title", {}).get("runs", [])
                        title = "".join(r.get("text", "") for r in runs) or vr.get("title", {}).get("simpleText", "")
                        vc = vr.get("viewCountText", {})
                        svc = vr.get("shortViewCountText", {})
                        vc_text = vc.get("simpleText") or "".join(r.get("text", "") for r in vc.get("runs", []))
                        svc_text = svc.get("simpleText") or "".join(r.get("text", "") for r in svc.get("runs", []))
                        views = parse_view_count_text(vc_text or svc_text)
                        items.append(
                            {
                                "youtube_id": cid,
                                "title": clean_video_title(title),
                                "views": views,
                                "tab": tab_slug,
                            }
                        )
                elif "shortsLockupViewModel" in n:
                    sl = n["shortsLockupViewModel"]
                    cid = (
                        sl.get("onTap", {})
                        .get("innertubeCommand", {})
                        .get("reelWatchEndpoint", {})
                        .get("videoId")
                    )
                    if isinstance(cid, str) and len(cid) == 11 and cid not in seen_ids:
                        seen_ids.add(cid)
                        acc = sl.get("accessibilityText") or ""
                        sec_txt = str(sl.get("overlayMetadata", {}).get("secondaryText", {}).get("content") or "")
                        views_match = re.search(
                            r"([\d,.]+\s*(?:thousand|million|billion|[KMB])?\s*views?)",
                            acc or sec_txt,
                            flags=re.I,
                        )
                        views = parse_view_count_text(views_match.group(1) if views_match else sec_txt)
                        items.append(
                            {
                                "youtube_id": cid,
                                "title": clean_video_title(acc),
                                "views": views,
                                "tab": tab_slug,
                            }
                        )
                if "continuationItemRenderer" in n:
                    s_c = json.dumps(n["continuationItemRenderer"], separators=(",", ":"))
                    for tk in re.findall(r'"token":"([^"]+)"', s_c):
                        if tk not in visited_tokens:
                            tokens.append(tk)
                for v in n.values():
                    _walk(v)
            elif isinstance(n, list):
                for child in n:
                    _walk(child)

        _walk(node)
        return tokens

    next_tokens = extract_step(selected_content)
    pages = 1
    while next_tokens and pages < 200:
        tk = next_tokens[-1]
        visited_tokens.add(tk)
        pages += 1
        payload = {
            "context": {
                "client": {
                    "hl": "en",
                    "gl": "IN",
                    "clientName": "WEB",
                    "clientVersion": client_ver,
                }
            },
            "continuation": tk,
        }
        raw_resp = innertube_post("/youtubei/v1/browse?prettyPrint=false", payload)
        if not raw_resp:
            break
        try:
            resp_json = json.loads(raw_resp)
        except json.JSONDecodeError:
            break
        next_tokens = extract_step(resp_json)

    print(f"[INFO] Scraped /{tab_slug}: {len(items)} videos across {pages} pages")
    return items


def scrape_channel_posts_tab() -> List[Dict[str, Any]]:
    """
    Paginates through the channel /posts tab and returns all raw community posts
    in reverse-chronological order.
    """
    url = f"{CHANNEL_URL}/posts?hl=en"
    html = fetch_url(url)
    if not html:
        return []

    data, client_ver = extract_initial_data(html)
    if not data:
        return []

    selected_content: Any = data
    for t in data.get("contents", {}).get("twoColumnBrowseResultsRenderer", {}).get("tabs", []):
        tr = t.get("tabRenderer", {})
        if tr.get("selected"):
            selected_content = tr.get("content", {})
            break

    raw_posts: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    visited_tokens: Set[str] = set()

    def extract_step(node: Any) -> List[str]:
        tokens: List[str] = []

        def _walk(n: Any) -> None:
            if isinstance(n, dict):
                if "backstagePostRenderer" in n:
                    pr = n["backstagePostRenderer"]
                    pid = pr.get("postId")
                    if isinstance(pid, str) and pid and pid not in seen_ids:
                        seen_ids.add(pid)
                        raw_posts.append(pr)
                if "continuationItemRenderer" in n:
                    s_c = json.dumps(n["continuationItemRenderer"], separators=(",", ":"))
                    for tk in re.findall(r'"token":"([^"]+)"', s_c):
                        if tk not in visited_tokens:
                            tokens.append(tk)
                for v in n.values():
                    _walk(v)
            elif isinstance(n, list):
                for child in n:
                    _walk(child)

        _walk(node)
        return tokens

    next_tokens = extract_step(selected_content)
    pages = 1
    while next_tokens and pages < 200:
        tk = next_tokens[-1]
        visited_tokens.add(tk)
        pages += 1
        payload = {
            "context": {
                "client": {
                    "hl": "en",
                    "gl": "IN",
                    "clientName": "WEB",
                    "clientVersion": client_ver,
                }
            },
            "continuation": tk,
        }
        raw_resp = innertube_post("/youtubei/v1/browse?prettyPrint=false", payload)
        if not raw_resp:
            break
        try:
            resp_json = json.loads(raw_resp)
        except json.JSONDecodeError:
            break
        next_tokens = extract_step(resp_json)

    print(f"[INFO] Scraped /posts: {len(raw_posts)} community posts across {pages} pages")
    return raw_posts


def parse_youtube_date_string(
    date_text: str,
    fallback_dt: datetime.datetime,
) -> datetime.date:
    """
    Parses YouTube date strings such as:
    - 'Sep 17, 2026'
    - 'Streamed live on Oct 26, 2026'
    - 'Premiered Nov 5, 2018'
    - 'Started streaming 9 minutes ago'
    - 'Streamed live 5 hours ago'
    - '2 days ago'
    """
    text = (date_text or "").strip()
    if not text:
        return fallback_dt.date()

    # 1. Explicit 'MMM DD, YYYY' or 'MMMM DD, YYYY'
    m_mdy = re.search(r"([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})", text)
    if m_mdy:
        month_str, day_str, year_str = m_mdy.group(1), m_mdy.group(2), m_mdy.group(3)
        for fmt in ("%b %d %Y", "%B %d %Y"):
            try:
                return datetime.datetime.strptime(f"{month_str} {day_str} {year_str}", fmt).date()
            except ValueError:
                pass

    # 2. Explicit 'DD MMM YYYY'
    m_dmy = re.search(r"(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})", text)
    if m_dmy:
        day_str, month_str, year_str = m_dmy.group(1), m_dmy.group(2), m_dmy.group(3)
        for fmt in ("%d %b %Y", "%d %B %Y"):
            try:
                return datetime.datetime.strptime(f"{day_str} {month_str} {year_str}", fmt).date()
            except ValueError:
                pass

    # 3. ISO 'YYYY-MM-DD'
    m_iso = re.search(r"(\d{4})-(\d{2})-(\d{2})", text)
    if m_iso:
        try:
            return datetime.date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
        except ValueError:
            pass

    # 4. Relative time ('9 minutes ago', '5 hours ago', '3 days ago', '2 weeks ago', '4 months ago', '2 years ago')
    m_rel = re.search(r"(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago", text, flags=re.I)
    if m_rel:
        amount = int(m_rel.group(1))
        unit = m_rel.group(2).lower()
        if unit == "second":
            return (fallback_dt - datetime.timedelta(seconds=amount)).date()
        if unit == "minute":
            return (fallback_dt - datetime.timedelta(minutes=amount)).date()
        if unit == "hour":
            return (fallback_dt - datetime.timedelta(hours=amount)).date()
        if unit == "day":
            return (fallback_dt - datetime.timedelta(days=amount)).date()
        if unit == "week":
            return (fallback_dt - datetime.timedelta(days=amount * 7)).date()
        if unit == "month":
            return (fallback_dt - datetime.timedelta(days=amount * 30)).date()
        if unit == "year":
            return (fallback_dt - datetime.timedelta(days=amount * 365)).date()

    if "stream" in text.lower() or "live" in text.lower():
        return fallback_dt.date()

    return fallback_dt.date()


def fetch_video_next_metadata(video_id: str) -> Dict[str, Any]:
    """
    Calls `/youtubei/v1/next` for a single `video_id` to retrieve:
    - `date_text`: e.g. 'Sep 17, 2026' or 'Streamed live on Nov 5, 2018'
    - `title`: full video title if missing
    - `is_live_now`: True if the video is actively streaming live right now
    """
    payload = {
        "context": {
            "client": {
                "hl": "en",
                "gl": "IN",
                "clientName": "WEB",
                "clientVersion": DEFAULT_CLIENT_VERSION,
            }
        },
        "videoId": video_id,
    }
    raw = innertube_post("/youtubei/v1/next?prettyPrint=false", payload)
    if not raw:
        return {"video_id": video_id, "date_text": "", "title": "", "is_live_now": False}

    m_date = re.search(r'"dateText":\{"simpleText":"([^"]+)"\}', raw)
    if not m_date:
        m_date = re.search(r'"publishDate":\{"simpleText":"([^"]+)"\}', raw)
    date_text = m_date.group(1) if m_date else ""

    m_title = re.search(r'"videoPrimaryInfoRenderer":\{.*?"title":\{"runs":\[\{"text":"([^"]+)"\}', raw)
    title = m_title.group(1) if m_title else ""

    is_live_now = bool(
        re.search(r'"isLive"\s*:\s*true', raw)
        or ("started streaming" in date_text.lower())
    )
    return {
        "video_id": video_id,
        "date_text": date_text,
        "title": title,
        "is_live_now": is_live_now,
    }


def fetch_post_detail_date(post_item: Tuple[str, str]) -> Tuple[str, str]:
    """
    Calls `/youtubei/v1/browse` with `browseId: FEpost_detail` to get the exact
    ISO `publishDate` (e.g. '2022-08-13T10:48:04.947405-07:00') for a community post.
    """
    post_id, browse_params = post_item
    if browse_params:
        payload = {
            "context": {
                "client": {
                    "hl": "en",
                    "gl": "IN",
                    "clientName": "WEB",
                    "clientVersion": DEFAULT_CLIENT_VERSION,
                }
            },
            "browseId": "FEpost_detail",
            "params": browse_params,
        }
        raw = innertube_post("/youtubei/v1/browse?prettyPrint=false", payload)
        if raw:
            m = re.search(r'"publishDate":"(\d{4}-\d{2}-\d{2})[^"]*"', raw)
            if not m:
                m = re.search(r'"datePublished":"(\d{4}-\d{2}-\d{2})[^"]*"', raw)
            if m:
                return post_id, m.group(1)

    # Fallback: fetch /post/<post_id> HTML
    html = fetch_url(f"https://www.youtube.com/post/{post_id}?hl=en")
    if html:
        m = re.search(r'"publishDate":"(\d{4}-\d{2}-\d{2})[^"]*"', html)
        if not m:
            m = re.search(r'"datePublished":"(\d{4}-\d{2}-\d{2})[^"]*"', html)
        if m:
            return post_id, m.group(1)

    return post_id, ""


def parse_community_post_renderer(
    pr: Dict[str, Any],
    exact_date_str: str,
    now_dt: datetime.datetime,
) -> Dict[str, Any]:
    post_id = str(pr.get("postId") or "")
    runs = pr.get("contentText", {}).get("runs", [])
    full_text = "".join(str(r.get("text") or "") for r in runs).strip()

    # Determine date YYYY-MM-DD
    date_yyyy_mm_dd = exact_date_str
    if not date_yyyy_mm_dd:
        pub_runs = pr.get("publishedTimeText", {}).get("runs", [])
        rel_pub = "".join(str(r.get("text") or "") for r in pub_runs).strip()
        parsed_date = parse_youtube_date_string(rel_pub, now_dt)
        date_yyyy_mm_dd = parsed_date.strftime("%Y-%m-%d")

    # Build clean title from first non-empty line of contentText
    lines = [ln.strip() for ln in full_text.splitlines() if ln.strip()]
    if lines:
        first_line = lines[0]
        if first_line.lower() in ("insha allah", "alhamdulillah", "ya ali", "ya husain", "live") and len(lines) > 1:
            title = f"{first_line} — {lines[1]}"
        else:
            title = first_line
        if len(title) > 110:
            title = title[:107].rstrip() + "..."
    else:
        title = f"Azadari Kopaganj Community Update ({date_yyyy_mm_dd})"

    if not full_text:
        full_text = title

    # Extract image_url, images (multi-image), and link_url from backstageAttachment or runs
    image_url = ""
    images_list: List[str] = []
    link_url = ""

    def uncrop_post_image_url(raw_u: str) -> str:
        u_clean = (raw_u or "").strip()
        if not u_clean:
            return ""
        if u_clean.startswith("//"):
            u_clean = "https:" + u_clean
        if re.search(r"(?:yt3\.ggpht\.com|googleusercontent\.com)/", u_clean, flags=re.I):
            u_clean = re.sub(r"=s\d+[^/]*$", "=s0", u_clean, flags=re.I)
        return u_clean

    att = pr.get("backstageAttachment", {})
    if "backstageImageRenderer" in att:
        thumbs = att["backstageImageRenderer"].get("image", {}).get("thumbnails", [])
        if thumbs:
            u = uncrop_post_image_url(str(thumbs[-1].get("url") or ""))
            if u:
                image_url = u
                images_list.append(u)
    elif "postMultiImageRenderer" in att:
        imgs = att["postMultiImageRenderer"].get("images", [])
        for img_item in imgs:
            thumbs = img_item.get("backstageImageRenderer", {}).get("image", {}).get("thumbnails", [])
            if thumbs:
                u = uncrop_post_image_url(str(thumbs[-1].get("url") or ""))
                if u and u not in images_list:
                    images_list.append(u)
        if images_list:
            image_url = images_list[0]
    elif "videoRenderer" in att:
        vr = att["videoRenderer"]
        vid = str(vr.get("videoId") or "")
        if vid:
            image_url = f"https://img.youtube.com/vi/{vid}/hqdefault.jpg"
            link_url = f"https://www.youtube.com/watch?v={vid}"

    # Check if text or runs contain a YouTube video link
    if not link_url:
        for r in runs:
            nav_url = (
                r.get("navigationEndpoint", {})
                .get("commandMetadata", {})
                .get("webCommandMetadata", {})
                .get("url")
                or ""
            )
            m_watch = re.search(r"(?:v=|/shorts/|/live/|youtu\.be/)([a-zA-Z0-9_-]{11})", nav_url)
            if m_watch:
                vid = m_watch.group(1)
                link_url = f"https://www.youtube.com/watch?v={vid}"
                if not image_url:
                    image_url = f"https://img.youtube.com/vi/{vid}/hqdefault.jpg"
                break

    if not link_url:
        link_url = f"https://www.youtube.com/post/{post_id}"

    if image_url.startswith("//"):
        image_url = "https:" + image_url

    payload: Dict[str, Any] = {
        "id": post_id,
        "date": date_yyyy_mm_dd,
        "title": title,
        "text": full_text,
        "image_url": image_url,
        "link_url": link_url,
    }
    if len(images_list) > 1:
        payload["images"] = images_list
    return payload


def extract_yyyy_mm(iso_or_date: str) -> Tuple[str, str]:
    match = re.match(r"^(\d{4})-(\d{2})", (iso_or_date or "").strip())
    if match:
        return match.group(1), match.group(2)
    now = datetime.datetime.now(datetime.timezone.utc)
    return f"{now.year:04d}", f"{now.month:02d}"


def load_json_list(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_existing_archives() -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """
    Loads all existing videos and posts across `assets/YYYY/MM/` so already-resolved
    publication dates and manual community post edits are preserved.
    """
    existing_videos: Dict[str, Dict[str, Any]] = {}
    existing_posts: Dict[str, Dict[str, Any]] = {}
    if not ASSETS_DIR.exists():
        return existing_videos, existing_posts

    for year_dir in ASSETS_DIR.iterdir():
        if not (year_dir.is_dir() and re.match(r"^\d{4}$", year_dir.name)):
            continue
        for month_dir in year_dir.iterdir():
            if not (month_dir.is_dir() and re.match(r"^\d{2}$", month_dir.name)):
                continue
            for v in load_json_list(month_dir / "videos.json"):
                vid = str(v.get("youtube_id") or v.get("id") or "")
                if vid:
                    existing_videos[vid] = v
            for p in load_json_list(month_dir / "post.json"):
                pid = str(p.get("id") or "")
                if pid:
                    existing_posts[pid] = p

    return existing_videos, existing_posts


def main() -> None:
    force_refresh_dates = "--full" in sys.argv
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    existing_videos, existing_posts = load_existing_archives()
    print(
        f"[INFO] Loaded existing archive cache: {len(existing_videos)} videos, {len(existing_posts)} posts"
    )

    # 1. Fetch RSS feed for newest uploads (exact timestamps)
    rss_xml = fetch_url(RSS_URL)
    rss_videos = parse_rss_videos(rss_xml) if rss_xml else {}

    # 2. Scrape all channel video tabs (/videos, /streams, /shorts)
    videos_tab_items = scrape_channel_video_tab("videos")
    streams_tab_items = scrape_channel_video_tab("streams")
    shorts_tab_items = scrape_channel_video_tab("shorts")

    # Combine all unique videos while tracking tab order
    ordered_channel_videos: List[Dict[str, Any]] = []
    seen_vid_ids: Set[str] = set()
    stream_vid_ids: Set[str] = {item["youtube_id"] for item in streams_tab_items}
    short_vid_ids: Set[str] = {item["youtube_id"] for item in shorts_tab_items}

    for source_list in (videos_tab_items, streams_tab_items, shorts_tab_items):
        for item in source_list:
            vid = item["youtube_id"]
            if vid not in seen_vid_ids:
                seen_vid_ids.add(vid)
                ordered_channel_videos.append(item)

    # Also ensure any RSS videos not yet in browse tabs are included at the front
    for vid, rss_item in rss_videos.items():
        if vid not in seen_vid_ids:
            seen_vid_ids.add(vid)
            ordered_channel_videos.insert(
                0,
                {
                    "youtube_id": vid,
                    "title": rss_item["title"],
                    "tab": "rss",
                },
            )

    # Determine which videos need `/youtubei/v1/next` date lookup
    vids_to_lookup: List[str] = []
    # Always check the newest 3 stream items so live status is fresh
    newest_stream_ids = [item["youtube_id"] for item in streams_tab_items[:3]]

    for item in ordered_channel_videos:
        vid = item["youtube_id"]
        if (
            force_refresh_dates
            or vid in newest_stream_ids
            or (vid not in existing_videos and vid not in rss_videos)
        ):
            vids_to_lookup.append(vid)

    print(
        f"[INFO] Total unique channel videos discovered: {len(ordered_channel_videos)} "
        f"(fetching exact dates for {len(vids_to_lookup)} uncached videos...)"
    )

    next_meta_by_id: Dict[str, Dict[str, Any]] = {}
    if vids_to_lookup:
        with ThreadPoolExecutor(max_workers=40) as pool:
            for meta in pool.map(fetch_video_next_metadata, vids_to_lookup):
                next_meta_by_id[meta["video_id"]] = meta

    # Resolve live stream state from newest streams + /live fallback
    live_state: Dict[str, Any] = {"is_live": False, "title": "", "youtube_id": ""}
    for sid in newest_stream_ids:
        meta = next_meta_by_id.get(sid, {})
        if meta.get("is_live_now"):
            stream_title = meta.get("title") or next(
                (x["title"] for x in streams_tab_items if x["youtube_id"] == sid),
                f"{CHANNEL_NAME} Live Stream",
            )
            live_state = {
                "is_live": True,
                "title": clean_video_title(stream_title),
                "youtube_id": sid,
            }
            break

    # Resolve ISO published timestamp for every video
    # For videos published on the same calendar day, assign descending seconds based on list position
    total_vids = max(1, len(ordered_channel_videos))
    all_final_videos: Dict[str, Dict[str, Any]] = dict(existing_videos)

    last_known_date = now_dt.date()
    for idx, item in enumerate(ordered_channel_videos):
        vid = item["youtube_id"]
        meta = next_meta_by_id.get(vid, {})
        title = clean_video_title(
            item.get("title")
            or meta.get("title")
            or existing_videos.get(vid, {}).get("title")
            or ""
        )

        if vid in rss_videos and not force_refresh_dates:
            published_iso = rss_videos[vid]["published"]
            y, m = extract_yyyy_mm(published_iso)
            try:
                last_known_date = datetime.date(int(y), int(m), int(published_iso[8:10]))
            except ValueError:
                pass
        elif vid in existing_videos and not force_refresh_dates and vid not in next_meta_by_id:
            published_iso = str(existing_videos[vid].get("published") or now_iso)
        else:
            date_text = meta.get("date_text", "")
            if date_text:
                cal_date = parse_youtube_date_string(date_text, now_dt)
                last_known_date = cal_date
            else:
                cal_date = last_known_date

            # Deterministic intra-day timestamp that preserves exact channel ordering
            sec_of_day = max(0, min(86399, int(86000 * (total_vids - idx) / total_vids)))
            hh = sec_of_day // 3600
            mm_t = (sec_of_day % 3600) // 60
            ss = sec_of_day % 60
            published_iso = f"{cal_date.strftime('%Y-%m-%d')}T{hh:02d}:{mm_t:02d}:{ss:02d}Z"

        views_val = int(item.get("views") or existing_videos.get(vid, {}).get("views") or 0)
        video_entry: Dict[str, Any] = {
            "id": vid,
            "title": title,
            "youtube_id": vid,
            "published": published_iso,
            "thumbnail": f"https://img.youtube.com/vi/{vid}/hqdefault.jpg",
        }
        if views_val > 0:
            video_entry["views"] = views_val
        if vid in stream_vid_ids:
            video_entry["is_stream"] = True
        if vid in short_vid_ids and vid not in stream_vid_ids:
            video_entry["is_short"] = True

        all_final_videos[vid] = video_entry

    # 3. Scrape all community posts from /posts
    raw_posts = scrape_channel_posts_tab()
    posts_to_lookup: List[Tuple[str, str]] = []
    for pr in raw_posts:
        pid = str(pr.get("postId") or "")
        if not pid:
            continue
        if force_refresh_dates or pid not in existing_posts:
            runs = pr.get("publishedTimeText", {}).get("runs", [])
            browse_params = ""
            if runs:
                browse_params = str(
                    runs[0]
                    .get("navigationEndpoint", {})
                    .get("browseEndpoint", {})
                    .get("params")
                    or ""
                )
            posts_to_lookup.append((pid, browse_params))

    print(
        f"[INFO] Fetching exact publication dates for {len(posts_to_lookup)} uncached community posts..."
    )
    post_dates_by_id: Dict[str, str] = {}
    if posts_to_lookup:
        with ThreadPoolExecutor(max_workers=30) as pool:
            for pid, exact_date in pool.map(fetch_post_detail_date, posts_to_lookup):
                if exact_date:
                    post_dates_by_id[pid] = exact_date

    # Merge scraped community posts with any manual community posts in existing_posts
    all_final_posts: Dict[str, Dict[str, Any]] = dict(existing_posts)
    for pr in raw_posts:
        pid = str(pr.get("postId") or "")
        if not pid:
            continue
        if pid in existing_posts and not force_refresh_dates:
            # Backfill multi-image arrays onto cached posts if missing
            if not existing_posts[pid].get("images"):
                parsed_multi = parse_community_post_renderer(
                    pr, str(existing_posts[pid].get("date") or ""), now_dt
                )
                if parsed_multi.get("images"):
                    existing_posts[pid]["images"] = parsed_multi["images"]
            continue
        exact_date = post_dates_by_id.get(pid, "")
        parsed_post = parse_community_post_renderer(pr, exact_date, now_dt)
        all_final_posts[pid] = parsed_post

    # 4. Partition all videos and posts by (YYYY, MM) and write monthly JSON files
    videos_by_ym: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    posts_by_ym: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    all_months_set: Set[Tuple[str, str]] = set()

    for v in all_final_videos.values():
        ym = extract_yyyy_mm(str(v.get("published") or ""))
        videos_by_ym.setdefault(ym, []).append(v)
        all_months_set.add(ym)

    for p in all_final_posts.values():
        ym = extract_yyyy_mm(str(p.get("date") or ""))
        posts_by_ym.setdefault(ym, []).append(p)
        all_months_set.add(ym)

    month_tuples = sorted(all_months_set, reverse=True)

    video_json_files: List[str] = []
    post_json_files: List[str] = []
    available_months: List[Dict[str, Any]] = []
    latest_video_id = ""
    latest_video_title = ""
    latest_published = ""

    for yyyy, mm in month_tuples:
        v_rel = f"assets/{yyyy}/{mm}/videos.json"
        p_rel = f"assets/{yyyy}/{mm}/post.json"
        v_file = ROOT_DIR / v_rel
        p_file = ROOT_DIR / p_rel

        month_vids = sorted(
            videos_by_ym.get((yyyy, mm), []),
            key=lambda x: str(x.get("published", "")),
            reverse=True,
        )
        month_posts = sorted(
            posts_by_ym.get((yyyy, mm), []),
            key=lambda x: (str(x.get("date", "")), str(x.get("id", ""))),
            reverse=True,
        )

        write_json(v_file, month_vids)
        write_json(p_file, month_posts)

        video_json_files.append(v_rel)
        post_json_files.append(p_rel)

        month_num = int(mm)
        month_name = calendar.month_name[month_num] if 1 <= month_num <= 12 else mm
        available_months.append(
            {
                "month_year": f"{month_name} {yyyy}",
                "yyyy": yyyy,
                "mm": mm,
                "video_count": len(month_vids),
                "videos_path": v_rel,
                "post_path": p_rel,
            }
        )

        for vid in month_vids:
            pub = str(vid.get("published", ""))
            if pub >= latest_published:
                latest_published = pub
                latest_video_id = str(vid.get("youtube_id") or vid.get("id") or "")
                latest_video_title = str(vid.get("title") or "")

    # 5. Write assets/livenow.json and config.json
    write_json(ASSETS_DIR / "livenow.json", live_state)

    popular_candidates = [
        v for v in all_final_videos.values() if not v.get("is_short")
    ] or list(all_final_videos.values())
    popular_sorted = sorted(
        popular_candidates,
        key=lambda x: (int(x.get("views") or 0), str(x.get("published") or "")),
        reverse=True,
    )
    popular_video_ids = [
        str(v.get("youtube_id") or v.get("id")) for v in popular_sorted[:16]
    ]

    config_payload = {
        "version": 1,
        "channel_id": CHANNEL_ID,
        "channel_name": CHANNEL_NAME,
        "channel_url": CHANNEL_URL,
        "rss_url": RSS_URL,
        "live_url": LIVE_URL,
        "last_updated": now_iso,
        "endpoints": {
            "live": "assets/livenow.json",
            "videos_month_template": "assets/{yyyy}/{mm}/videos.json",
            "post_month_template": "assets/{yyyy}/{mm}/post.json",
        },
        "video_json_files": video_json_files,
        "post_json_files": post_json_files,
        "latest_video_id": latest_video_id,
        "latest_video_title": latest_video_title,
        "popular_video_ids": popular_video_ids,
        "is_live": bool(live_state.get("is_live", False)),
        "available_months": available_months,
    }

    write_json(ROOT_DIR / "config.json", config_payload)
    print(
        f"[OK] Synced {len(all_final_videos)} total videos and {len(all_final_posts)} community posts "
        f"across {len(available_months)} months (oldest={month_tuples[-1] if month_tuples else 'N/A'}, "
        f"newest={month_tuples[0] if month_tuples else 'N/A'}, is_live={live_state['is_live']})"
    )


if __name__ == "__main__":
    main()
