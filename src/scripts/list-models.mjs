const apiKey = process.env.GEMINI_API_KEY;

async function listModels() {
  console.log(`Listing models...`);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`, {
      method: 'GET'
    });

    const data = await response.json();
    if (data.error) {
      console.log(`❌ Failed: ${data.error.message}`);
      return;
    }
    console.log(`Available models:`);
    data.models.forEach(m => {
       console.log(`- ${m.name} (supports: ${m.supportedGenerationMethods.join(', ')})`);
    });
  } catch (err) {
    console.log(`❌ Error: ${err.message}`);
  }
}

listModels();
