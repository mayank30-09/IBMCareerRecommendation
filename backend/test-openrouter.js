require('dotenv').config();
const openRouterService = require('./src/services/openrouter.service');

async function testOpenRouter() {
  console.log('=== OPENROUTER SERVICE STANDALONE TEST ===');
  console.log(`Provider: ${openRouterService.provider}`);
  console.log(`Model: ${openRouterService.model}`);
  console.log(`Timeout: ${openRouterService.timeoutMs}ms`);

  try {
    const result = await openRouterService.sendPrompt(
      'You are helpful.',
      'Reply with exactly: CareerPilot AI Working'
    );

    console.log('\n--- TEST RESULT ---');
    console.log(`Provider: ${openRouterService.provider}`);
    console.log(`Model: ${result.model}`);
    console.log(`Response Time: ${result.responseTime}ms`);
    console.log(`Returned Text: "${result.text}"`);
    if (result.usageMetadata) {
      console.log(`Usage Metadata: ${JSON.stringify(result.usageMetadata)}`);
    }
  } catch (error) {
    console.log('\n--- TEST ERROR CATCH ---');
    console.log(`Status Code: ${error.statusCode || 500}`);
    console.log(`Error Code: ${error.code || 'UNKNOWN'}`);
    console.log(`Message: ${error.message}`);
  }
}

testOpenRouter();
