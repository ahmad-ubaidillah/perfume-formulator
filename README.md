# PerfumersWorld Raw Material Library

## Overview
This project is a comprehensive library of all raw materials from PerfumersWorld.com, with a simple black-and-white web interface. The library allows users to search by material name, CAS number, synonyms, odor description, or description text, and filter by ABC donut categories.

## Features
- Complete crawler to scrape all raw materials from PerfumersWorld.com
- Simple black-and-white web interface
- Advanced search functionality across multiple fields
- ABC donut category filtering
- Product detail view with all metadata

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/perfumersworld-library.git
   cd perfumersworld-library
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the crawler to collect data:
   ```bash
   node crawler/crawler.js
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. Open your browser and go to http://localhost:5000

## Usage

### Search
- Search by material name (exact or partial match)
- Search by CAS number
- Search by synonyms (multi-term matching)
- Search by odor description (partial text match)
- Search by description text (partial text match)

### Filter
- Filter results by ABC donut category (e.g., citrus, floral, woody)
- Display available ABC categories as filter options
- Show count of products per category
- Allow multiple category selection

## Project Structure
```
crawler/
  crawler.js          # Main crawler script
  README.md           # Crawler documentation

data/
  raw_materials.json  # Collected raw material data

webapp/
  public/
    index.html        # Main HTML file
    app.js            # Frontend JavaScript
    style.css         # CSS styles

  server.js           # Express.js server
  package.json        # Project dependencies
  README.md           # Project documentation
```

## Development

### Scripts
- `npm start`: Start the server
- `node crawler/crawler.js`: Run the crawler
- `npm run dev`: Start server in development mode

### Testing
- Unit tests: `npm test`
- E2E tests: `npm run e2e`

## Deployment

### Docker
```bash
# Build image
docker build -t perfumersworld-library .

# Run container
docker run -p 5000:5000 perfumersworld-library
```

### Production
- Use PM2 to manage the server process
- Set up reverse proxy with Nginx
- Implement SSL/TLS encryption

## Contributing
Please read CONTRIBUTING.md for details on our code of conduct, and the process for submitting pull requests to us.

## License
This project is licensed under the MIT License - see the LICENSE file for details.