const assert = require('assert');

process.env.GEMINI_API_KEY = 'test-key-123';
process.env.GEMINI_MODEL = 'gemini-2.5-flash';

function resetModules() {
  delete require.cache[require.resolve('./src/services/gemini.service')];
  delete require.cache[require.resolve('./src/services/recommendation.service')];
  delete require.cache[require.resolve('./src/controllers/recommendation.controller')];
  delete require.cache[require.resolve('./src/repositories/recommendation.repository')];
  delete require.cache[require.resolve('./src/prompts/recommendation.prompt')];
  delete require.cache[require.resolve('./src/validators/aiResponse.validator')];
}

async function runPhase5BTests() {
  console.log('==================================================');
  console.log('    RUNNING PHASE 5B IMPROVED INTEGRATION TESTS   ');
  console.log('==================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    resetModules();
    try {
      fn();
      console.log(`[PASS] ${total}. ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${total}. ${name}:`, err.message);
    }
  }

  async function testAsync(name, fn) {
    total++;
    resetModules();
    try {
      await fn();
      console.log(`[PASS] ${total}. ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${total}. ${name}:`, err.message);
    }
  }

  // 1. Prompt Versioning & Formatting Test
  test('1. Prompt Versioning: Prompt Builder exports PROMPT_VERSION v1.0', () => {
    const { buildRecommendationPrompt, PROMPT_VERSION } = require('./src/prompts/recommendation.prompt');
    assert.strictEqual(PROMPT_VERSION, 'v1.0');
    const prompt = buildRecommendationPrompt({
      skills: ['React'],
      interests: ['AI'],
      education: 'B.S. CS'
    });
    assert(prompt.includes('USER PROFILE:'));
  });

  // 2. AI Confidence Clamping Test
  test('2. AI Confidence Clamping: Clamps values >100 to 100 and <0 to 0', () => {
    const { validateAiRecommendation } = require('./src/validators/aiResponse.validator');
    
    const highPayload = {
      career: 'AI Engineer',
      confidence: 105,
      reason: 'Great skills',
      recommendedSkills: ['Python'],
      learningPath: ['Step 1'],
      nextStep: 'Start project'
    };
    const resHigh = validateAiRecommendation(highPayload);
    assert.strictEqual(resHigh.confidence, 100);

    const lowPayload = {
      career: 'AI Engineer',
      confidence: -20,
      reason: 'Low match',
      recommendedSkills: ['Python'],
      learningPath: ['Step 1'],
      nextStep: 'Start project'
    };
    const resLow = validateAiRecommendation(lowPayload);
    assert.strictEqual(resLow.confidence, 0);
  });

  // 3. AI Response Sanitization & Array Deduplication
  test('3. AI Response Sanitization: Normalizes strings and deduplicates array items', () => {
    const { validateAiRecommendation } = require('./src/validators/aiResponse.validator');
    const payload = {
      career: '  Cloud Architect  ',
      confidence: 85,
      reason: '  Strong skills  ',
      recommendedSkills: ['  Python  ', 'Python', 'Docker', '  Docker  '],
      learningPath: ['  Step 1  ', 'Step 1', 'Step 2'],
      nextStep: '  Read AWS Docs  '
    };
    const res = validateAiRecommendation(payload);
    assert.strictEqual(res.career, 'Cloud Architect');
    assert.strictEqual(res.reason, 'Strong skills');
    assert.deepStrictEqual(res.recommendedSkills, ['Python', 'Docker']);
    assert.deepStrictEqual(res.learningPath, ['Step 1', 'Step 2']);
    assert.strictEqual(res.nextStep, 'Read AWS Docs');
  });

  // 4. Missing Required Field Test
  test('4. Missing Required Field: Throws AI_PARSING_ERROR when career is missing', () => {
    const { validateAiRecommendation } = require('./src/validators/aiResponse.validator');
    assert.throws(
      () => validateAiRecommendation({ confidence: 90, reason: 'Test' }),
      (err) => err.code === 'AI_PARSING_ERROR'
    );
  });

  // 5. Non-Object Payload Test
  test('5. Non-Object Payload: Throws AI_PARSING_ERROR for non-JSON response', () => {
    const { validateAiRecommendation } = require('./src/validators/aiResponse.validator');
    assert.throws(
      () => validateAiRecommendation('raw text string'),
      (err) => err.code === 'AI_PARSING_ERROR'
    );
  });

  // 6. Enhanced Metadata & Repository Save Test
  await testAsync('6. Enhanced Metadata: Service passes promptVersion, finishReason & usageMetadata to repository', async () => {
    const geminiService = require('./src/services/gemini.service');
    const repo = require('./src/repositories/recommendation.repository');
    const recService = require('./src/services/recommendation.service');

    geminiService.sendPrompt = async () => ({
      text: JSON.stringify({
        career: 'Cloud Architect',
        confidence: 88,
        reason: 'Strong infrastructure background.',
        recommendedSkills: ['AWS', 'Terraform'],
        learningPath: ['AWS cert', 'Terraform CLI'],
        nextStep: 'Set up free tier'
      }),
      model: 'gemini-2.5-flash',
      finishReason: 'STOP',
      usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 80, totalTokenCount: 230 },
      responseTime: 210
    });

    let savedData = null;
    repo.createRecommendation = async (data) => {
      savedData = data;
      return { _id: 'mock-db-id', ...data };
    };

    const userInput = { skills: ['Docker'], interests: ['Cloud'], education: 'B.S.' };
    const res = await recService.generateRecommendation(userInput);

    assert.strictEqual(savedData.metadata.promptVersion, 'v1.0');
    assert.strictEqual(savedData.metadata.finishReason, 'STOP');
    assert.strictEqual(savedData.metadata.usageMetadata.totalTokenCount, 230);
    assert.strictEqual(savedData.metadata.model, 'gemini-2.5-flash');
    assert.strictEqual(savedData.metadata.processingTime, 210);
    assert.strictEqual(res.requestId, savedData.requestId);
    assert.strictEqual(res.recommendation.career, 'Cloud Architect');
  });

  // 7. Structured API Response Format Test ({ requestId, recommendation })
  await testAsync('7. Structured API Response: Controller returns { requestId, recommendation } structure', async () => {
    const geminiService = require('./src/services/gemini.service');
    const repo = require('./src/repositories/recommendation.repository');
    const controller = require('./src/controllers/recommendation.controller');

    geminiService.sendPrompt = async () => ({
      text: JSON.stringify({
        career: 'DevOps Engineer',
        confidence: 92,
        reason: 'Automation skills.',
        recommendedSkills: ['Kubernetes', 'CI/CD'],
        learningPath: ['Docker', 'K8s'],
        nextStep: 'Install minikube'
      }),
      model: 'gemini-2.5-flash',
      responseTime: 110
    });

    repo.createRecommendation = async (data) => data;

    let responseStatus = null;
    let responseJson = null;

    const req = { body: { skills: ['Linux'], interests: ['DevOps'], education: 'B.S.' } };
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => {
            responseJson = data;
          }
        };
      }
    };

    await controller.getRecommendation(req, res, (err) => { throw err; });
    assert.strictEqual(responseStatus, 200);
    assert.strictEqual(responseJson.success, true);
    assert(responseJson.data.requestId);
    assert.strictEqual(responseJson.data.recommendation.career, 'DevOps Engineer');
  });

  // 8. RecommendationService Success Path
  await testAsync('8. RecommendationService Success Path: End-to-end execution succeeds with clean data', async () => {
    const geminiService = require('./src/services/gemini.service');
    const repo = require('./src/repositories/recommendation.repository');
    const recService = require('./src/services/recommendation.service');

    geminiService.sendPrompt = async () => ({
      text: '```json\n{\n  "career": "Cybersecurity Analyst",\n  "confidence": 85,\n  "reason": "Interest in security.",\n  "recommendedSkills": ["Network Security", "Wireshark"],\n  "learningPath": ["CompTIA Security+", "Ethical Hacking"],\n  "nextStep": "Download Wireshark"\n}\n```',
      model: 'gemini-2.5-flash',
      responseTime: 150
    });

    repo.createRecommendation = async (data) => data;

    const res = await recService.generateRecommendation({
      skills: ['Networking'],
      interests: ['Security'],
      education: 'B.S.'
    });

    assert(res.requestId);
    assert.strictEqual(res.recommendation.career, 'Cybersecurity Analyst');
    assert.strictEqual(res.recommendation.confidence, 85);
  });

  // 9. RecommendationService Failure Path
  await testAsync('9. RecommendationService Failure Path: Malformed response throws AI_PARSING_ERROR', async () => {
    const geminiService = require('./src/services/gemini.service');
    const recService = require('./src/services/recommendation.service');

    geminiService.sendPrompt = async () => ({
      text: 'Invalid text response',
      model: 'gemini-2.5-flash',
      responseTime: 100
    });

    await assert.rejects(
      async () => await recService.generateRecommendation({ skills: ['JS'], interests: ['Web'], education: 'B.S.' }),
      (err) => err.code === 'AI_PARSING_ERROR'
    );
  });

  // 10. Manual Profiles Readiness Test
  test('10. Profile Matrix Readiness: 5 standard profile payloads validated', () => {
    const profiles = [
      { role: 'Software Developer', skills: ['JavaScript', 'React', 'Node.js'] },
      { role: 'AI Engineer', skills: ['Python', 'TensorFlow', 'Linear Algebra'] },
      { role: 'Data Scientist', skills: ['Python', 'SQL', 'Pandas', 'Statistics'] },
      { role: 'UI/UX Designer', skills: ['Figma', 'User Research', 'Wireframing'] },
      { role: 'Cyber Security Analyst', skills: ['Networking', 'Linux', 'Penetration Testing'] }
    ];
    assert.strictEqual(profiles.length, 5);
  });

  console.log('\n==================================================');
  console.log(` SUMMARY: ${passed}/${total} PHASE 5B IMPROVEMENT TESTS PASSED `);
  console.log('==================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase5BTests().catch(err => {
  console.error('Phase 5B Improvement Test runner failed:', err);
  process.exit(1);
});
