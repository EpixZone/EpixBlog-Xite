# Epix Blog

Publish your thoughts, uncensored. A decentralized blogging platform on [EpixNet](https://epixnet.io).

## Features

- Rich markdown editor with live preview
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
