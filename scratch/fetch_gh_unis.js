
const fs = require('fs');
const path = require('path');

async function downloadGhanaUniversities() {
  console.log('Fetching Ghanaian universities (local-first approach)...');
  try {
    const response = await fetch('http://universities.hipolabs.com/search?country=ghana');
    if (!response.ok) throw new Error('Failed to fetch from Hipo Labs');
    const data = await response.json();
    
    // Sort by name
    data.sort((a, b) => a.name.localeCompare(b.name));
    
    // Ensure the directory exists
    const outputDir = path.join(__dirname, '..', 'UniGramMobile', 'constants');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, 'gh_universities.json');
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    
    console.log(`Successfully saved ${data.length} universities to ${outputPath}`);
  } catch (error) {
    console.error('Error downloading universities:', error);
  }
}

downloadGhanaUniversities();
