const apiKey = process.env.GEMINI_API_KEY;

async function testModel(modelName, apiVersion = 'v1beta') {
  console.log(`Testing ${modelName} on ${apiVersion}...`);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Respond with the word 'JSON' in a JSON object." }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    const data = await response.json();
    if (data.error) {
      console.log(`❌ ${modelName} failed: ${data.error.message}`);
      return false;
    }
    console.log(`✅ ${modelName} works! Response: ${data.candidates[0].content.parts[0].text}`);
    return true;
  } catch (err) {
    console.log(`❌ ${modelName} error: ${err.message}`);
    return false;
  }
}

async function run() {
  const models = [
    { name: 'gemini-1.5-flash', ver: 'v1beta' },
    { name: 'gemini-1.5-flash-latest', ver: 'v1beta' },
    { name: 'gemini-1.5-pro', ver: 'v1beta' },
    { name: 'gemini-1.5-pro-latest', ver: 'v1beta' },
    { name: 'gemini-1.5-flash-8b', ver: 'v1beta' }
  ];

  for (const m of models) {
    await testModel(m.name, m.ver);
    console.log('---');
  }
}

run();
