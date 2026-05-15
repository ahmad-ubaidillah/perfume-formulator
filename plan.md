# PerfumersWorld Raw Material Library: Project Plan

## Project Vision
Create a comprehensive, searchable library of all raw materials from PerfumersWorld.com with a simple black-and-white web interface. The library will allow users to search by material name, CAS number, synonyms, odor description, or description text, and filter by ABC donut categories.

## Requirements

### Core Features
1. **Complete Crawler**
   - Scrape all raw materials from PerfumersWorld.com
   - Handle pagination across all product pages
   - Extract all available data fields
   - Implement rate limiting and error handling

2. **Simple Black-and-White Web Interface**
   - Clean, minimal design with black text on white background
   - Responsive layout for all devices
   - Fast loading with minimal JavaScript

3. **Advanced Search Functionality**
   - Search by material name (exact or partial match)
   - Search by CAS number
   - Search by synonyms (multi-term matching)
   - Search by odor description (partial text match)
   - Search by description text (partial text match)
   - Case-insensitive search
   - Real-time search results

4. **ABC Donut Filter**
   - Filter results by ABC donut category (e.g., citrus, floral, woody)
   - Display available ABC categories as filter options
   - Show count of products per category
   - Allow multiple category selection

5. **Product Detail View**
   - Display all available information for a selected product
   - Show ABC donut image
   - Include all metadata fields
   - Simple navigation back to search results

### Technical Requirements
- **Data Storage**: JSON file with normalized data structure
- **Crawler**: Node.js with Puppeteer or Cheerio for scraping
- **Backend**: Express.js with REST API
- **Frontend**: HTML, CSS, and minimal JavaScript
- **Deployment**: Docker container with environment variables
- **Scheduling**: Cron job to update data nightly

## Updated Task List

### Phase 1: Project Foundation
- [x] Create README.md with project overview, setup, and contribution guidelines
- [x] Add package.json scripts for development and production
- [ ] Set up ESLint and Prettier for code quality
- [x] Create .gitignore for node_modules, .env, and other temp files
- [x] Initialize git repository

### Phase 2: Data Pipeline
- [x] Create crawler directory and add scraping logic
- [x] Implement scraper to fetch data from PerfumersWorld.com
- [x] Add data transformation pipeline to normalize formats
- [ ] Create validation rules for data integrity
- [x] Implement error handling for failed scrapes
- [ ] Add scheduled job to update data nightly
- [ ] Create data schema documentation

### Phase 3: Backend Development
- [x] Implement Express.js server with API routes
- [x] Create search endpoint with multi-field support
- [x] Implement ABC donut category endpoint
- [x] Add filtering by ABC donut
- [x] Implement product detail endpoint
- [x] Add error handling and validation
- [ ] Set up environment variables

### Phase 4: Frontend Development
- [x] Create simple black-and-white HTML template
- [x] Implement search input with real-time results
- [x] Add ABC donut filter with category selection
- [x] Create product detail page
- [x] Implement responsive design
- [x] Add loading states and error handling

### Phase 5: Enhanced Features
- [ ] Implement search suggestions and autocomplete
- [ ] Add pagination for large result sets
- [ ] Improve loading states and error handling
- [ ] Add mobile-specific optimizations
- [ ] Implement user preferences (dark/light mode, default filters)

### Phase 6: Deployment
- [ ] Create Dockerfile for containerization
- [ ] Set up environment variables and config files
- [ ] Implement production server setup
- [ ] Add monitoring and logging
- [ ] Create deployment scripts
- [ ] Set up CI/CD pipeline

## Immediate Next Steps
1. Create README.md with project description and setup instructions
2. Add development scripts to package.json
3. Set up basic linting and formatting
4. Implement the data crawler to fetch fresh data

## Success Criteria
- All raw materials from PerfumersWorld.com are successfully scraped
- Data is stored in a normalized JSON format
- Web interface is simple, fast, and functional
- Search works across all required fields
- ABC donut filtering works correctly
- Data is updated nightly via scheduled job
- Project is containerized and deployable

This project will become a comprehensive, searchable library of all perfumery raw materials from PerfumersWorld.com with a simple, efficient interface.