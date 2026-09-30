# Epix Blog

Publish your thoughts, uncensored. A decentralized blogging platform on [EpixNet](https://epixnet.io).

## Features

- Markdown and rich text editing with selection-based formatting controls
- Code syntax highlighting
- Image zoom and optional video embeds
- Per-user comments with xID authentication
- Like/vote system for posts and comments
- Follow subscriptions for updates
- Cloneable — anyone can spin up their own blog
- 8 language translations

## Structure

```
epix18l0gy59ka9ka89wm9mwsspfmkcv9tvf7g0cs6f/
├── index.html
├── content.json
├── dbschema.json          # EpixBlog DB (v2)
├── LICENSE                # MIT
├── css/
│   └── all.css            # Bundled stylesheet
├── alloy-editor/          # WYSIWYG editor
│   ├── all.css
│   └── all.js
├── js/
│   ├── EpixBlog.js        # Main app (extends EpixFrame)
│   ├── Comments.js        # Comment system
│   ├── lib/               # jQuery, EpixFrame, marked, highlight, zoom, identicon
│   └── utils/             # InlineEditor, Meditor, User, Follow, etc.
├── languages/             # de, es, fr, it, nl, pl, pt-br, zh
├── data/
│   └── data.json          # Blog posts and settings
└── data-default/
    ├── data.json           # Template for cloned blogs
    └── users/
        └── content-default.json
```

## Database

- **File:** `data/epixblog.db`
- **Tables:** `post`, `comment`, `comment_vote`, `post_vote`

## Tech Stack

- Vanilla ES6 JavaScript (no build step)
- jQuery + Alloy Editor
- EpixFrame WebSocket bridge
- marked.js + highlight.js
- All JS wrapped in IIFEs

## License

MIT

## Tests

Run the dependency-free loading and login tests with `node --test tests/*.test.cjs`.

The editing browser suite uses the real page and editor libraries with an in-memory EpixFrame file store. It covers grouped saves, cancel/retry behavior, lazy loading, navigation blocking, comment saves, mobile controls, and selection-based formatting in both editor views:

```sh
npm install --prefix /tmp/epixblog-browser-tests playwright
/tmp/epixblog-browser-tests/node_modules/.bin/playwright install chromium
EPIX_BROWSER_TEST_TOOLS=/tmp/epixblog-browser-tests/node_modules node tests/editing-browser.cjs
```

Set `EPIX_BROWSER_TEST_OUTPUT` to a directory to save screenshots.
