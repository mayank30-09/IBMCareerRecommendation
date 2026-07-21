require('dotenv').config();
const groqService = require('./src/services/groq.service');

async function testGroq() {
  console.log('=== GROQ SERVICE STANDALONE TEST ===');
  console.log(`Provider: ${groqService.provider}`);
  console.log(`Model: ${groqService.getModel()}`);
  console.log(`Timeout: ${groqService.timeoutMs}ms`);

  try {
    const result = await groqService.sendPrompt(
      'You are helpful.',
      'Reply with JSON: {"message":"CareerPilot AI Working"}'
    );

    console.log('\n--- TEST RESULT ---');
    console.log(`Provider: ${groqService.provider}`);
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

testGroq();
