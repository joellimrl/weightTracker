# weightTracker

Static GitHub Pages site that reads weight data from a public CSV (e.g. a published Google Sheet).

## Data source
The CSV URL is configured in [app.js](app.js) as `CSV_URL`.

The CSV should be publicly accessible (no auth) and include:
- A date/timestamp column (header containing `date` or `timestamp`, or as the first column)
- A weight column (header containing `weight`, `lb(s)`, or `kg`, or as the second column)

## GitHub Pages
This repo serves the site from the repository root.

Enable it in GitHub:
- Repo **Settings** → **Pages**
- **Build and deployment** → **Source**: *Deploy from a branch*
- **Branch**: `main` (or your default branch)
- **Folder**: `/ (root)`

After enabling, your site will be available at:
- `https://<owner>.github.io/<repo>/`

## Repo layout
- `index.html`, `app.js`, `style.css`: the static site (served from repo root)
