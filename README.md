# News Post System

Turn a Telegram message into a ready-to-post **football news quote card** (1080x1350 design, rendered at 2x = **2160x2700 PNG**).

Send a background image and a caption to your Telegram bot; an n8n workflow builds the card with auto-sized text, highlighted words and an optional circular inset photo, then sends the PNG back to you.

<!-- Add an example image of your own here, e.g. ![Example](docs/example.png). Use images you have the rights to. -->

## Features

- **3 templates:** single photo, circle photo on the left, circle photo on the right
- **Auto-fitting text:** starts large and shrinks to fit (max 3 lines), always centered
- **Yellow highlights:** wrap words in `*asterisks*`
- **Crop control:** choose exactly which part of each photo is shown (`[c:x,y,zoom]`, `[b:x,y,zoom]`) with the included **Crop Picker** (works on a phone)
- **Quality-first:** images are embedded as-is (no recompression), rendered as lossless PNG and sent back as a Telegram *document* so Telegram does not compress it
- **Free to run:** no paid APIs; n8n + Gotenberg + a Telegram bot

## How it works

```
Telegram message (image + caption)
        |
   n8n: Parse Message  ->  Get File  ->  Build HTML  ->  Gotenberg (HTML -> PNG)  ->  Send Document
```

## Requirements

- [n8n](https://n8n.io) (self-hosted, with a public **HTTPS** URL so Telegram can reach the webhook, e.g. ngrok or Cloudflare Tunnel)
- [Docker](https://www.docker.com/) (only for Gotenberg)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Internet access from the Gotenberg container (fonts load from Google Fonts)

## Quick start

1. **Start Gotenberg**
   ```bash
   docker run -d --name gotenberg --restart unless-stopped -p 3000:3000 gotenberg/gotenberg:8 gotenberg --chromium-start-timeout=90s
   ```
   Check `http://localhost:3000/health`. (The first render can be slow while Chromium starts, hence the longer timeout.)
   If port 3000 is taken, use `-p 3001:3000` and change the URL in the **Gotenberg Render** node.

2. **Import the workflow:** n8n -> Workflows -> Import from File -> `n8n/news-post-generator-crop.n8n.json`

3. **Add your Telegram credential** (bot token) to these nodes: *Telegram Trigger*, *Get File*, *Send Reply*, *Send Document*.

4. *(Recommended)* In the **Parse Message** node, set `ALLOWED_CHAT_ID` to your own Telegram chat id so nobody else can use your bot. Do not commit your real id.

5. **Activate** the workflow (toggle *Active* / *Publish*). It must be active, not just test-executed: the two-step circle flow keeps its state in workflow static data, which is not saved in test runs.

6. **Make the webhook reachable.** When n8n runs behind a tunnel, start it with `WEBHOOK_URL` set to the public HTTPS address, for example:
   ```bash
   # Windows PowerShell
   $env:WEBHOOK_URL="https://YOUR-DOMAIN.ngrok-free.app/"
   n8n start
   ```

## Usage

Send the **background image as a file** (or as a photo with *HD* on) with a caption.

| Template | Caption |
|---|---|
| Single | `Author \| quote with *yellow words*` |
| Circle left | `L: Author \| quote with *yellow words*` then send the circle image |
| Circle right | `R: Author \| quote with *yellow words*` then send the circle image |

Optional parts, in any order inside the caption:

- **Instagram caption:** add `||` after the quote, e.g. `Author | quote || Your caption #hashtag` (sent back as the file caption, max 1000 characters)
- **Circle crop:** `[c:45,22,1.4]`
- **Background crop:** `[b:50,40,1]`

Example:
```
L: Jane Doe | I think this is the *best season ever* [c:45,22,1.4] || Match day! #football
```

For the circle templates, the **second message** (the circle image) is sent **without a caption**.

### Crop tags

`[c:x,y,zoom]` is the circle photo, `[b:x,y,zoom]` the background. `x` and `y` are percentages (0-100) of the point in the photo that should be centered; `zoom` is >= 1 (1 = fit, 2 = twice as close). Defaults: circle `50,30,1`, background `50,50,1`.

### Crop Picker

`docs/index.html` is a small static page: load a photo, tap where the circle should be centered, adjust zoom, copy the tag. Everything runs in your browser; photos are never uploaded.
Live version (after enabling GitHub Pages from `/docs`): `https://YOUR-USERNAME.github.io/YOUR-REPO/`

## Image quality tips

- Best: send the image **as a file** (original quality).
- Sending as a regular photo works too; with **HD** on, Telegram keeps up to roughly 2560 px.
- Supported formats: JPG, PNG, WEBP. **HEIC is not supported** when sent as a file (iPhone: send as a normal photo, or set *Settings -> Camera -> Formats -> Most Compatible*).
- Photos smaller than about 2160 px wide will be upscaled and may look soft.

## Troubleshooting

| Problem | Likely cause / fix |
|---|---|
| Bot does not answer | Workflow not active, `WEBHOOK_URL` does not match the tunnel address, or tunnel is down |
| *Gotenberg Render* 500 error | Check `docker logs gotenberg --tail 40`. A "websocket url timeout" means Chromium started too slowly: run Gotenberg with `--chromium-start-timeout=90s` and give Docker enough memory |
| Empty or missing image | Image sent in an unsupported format (e.g. HEIC) or larger than the Telegram Bot API download limit (20 MB) |
| Text looks like a plain font | Fonts could not be loaded; the container needs internet access to Google Fonts |
| Circle image never requested | Caption must start with `L:` or `R:` |
| Replies with the help text | The message had no image, or the caption was empty |

## Limitations

- Fonts (Anton, Montserrat) cover Latin text only; for other scripts choose a different font in the *Build HTML* node.
- A workflow can serve one pending circle-image step per chat at a time.
- Telegram captions are limited to 1024 characters.

## Project structure

```
n8n/news-post-generator-crop.n8n.json   n8n workflow
docs/index.html                         Crop Picker (GitHub Pages source)
scripts/start-all.example.bat           example Windows start script
```

## Security

Never commit: Telegram bot token, API keys, ngrok authtoken, the `.n8n` folder or n8n encryption key, or your personal chat id. Exported workflows reference credentials by name only, but check any HTTP node for hard-coded keys before committing.

## License

Add a license of your choice (for example MIT) or keep all rights reserved.
