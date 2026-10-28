# PromptCoach

An AI interview tool for non-technical people who build websites with vibe-coding tools.
The coach interviews the user about their website idea, shows the requirements as a
blueprint to confirm, and writes a precise prompt for tools like Lovable, Bolt or v0.

## Files

- `index.html` – the page structure (header, interview, blueprint, guide editor)
- `css/styles.css` – colours, fonts and layout
- `js/config.js` – interview topics, example ideas and the welcome message (edit these first)
- `js/app.js` – the logic: interview, AI calls, blueprint drawing, prompt generation

## Running it

Open `index.html` in a browser (in IntelliJ: hover over the file and click a browser icon).

The adaptive AI interview uses Claude's artifact runtime (`claude.use("sample")`), which only
exists when the page runs as an artifact on claude.ai. Opened locally, PromptCoach
automatically falls back to asking the guide questions in order and builds the prompt from
a template.
