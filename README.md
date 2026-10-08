# Audio Blend

Two sounds become two spectrogram layers. Blend them the way you would blend images, with 15 blend modes and 4 boolean modes, and hear the result. What you see is what you hear.

A Maybe Machine by [Ravi Popat](https://ravipopat.info) · [ravipopat.info/maybe-machines](https://ravipopat.info/maybe-machines)

## Use

- Tap A or B to record your voice or upload a sound, or drop a file on them. Each layer loops its first 8 seconds.
- Drag the spectrogram to move layer B in time (sideways) and pitch (up and down).
- Press ? in the app for modes and keyboard shortcuts.

## Run

Static files, no build step: `index.html`, `css/style.css`, `js/engine.js` (sound), `js/app.js` (interface), `fonts/`. Open `index.html` through a local server or, or publish with GitHub Pages (Settings → Pages → Deploy from branch → `main` / root).

Voice recording needs HTTPS (GitHub Pages provides it) and microphone permission.
