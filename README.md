# ID verification (static page)

Plain HTML + CSS + jQuery, no build step and no server.

1. Open `index.html` in Chrome or Edge (double-click, or serve the folder with any static host over HTTPS).
2. Click **Start**; when asked, pick this project's `profiles/` folder. Each run saves
   `profiles/<timestamp>/front.webm`, `back.webm`, `face.webm`.
3. Other browsers (Firefox/Safari) can't write to a folder, so the videos are downloaded instead.

Add `?d=5` to the URL to shorten each step to 5 seconds for testing.
