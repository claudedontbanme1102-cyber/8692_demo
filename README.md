# Trajectory Repair Demo Site

Bilingual (English root, Chinese under `zh/`) visualization site for a
trajectory-repair study on driving planners: mechanism figures, an interactive
prediction-replay demo over cached real scenes, case galleries, sensitivity
analyses and result tables.

## Layout

- `index.html` — English page (site root)
- `zh/index.html` — Chinese page
- `site.css`, `site.js`, `demo.js`, `data.js` — shared single-source code
- `assets/figs/` — report figures; `assets/demo/` — cached scene frames/poses

## Run locally

```
python -m http.server 8000
```

then open <http://127.0.0.1:8000/>. All paths are relative, so the tree also
works under a sub-path such as GitHub Pages project sites.

## Deployment

Pushing to `main` triggers `.github/workflows/pages.yml`, which uploads the
repository root as a Pages artifact and deploys it via GitHub Actions.
