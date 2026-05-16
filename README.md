# Perfume Formulator

## Overview
A comprehensive perfume raw material library web app with a built-in crawler, search, ABC donut filtering, formula builder, and real-time sync.

## Features
- Crawler to scrape all raw materials from PerfumersWorld.com
- Advanced search with relevance scoring across name, CAS, synonyms, odour, and description
- ABC donut category filtering with quick-filter pills
- Product detail view with odour, usage, applications, and ABC donut bars
- "My Formula" builder sidebar with add/remove, export, and localStorage persistence
- Real-time sync progress bar (non-blocking) — sync without losing your place in the app
- Empty data state with instructions to sync

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/ahmad-ubaidillah/perfume-formulator.git
   cd perfume-formulator
   ```

2. Install dependencies:
   ```bash
   npm install
   cd webapp && npm install && cd ..
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and go to http://localhost:5000

5. Click the **Sync** button to crawl all raw materials from PerfumersWorld.

## Usage

### Search
- Search by material name (exact or partial match)
- Search by CAS number
- Search by synonyms (multi-term matching)
- Search by odor description (partial text match)
- Search by description text (partial text match)

### Filter
- Filter results by ABC donut category (e.g., citrus, floral, woody)
- Quick-filter pills for one-click category selection
- Reset button to clear all filters

### Sync
- Click **Sync** in the navbar to start crawling
- Progress bar shows real-time status without blocking the app
- Expand log to see individual product results

### Formula Builder
- Click **+ Add** on any material to add to your formula
- Open the formula panel to view, remove, or export
- Export as `.txt` file

## Project Structure
```
crawler/
  crawler.js          # Main crawler script

data/
  raw_materials.json  # Collected raw material data
  empty_products.json # Products without raw_material field (non-material items)

webapp/
  public/
    index.html        # Main HTML file
    app.js            # Frontend JavaScript
    style.css         # CSS styles

  server.js           # Express.js server
  package.json        # Webapp dependencies
```

## Scripts
- `npm start` — Start the server (no auto-crawl)
- `npm run crawler` — Run the crawler manually
- `cd webapp && npm start` — Start from webapp directory

## License
MIT
